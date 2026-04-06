import * as vscode from 'vscode';
import * as path from 'path';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
  OrlRuleFixGombocDiagnostic,
} from './gombocDiagnostic';
import {
  GroupedFixesRemediation,
  IndividualFixesRemediation,
  ScanRemediationPayload,
  parseScanRemediationPayload,
} from '../schemas/scanRemediation';
import { DiagnosticCollectionManager } from '../diagnosticCollectionManager';
import { getInfrastructureToolFromFileUri } from '../infrastructureTool';
import { queueOrlFixAppliedEvent } from '../utils/integrationsService';
import { createOrlClient } from '../orl/orlClient';
import { extractRenderableOrlRuleNames } from '../orl/orlRuleNameResolver';
import { detectLanguageFromFile } from '../utils/scanValidator';
import logger from '../utils/logger';
import { parseOrlReport } from '../utils/orlReportParser';

type IndividualFix = IndividualFixesRemediation['fixes'][number] &
  Pick<IndividualFixesRemediation, 'rule'>;

type FixProofCheckovTargetsCacheEntry = {
  workspacePath: string;
  capturedAtMs: number;
  expiresAtMs: number;
  checkIds: string[];
  checkIdsByRule?: Record<string, string[]>;
  evidenceByCheckId?: Record<
    string,
    Array<{ ruleName: string; source: string; key: string }>
  >;
};

export type OrlIssuesSnapshot = {
  scanScope?: { workspacePath: string; language?: string; scannedAt?: string };
  issues: Array<{
    ruleName: string;
    ruleShortName: string;
    ruleDescription: string;
    resourceHeader?: string;
    filePath: string;
    line?: number;
    checkovIds?: string[];
    fixStrategy?: string;
  }>;
};

export class ScanResultsProvider {
  public static codeActionDisposable: vscode.Disposable | undefined;
  private static scanResultsProviderInstance: ScanResultsProvider | null = null;
  private individualRemediations: IndividualFixesRemediation[];
  private groupedRemediations: GroupedFixesRemediation[];
  private orlRuleDescriptions: Record<string, string>;
  private orlRuleShortNames: Record<string, string>;
  private lastOrlScanContext:
    | {
        workspacePath: string;
        language?: string;
        report?: string;
        scannedAt: string;
      }
    | undefined;

  private lastIssuesSnapshot: OrlIssuesSnapshot;
  private readonly issuesDidUpdateEmitter =
    new vscode.EventEmitter<OrlIssuesSnapshot>();
  public readonly onDidUpdateIssues = this.issuesDidUpdateEmitter.event;

  private constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollectionManager: DiagnosticCollectionManager,
  ) {
    this.individualRemediations = [];
    this.groupedRemediations = [];
    this.orlRuleDescriptions = {};
    this.orlRuleShortNames = {};
    this.lastOrlScanContext = undefined;
    this.lastIssuesSnapshot = { issues: [] };
  }

  private static readonly FIXPROOF_CHECKOV_CACHE_KEY =
    'gomboc.fixproof.checkovTargets.v1';
  private static readonly FIXPROOF_CHECKOV_TTL_MS = 30 * 60 * 1000; // 30 minutes

  static init(
    context: vscode.ExtensionContext,
    diagnosticCollectionManager: DiagnosticCollectionManager,
  ) {
    if (this.codeActionDisposable !== undefined) {
      this.codeActionDisposable.dispose();
    }
    if (this.scanResultsProviderInstance === null) {
      this.scanResultsProviderInstance = new ScanResultsProvider(
        context,
        diagnosticCollectionManager,
      );
    }
    return this.scanResultsProviderInstance;
  }

  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyIndividualRemediation',
        fixedResults => {
          this.applyIndividualRemediation(fixedResults);
        },
      ),
    );
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyGroupedRemediation',
        fixedResults => {
          this.applyGroupedRemediation(fixedResults);
        },
      ),
    );
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyOrlRuleRemediation',
        fixedResults => {
          this.applyOrlRuleRemediation(fixedResults);
        },
      ),
    );

    // ORL-only: open a structured AI prompt (for Cursor) and guide FixProof revalidation.
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.openAiFixPrompt',
        (args: {
          ruleName: string;
          filePath: string;
          resourceHeader?: string;
          ruleShortName?: string;
          ruleDescription?: string;
        }) => {
          this.openAiFixPrompt(args).catch(err => {
            logger.error('Failed to open AI fix prompt', {
              err: err instanceof Error ? err.message : String(err),
            });
            vscode.window.showErrorMessage(
              `Failed to open AI fix prompt: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
      ),
    );
  }

  private stripOrlInstanceSuffix(ruleName: string): string {
    if (!ruleName || typeof ruleName !== 'string') {
      return ruleName;
    }
    const m = ruleName.match(/^(.*?)(\d{3})$/);
    if (!m) {
      return ruleName;
    }
    const base = m[1] ?? '';
    if (!base) {
      return ruleName;
    }
    const prev = base[base.length - 1];
    if (prev && /[0-9]/.test(prev)) {
      return ruleName;
    }
    return base;
  }

  private getRenderableOrlRuleNames(rule: any): string[] {
    return extractRenderableOrlRuleNames(rule);
  }

  private getFixSummaryCount(diagnosticTotal: number): number {
    if (diagnosticTotal > 0) {
      return diagnosticTotal;
    }
    if (this.individualRemediations.length > 0) {
      return this.individualRemediations.length;
    }
    return this.groupedRemediations.length;
  }

  private extractCheckovIdsFromAnnotations(annotations: any): string[] {
    const out = new Set<string>();
    if (!annotations || typeof annotations !== 'object') {
      return [];
    }
    const validIdRe = /^(CKV|BC)_[A-Z0-9_]+$/;
    const splitIds = (raw: unknown): string[] => {
      if (typeof raw !== 'string') {
        return [];
      }
      return raw
        .split(/[\s,]+/g)
        .map(x => x.trim().toUpperCase())
        .filter(Boolean)
        .filter(x => validIdRe.test(x));
    };
    for (const id of splitIds(annotations['gomboc-ai/checkov/id'])) {
      out.add(id);
    }
    // optional plural form
    for (const id of splitIds(annotations['gomboc-ai/checkov-ids'])) {
      out.add(id);
    }
    return Array.from(out).sort();
  }

  private buildAiPromptMarkdown(args: {
    workspacePath: string;
    ruleName: string;
    filePath: string;
    resourceHeader?: string;
    ruleShortName?: string;
    ruleDescription?: string;
    fixStrategy?: string;
    fixTask?: string;
    checkovIds?: string[];
  }): string {
    const {
      workspacePath,
      ruleName,
      filePath,
      resourceHeader,
      ruleShortName,
      ruleDescription,
      fixStrategy,
      fixTask,
      checkovIds,
    } = args;

    const title = ruleShortName || ruleName;
    const checkList = (checkovIds || []).length
      ? (checkovIds || []).map(id => `- ${id}`).join('\n')
      : '- (none found)';

    const taskBody = fixTask
      ? `### Task\n\n${fixTask}\n\n`
      : '### Task\n\nImplement a safe fix for this finding. Keep changes minimal and avoid altering unrelated behavior.\n\n';

    return `# AI Fix Prompt (validated)\n\n## Context\n- **Rule**: \`${ruleName}\`\n- **Fix strategy**: \`${fixStrategy || 'unknown'}\`\n- **File**: \`${filePath}\`\n- **Resource**: ${resourceHeader ? `\`${resourceHeader}\`` : '(unknown)'}\n\n## Rule description\n${ruleDescription ? ruleDescription : '(no description available)'}\n\n## Related Checkov IDs\n${checkList}\n\n${taskBody}## After you apply the fix\n1. Run **Gomboc: Third Party Compare – Verify targeted Checkov checks (Docker)**.\n2. Run **Gomboc: Scan current file or scenario** again to confirm the finding is gone.\n`;
  }

  /**
   * ORL-only: open a generated Markdown prompt for AI-assisted fixes.
   * We copy it to clipboard and open it in an editor so the user can run it in Cursor.
   */
  public async openAiFixPrompt(args: {
    ruleName: string;
    filePath: string;
    resourceHeader?: string;
    ruleShortName?: string;
    ruleDescription?: string;
    fixTask?: string;
  }): Promise<void> {
    const ruleNameRaw = (args.ruleName || '').trim();
    const filePath = (args.filePath || '').trim();
    if (!ruleNameRaw || !filePath) {
      vscode.window.showErrorMessage(
        'AI fix prompt: missing ruleName or filePath',
      );
      return;
    }

    const last = this.getLastOrlScanContext();
    const workspacePath =
      last?.workspacePath ||
      (filePath ? path.dirname(filePath) : undefined) ||
      '';
    const reportText = last?.report;

    let fixStrategy: string | undefined = undefined;
    let fixTask: string | undefined = args.fixTask;
    let checkovIds: string[] | undefined = undefined;

    try {
      const parsed = parseOrlReport(reportText);
      const rules = (parsed as any)?.spec?.rules;
      if (Array.isArray(rules)) {
        const base = this.stripOrlInstanceSuffix(ruleNameRaw);
        const wanted = new Set([ruleNameRaw, base]);
        const hit = rules.find((r: any) => {
          const n: string | undefined =
            (typeof r?.name === 'string' && r.name.trim()) ||
            (typeof r?.metadata?.name === 'string' && r.metadata.name.trim()) ||
            undefined;
          if (!n) {
            return false;
          }
          const nb = this.stripOrlInstanceSuffix(n);
          return wanted.has(n) || wanted.has(nb);
        });
        const annotations =
          hit?.metadata?.annotations &&
          typeof hit.metadata.annotations === 'object'
            ? hit.metadata.annotations
            : undefined;
        if (annotations) {
          fixStrategy =
            typeof annotations['gomboc-ai/fix-strategy'] === 'string'
              ? String(annotations['gomboc-ai/fix-strategy'])
              : undefined;
          if (!fixTask) {
            fixTask =
              typeof annotations['gomboc-ai/fix-task'] === 'string'
                ? String(annotations['gomboc-ai/fix-task']).trim()
                : undefined;
          }
          checkovIds = this.extractCheckovIdsFromAnnotations(annotations);
        }
      }
    } catch (e) {
      // Ignore: prompt generation still works without report metadata.
      logger.debug(
        'AI fix prompt: failed to parse ORL report metadata (ignored)',
        {
          e: e instanceof Error ? e.message : String(e),
        },
      );
    }

    const markdown = this.buildAiPromptMarkdown({
      workspacePath,
      ruleName: ruleNameRaw,
      filePath,
      resourceHeader: args.resourceHeader,
      ruleShortName: args.ruleShortName,
      ruleDescription: args.ruleDescription,
      fixStrategy,
      fixTask,
      checkovIds,
    });

    // Copy to clipboard for easy paste into Cursor Chat.
    try {
      await vscode.env.clipboard.writeText(markdown);
    } catch {
      // ignore
    }

    // Open in an editor for visibility.
    const doc = await vscode.workspace.openTextDocument({
      content: markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    const choice = await vscode.window.showInformationMessage(
      'AI fix prompt opened and copied to clipboard. After applying edits (in Cursor), run Third Party Compare (targeted Checkov).',
      { modal: false },
      'Run Third Party Compare',
    );
    if (choice === 'Run Third Party Compare') {
      vscode.commands
        .executeCommand('gomboc-vscode-extension.fixProofCheckovVerify')
        .then(
          () => {},
          () => {},
        );
    }
  }

  public generateComments(remediations: unknown) {
    let parsedRemediations: ScanRemediationPayload;
    try {
      parsedRemediations = parseScanRemediationPayload(remediations);
    } catch (error) {
      logger.error('Invalid ORL remediation payload', {
        error: error instanceof Error ? error.message : String(error),
      });
      vscode.window.showWarningMessage(
        'Received invalid ORL remediation payload. No fixes were loaded.',
      );
      this.individualRemediations = [];
      this.groupedRemediations = [];
      this.orlRuleDescriptions = {};
      this.orlRuleShortNames = {};
      return;
    }

    this.individualRemediations = parsedRemediations.individualFixes;
    this.groupedRemediations = parsedRemediations.groupedFixes;
    this.orlRuleDescriptions =
      parsedRemediations?.orlRuleDescriptions &&
      typeof parsedRemediations.orlRuleDescriptions === 'object'
        ? (parsedRemediations.orlRuleDescriptions as Record<string, string>)
        : {};
    this.orlRuleShortNames =
      parsedRemediations?.orlRuleShortNames &&
      typeof parsedRemediations.orlRuleShortNames === 'object'
        ? (parsedRemediations.orlRuleShortNames as Record<string, string>)
        : {};
  }

  /**
   * Best-effort persistence of the last ORL scan context so FixProof-style post-scan
   * verification steps (e.g. targeted Checkov revalidation) can reuse the same scope.
   */
  public setLastOrlScanContext(args: {
    workspacePath: string;
    language?: string;
    report?: string;
  }) {
    this.lastOrlScanContext = {
      workspacePath: args.workspacePath,
      language: args.language,
      report: args.report,
      scannedAt: new Date().toISOString(),
    };
  }

  public getLastOrlScanContext():
    | {
        workspacePath: string;
        language?: string;
        report?: string;
        scannedAt: string;
      }
    | undefined {
    return this.lastOrlScanContext;
  }

  public getCurrentIssuesSnapshot(): OrlIssuesSnapshot {
    // Always return a stable object shape for the webview.
    const last = this.getLastOrlScanContext();
    const scanScope = last
      ? {
          workspacePath: last.workspacePath,
          language: last.language,
          scannedAt: last.scannedAt,
        }
      : undefined;
    return {
      scanScope,
      issues: Array.isArray(this.lastIssuesSnapshot?.issues)
        ? this.lastIssuesSnapshot.issues
        : [],
    };
  }

  private buildOrlRuleMetaIndex(): Map<
    string,
    { fixStrategy?: string; fixTask?: string; checkovIds: string[] }
  > {
    const out = new Map<
      string,
      { fixStrategy?: string; fixTask?: string; checkovIds: string[] }
    >();
    const reportText = this.getLastOrlScanContext()?.report;
    if (!reportText) {
      return out;
    }
    try {
      const parsed = parseOrlReport(reportText);
      const rules = (parsed as any)?.spec?.rules;
      if (!Array.isArray(rules)) {
        return out;
      }
      for (const r of rules) {
        const n: string | undefined =
          (typeof r?.name === 'string' && r.name.trim()) ||
          (typeof r?.metadata?.name === 'string' && r.metadata.name.trim()) ||
          undefined;
        if (!n) {
          continue;
        }
        const base = this.stripOrlInstanceSuffix(n);
        const annotations =
          r?.metadata?.annotations && typeof r.metadata.annotations === 'object'
            ? r.metadata.annotations
            : undefined;
        const fixStrategy =
          annotations &&
          typeof annotations['gomboc-ai/fix-strategy'] === 'string'
            ? String(annotations['gomboc-ai/fix-strategy'])
            : undefined;
        const fixTask =
          annotations && typeof annotations['gomboc-ai/fix-task'] === 'string'
            ? String(annotations['gomboc-ai/fix-task']).trim()
            : undefined;
        const checkovIds = annotations
          ? this.extractCheckovIdsFromAnnotations(annotations)
          : [];
        const payload = { fixStrategy, fixTask, checkovIds };
        if (!out.has(n)) {
          out.set(n, payload);
        }
        if (base && !out.has(base)) {
          out.set(base, payload);
        }
      }
    } catch (e) {
      // Ignore: snapshot still works without report metadata.
      logger.debug('Issues snapshot: failed to parse ORL report metadata', {
        e: e instanceof Error ? e.message : String(e),
      });
    }
    return out;
  }

  private pruneFixProofCheckovCache(
    cache: Record<string, FixProofCheckovTargetsCacheEntry>,
  ): {
    pruned: Record<string, FixProofCheckovTargetsCacheEntry>;
    changed: boolean;
  } {
    const now = Date.now();
    let changed = false;
    const out: Record<string, FixProofCheckovTargetsCacheEntry> = {};
    for (const [k, v] of Object.entries(cache || {})) {
      if (!v || typeof v !== 'object') {
        changed = true;
        continue;
      }
      if (
        typeof v.expiresAtMs !== 'number' ||
        !Number.isFinite(v.expiresAtMs)
      ) {
        changed = true;
        continue;
      }
      if (v.expiresAtMs <= now) {
        changed = true;
        continue;
      }
      if (!Array.isArray(v.checkIds) || v.checkIds.length === 0) {
        changed = true;
        continue;
      }
      out[k] = v;
    }
    return { pruned: out, changed };
  }

  /**
   * Cache FixProof Checkov targets for a given scan scope (`workspacePath`).
   *
   * Semantics:
   * - TTL is 30 minutes (sliding) so the cache clears after inactivity.
   * - The set of `checkIds` is **additive** (monotonic): new scans only add IDs; never remove.
   * - Evidence maps are merged best-effort.
   *
   * Important:
   * - Passing an empty list does NOT clear/replace existing IDs.
   * - Use `touchFixProofCheckovTargets` to extend TTL without adding IDs.
   */
  public async cacheFixProofCheckovTargets(args: {
    workspacePath: string;
    checkIds: string[];
    checkIdsByRule?: Record<string, string[]>;
    evidenceByCheckId?: Record<
      string,
      Array<{ ruleName: string; source: string; key: string }>
    >;
  }): Promise<void> {
    const workspacePath = (args.workspacePath || '').trim();
    if (!workspacePath) {
      return;
    }
    const incomingIds = Array.isArray(args.checkIds) ? args.checkIds : [];

    const raw = this.context.globalState.get(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
    ) as unknown;
    const current: Record<string, FixProofCheckovTargetsCacheEntry> =
      raw && typeof raw === 'object' ? (raw as any) : {};

    const { pruned } = this.pruneFixProofCheckovCache(current);
    const existing = pruned[workspacePath];
    const now = Date.now();

    const unionIds = Array.from(
      new Set([...(existing?.checkIds || []), ...incomingIds].filter(Boolean)),
    ).sort();
    if (unionIds.length === 0) {
      // Nothing to store (and we do not store empty entries).
      return;
    }

    const mergedCheckIdsByRule: Record<string, string[]> = {};
    const mergeRuleMap = (m?: Record<string, string[]>) => {
      if (!m || typeof m !== 'object') {
        return;
      }
      for (const [ruleName, ids] of Object.entries(m)) {
        if (!Array.isArray(ids) || !ruleName) {
          continue;
        }
        if (!mergedCheckIdsByRule[ruleName]) {
          mergedCheckIdsByRule[ruleName] = [];
        }
        for (const id of ids) {
          if (typeof id === 'string' && id.trim()) {
            mergedCheckIdsByRule[ruleName].push(id.trim());
          }
        }
      }
    };
    mergeRuleMap(existing?.checkIdsByRule);
    mergeRuleMap(args.checkIdsByRule);
    for (const [k, v] of Object.entries(mergedCheckIdsByRule)) {
      mergedCheckIdsByRule[k] = Array.from(new Set(v)).sort();
    }

    const mergedEvidence: FixProofCheckovTargetsCacheEntry['evidenceByCheckId'] =
      {};
    const mergeEvidence = (
      ev?: FixProofCheckovTargetsCacheEntry['evidenceByCheckId'],
    ) => {
      if (!ev || typeof ev !== 'object') {
        return;
      }
      for (const [checkId, entries] of Object.entries(ev)) {
        if (!Array.isArray(entries)) {
          continue;
        }
        if (!mergedEvidence![checkId]) {
          mergedEvidence![checkId] = [];
        }
        for (const e of entries) {
          const ruleName =
            typeof (e as any)?.ruleName === 'string' ? (e as any).ruleName : '';
          const source =
            typeof (e as any)?.source === 'string' ? (e as any).source : '';
          const key = typeof (e as any)?.key === 'string' ? (e as any).key : '';
          if (!ruleName || !source || !key) {
            continue;
          }
          const arr = mergedEvidence![checkId]!;
          if (
            !arr.some(
              x =>
                x.ruleName === ruleName && x.source === source && x.key === key,
            )
          ) {
            arr.push({ ruleName, source, key });
          }
        }
      }
    };
    mergeEvidence(existing?.evidenceByCheckId);
    mergeEvidence(args.evidenceByCheckId);

    pruned[workspacePath] = {
      workspacePath,
      capturedAtMs: now,
      expiresAtMs: now + ScanResultsProvider.FIXPROOF_CHECKOV_TTL_MS,
      checkIds: unionIds,
      checkIdsByRule:
        Object.keys(mergedCheckIdsByRule).length > 0
          ? mergedCheckIdsByRule
          : existing?.checkIdsByRule || args.checkIdsByRule,
      evidenceByCheckId:
        mergedEvidence && Object.keys(mergedEvidence).length > 0
          ? mergedEvidence
          : existing?.evidenceByCheckId || args.evidenceByCheckId,
    };
    await this.context.globalState.update(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
      pruned,
    );
  }

  /**
   * Extend the TTL for a workspace's FixProof Checkov cache entry without modifying IDs.
   * This is useful when the user is actively scanning/verifying but the current scan
   * doesn't yield additional Checkov IDs.
   */
  public async touchFixProofCheckovTargets(args: {
    workspacePath: string;
  }): Promise<void> {
    const workspacePath = (args.workspacePath || '').trim();
    if (!workspacePath) {
      return;
    }

    const raw = this.context.globalState.get(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
    ) as unknown;
    const current: Record<string, FixProofCheckovTargetsCacheEntry> =
      raw && typeof raw === 'object' ? (raw as any) : {};

    const { pruned } = this.pruneFixProofCheckovCache(current);
    const existing = pruned[workspacePath];
    if (
      !existing ||
      !Array.isArray(existing.checkIds) ||
      existing.checkIds.length === 0
    ) {
      return;
    }

    const now = Date.now();
    pruned[workspacePath] = {
      ...existing,
      capturedAtMs: now,
      expiresAtMs: now + ScanResultsProvider.FIXPROOF_CHECKOV_TTL_MS,
    };
    await this.context.globalState.update(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
      pruned,
    );
  }

  public getCachedFixProofCheckovTargets(args: {
    workspacePath: string;
  }): (FixProofCheckovTargetsCacheEntry & { remainingMs: number }) | undefined {
    const workspacePath = (args.workspacePath || '').trim();
    if (!workspacePath) {
      return undefined;
    }

    const raw = this.context.globalState.get(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
    ) as unknown;
    const current: Record<string, FixProofCheckovTargetsCacheEntry> =
      raw && typeof raw === 'object' ? (raw as any) : {};

    const { pruned, changed } = this.pruneFixProofCheckovCache(current);
    if (changed) {
      // Best-effort cleanup; don't await.
      this.context.globalState
        .update(ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY, pruned)
        .then(
          () => {},
          () => {},
        );
    }

    const hit = pruned[workspacePath];
    if (!hit) {
      return undefined;
    }
    const remainingMs = Math.max(0, hit.expiresAtMs - Date.now());
    if (!remainingMs) {
      return undefined;
    }
    return { ...hit, remainingMs };
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    this.diagnosticCollectionManager.getDiagnosticCollection().clear();

    const issues: OrlIssuesSnapshot['issues'] = [];
    const metaIndex = this.buildOrlRuleMetaIndex();

    // the key represents the file path to the file that needs remediation
    const existingResourceRuleFixes: Record<
      string,
      IndividualFixesRemediation[]
    > = {};
    const existingGroupedFixes: Record<string, GroupedFixesRemediation> = {};
    let diagnosticTotal = 0;

    const pickBestAnchorLine = (remediation: any): number => {
      // Prefer anchoring to the resource header line for stability in the editor.
      const obs = Number(
        remediation?.codeObservation?.codeResourceInstance?.line,
      );
      if (Number.isFinite(obs) && obs > 0) {
        return obs;
      }
      const fixLine = Number(remediation?.fixes?.[0]?.codePosition?.line);
      if (Number.isFinite(fixLine) && fixLine > 0) {
        return fixLine;
      }
      return 1;
    };

    for (const remediation of this.individualRemediations) {
      const filepath =
        remediation.codeObservation.codeResourceInstance.filepath;
      if (remediation.fixes.length === 0) {
        continue;
      }
      const existingData = existingResourceRuleFixes[filepath];
      if (!existingData) {
        existingResourceRuleFixes[filepath] = [remediation];
      } else {
        existingResourceRuleFixes[filepath] = [remediation, ...existingData];
      }
    }
    // Ensures that each file only has one grouped remediation
    for (const remediation of this.groupedRemediations) {
      const filepath = remediation.path;
      existingGroupedFixes[filepath] = remediation;
    }

    for (const filepath in existingResourceRuleFixes) {
      // note: file at this piont has \ -> will cause issues when we give it to diagnosticCollection
      // later as vscode expects a uri to have it's unix style / pathing
      // use Uri.file to get unix style, Uri.parse gets the windows style
      const uri = vscode.Uri.file(filepath);
      const currentRemediation = existingResourceRuleFixes[filepath];
      const curDiag: Array<
        | IndividualFixGombocDiagnostic
        | GroupedFixGombocDiagnostic
        | OrlRuleFixGombocDiagnostic
      > = [];
      const uniqueLines = new Set<number>();

      const isOrl = (r: any): boolean =>
        typeof r?.rule?.id === 'string' && r.rule.id.startsWith('orl-rule:');

      if (
        currentRemediation.length > 0 &&
        isOrl(currentRemediation[0] as any)
      ) {
        const prettifyShortName = (s: string): string => {
          const raw = (s || '').trim();
          if (!raw) {
            return raw;
          }
          const spaced = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
          if (!spaced) {
            return spaced;
          }
          return spaced[0].toUpperCase() + spaced.slice(1);
        };

        // ORL mode: show per-rule diagnostics (robust apply = rerun ORL with single rule).
        const ruleToMeta = new Map<
          string,
          { line: number; resourceHeader?: string }
        >();
        for (const remediation of currentRemediation as any[]) {
          const rule = remediation?.rule as any;
          const ruleNames = this.getRenderableOrlRuleNames(rule);

          // Pick a reasonable anchor line for diagnostics.
          let line: number = pickBestAnchorLine(remediation);
          if (!Number.isFinite(line) || line <= 0) {
            line = 1;
          }

          const resourceHeader: string | undefined =
            typeof remediation?.codeObservation?.codeResourceInstance?.name ===
            'string'
              ? remediation.codeObservation.codeResourceInstance.name
              : undefined;

          for (const rn of ruleNames) {
            if (!ruleToMeta.has(rn)) {
              ruleToMeta.set(rn, { line, resourceHeader });
            }
          }
        }

        // Emit one diagnostic per rule.
        let orlIdx = 0;
        for (const [ruleName, meta] of ruleToMeta.entries()) {
          const line = meta.line;
          const startPosition = new vscode.Position(line - 1, 0);
          // Make each ORL diagnostic range slightly unique so selecting an item
          // from Problems can produce a single-action lightbulb menu.
          const baseLen = Math.max(1, (meta.resourceHeader || '').length);
          const endChar = Math.min(999, baseLen + orlIdx);
          const endPosition = new vscode.Position(line - 1, endChar);
          const shortNameRaw = this.orlRuleShortNames?.[ruleName] || ruleName;
          const shortName = prettifyShortName(shortNameRaw);
          const description = this.orlRuleDescriptions?.[ruleName] || ruleName;

          const metaHit =
            metaIndex.get(ruleName) ||
            metaIndex.get(this.stripOrlInstanceSuffix(ruleName));
          issues.push({
            ruleName,
            ruleShortName: shortName,
            ruleDescription: description,
            resourceHeader: meta.resourceHeader,
            filePath: filepath,
            line,
            checkovIds: metaHit?.checkovIds?.length
              ? metaHit.checkovIds
              : undefined,
            fixStrategy: metaHit?.fixStrategy,
          });

          diagnosticTotal++;
          uniqueLines.add(line);
          const message = meta.resourceHeader
            ? `${shortName}: ${meta.resourceHeader}`
            : shortName;
          curDiag.push({
            // Problems tab: keep it compact (resource + shortName)
            message,
            ruleName,
            filePath: filepath,
            resourceHeader: meta.resourceHeader,
            ruleShortName: shortName,
            ruleDescription: description,
            fixStrategy: metaHit?.fixStrategy,
            fixTask: metaHit?.fixTask,
            quickFixMessage: `Apply fix (${shortName})`,
            range: new vscode.Range(startPosition, endPosition),
            severity: vscode.DiagnosticSeverity.Error,
            source: 'Gomboc',
          } as any);
          orlIdx++;
        }

        // Keep "Apply all fixes" but only once (at the first diagnostic line).
        const firstLine =
          uniqueLines.size > 0 ? Math.min(...Array.from(uniqueLines)) : 1;
        const startPosition = new vscode.Position(firstLine - 1, 0);
        const endPosition = new vscode.Position(firstLine - 1, 999);
        curDiag.push({
          message: 'Apply all fixes',
          groupedFixGombocResult: existingGroupedFixes[filepath],
          quickFixMessage: 'Apply all fixes',
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc',
        } as any);
      } else {
        // API mode (or legacy): keep individual per-fix diagnostics + grouped apply-all.
        for (const remediation of currentRemediation) {
          let startLine = remediation.codeObservation.codeResourceInstance.line;
          let containsAddFixType = false;
          for (const fix of remediation.fixes) {
            if (fix.fixType === 'ADD') {
              containsAddFixType = true;
              break;
            }
          }
          if (!containsAddFixType && remediation.fixes.length > 0) {
            startLine = remediation.fixes[0].codePosition.line;
          }
          const startPosition = new vscode.Position(startLine - 1, 0);
          uniqueLines.add(startLine);
          const endPosition = new vscode.Position(startLine - 1, 999);

          diagnosticTotal++;
          curDiag.push({
            message: `${remediation.rule.name}`,
            individualFixGombocResult: remediation,
            quickFixMessage: `Fix with Gomboc ${remediation.rule.name} for ${remediation.codeObservation.codeResourceInstance.type}`,
            range: new vscode.Range(startPosition, endPosition),
            severity: vscode.DiagnosticSeverity.Error,
            source: 'Gomboc ',
          });
        }
        for (const line of uniqueLines) {
          const startPosition = new vscode.Position(line - 1, 0);
          const endPosition = new vscode.Position(line - 1, 999);
          curDiag.push({
            message: 'Apply all fixes',
            groupedFixGombocResult: existingGroupedFixes[filepath],
            quickFixMessage: 'Apply all fixes',
            range: new vscode.Range(startPosition, endPosition),
            severity: vscode.DiagnosticSeverity.Error,
            source: 'Gomboc',
          });
        }
      }
      this.diagnosticCollectionManager.updateDiagnosticCollection(uri, curDiag);
    }

    vscode.window.showInformationMessage(
      `Gomboc found ${this.getFixSummaryCount(diagnosticTotal)} fixes`,
    );

    const last = this.getLastOrlScanContext();
    this.lastIssuesSnapshot = {
      scanScope: last
        ? {
            workspacePath: last.workspacePath,
            language: last.language,
            scannedAt: last.scannedAt,
          }
        : undefined,
      issues,
    };
    this.issuesDidUpdateEmitter.fire(this.lastIssuesSnapshot);
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyIndividualRemediation(remediations: IndividualFixesRemediation[]) {
    const edit = new vscode.WorkspaceEdit();
    const updatedFiles = new Set<string>();
    const allFixes: IndividualFix[] = remediations.reduce((acc, curr) => {
      const currentFixes: IndividualFix[] = curr.fixes.map(fix => ({
        ...fix,
        rule: curr.rule,
      }));

      return [...acc, ...currentFixes];
    }, [] as IndividualFix[]);

    for (const fix of allFixes) {
      updatedFiles.add(fix.filepath);
      const fixPosition = fix.codePosition.line - 1;
      let startPosition = new vscode.Position(fixPosition, 0);
      let endPosition = new vscode.Position(fix.codePosition.line - 1, 999);
      const file = vscode.Uri.file(fix.filepath);

      const range = new vscode.Range(startPosition, endPosition);
      const newValue = fix.newLine.join('\n');
      if (fix.fixType === 'ADD') {
        edit.insert(
          file,
          startPosition,
          `${' '.repeat(fix.codePosition.column)}${newValue}` + '\n',
        );
      } else if (fix.fixType === 'UPDATE') {
        edit.replace(file, range, `${newValue}`);
      } else {
        // delete but delete type doesn't exist yet for us
        edit.replace(
          file,
          range,
          `Removed this line to fix ${fix.rule.name} with Gomboc`,
        );
      }
    }
    const success = await vscode.workspace.applyEdit(edit);

    // Emit "ORL fix applied" analytics (best-effort) when the edit succeeds.
    if (success) {
      const ruleIdentifiers = Array.from(
        new Set(
          remediations
            .map(r => r?.rule?.id)
            .filter((id): id is string => typeof id === 'string')
            .filter(id => id.startsWith('orl-rule:')),
        ),
      );
      const ruleNamesSet = new Set<string>();
      for (const r of remediations) {
        const rule: any = r?.rule as any;
        for (const ruleName of this.getRenderableOrlRuleNames(rule)) {
          ruleNamesSet.add(ruleName);
        }
      }
      const files = Array.from(updatedFiles);
      const workspacePath =
        files.length > 0
          ? path.dirname(files[0])
          : vscode.window.activeTextEditor
            ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
            : undefined;

      if (
        workspacePath &&
        (ruleIdentifiers.length > 0 || ruleNamesSet.size > 0)
      ) {
        queueOrlFixAppliedEvent(this.context, workspacePath, {
          fixKind: 'individual',
          ruleNames: Array.from(ruleNamesSet),
          ruleIdentifiers,
          filePaths: files,
        }).catch(() => {});
      }
    }

    // once we apply a remediation we have to dispose and clear everything and re-run
    for (const file of updatedFiles) {
      const uri = vscode.Uri.file(file);
      const infrastructureTool = getInfrastructureToolFromFileUri(uri);
      if (infrastructureTool) {
        this.diagnosticCollectionManager.clearDiagnosticCollection(
          infrastructureTool,
          uri,
        );
      } else {
        this.diagnosticCollectionManager.updateDiagnosticCollection(uri, []);
      }
    }
    if (ScanResultsProvider.codeActionDisposable) {
      ScanResultsProvider.codeActionDisposable.dispose();
    }
    if (success) {
      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();

        vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
        return;
      }
    }
  }
  async applyGroupedRemediation(remediations: GroupedFixesRemediation[]) {
    const fixEdit = new vscode.WorkspaceEdit();
    for (const remediation of remediations) {
      const file = vscode.Uri.file(remediation.path);
      const iac = getInfrastructureToolFromFileUri(file);
      const document = await vscode.workspace.openTextDocument(file);
      const decodedContent = Buffer.from(
        remediation.content,
        'base64',
      ).toString('binary');
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );

      fixEdit.replace(document.uri, fullRange, decodedContent);
      const remediationSuccess = await vscode.workspace.applyEdit(fixEdit);

      if (!remediationSuccess) {
        throw new Error('Unable to apply any fixes due to an unexpected error');
      }

      // Emit "ORL fix applied" analytics (best-effort) for this file.
      try {
        const ruleIdentifiers = Array.from(
          new Set(
            (remediation.comments || [])
              .map((c: any) => c?.rule?.id)
              .filter((id: any): id is string => typeof id === 'string')
              .filter(id => id.startsWith('orl-rule:')),
          ),
        );
        const ruleNamesSet = new Set<string>();
        for (const c of remediation.comments || []) {
          const rule: any = (c as any)?.rule;
          for (const ruleName of this.getRenderableOrlRuleNames(rule)) {
            ruleNamesSet.add(ruleName);
          }
        }
        const workspacePath = path.dirname(remediation.path);
        if (ruleIdentifiers.length > 0 || ruleNamesSet.size > 0) {
          queueOrlFixAppliedEvent(this.context, workspacePath, {
            fixKind: 'grouped',
            ruleNames: Array.from(ruleNamesSet),
            ruleIdentifiers,
            filePaths: [remediation.path],
          }).catch(() => {});
        }
      } catch {
        // ignore analytics errors
      }

      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();
      }
      // once we apply a remediation we have to dispose and clear everything and re-run
      if (iac) {
        this.diagnosticCollectionManager.clearDiagnosticCollection(iac, file);
      }
      if (ScanResultsProvider.codeActionDisposable) {
        ScanResultsProvider.codeActionDisposable.dispose();
      }
    }
  }

  async applyOrlRuleRemediation(
    args: Array<{ ruleName: string; filePath: string }>,
  ) {
    const first = Array.isArray(args) ? args[0] : undefined;
    const ruleName = first?.ruleName;
    const filePath = first?.filePath;
    if (!ruleName || !filePath) {
      vscode.window.showErrorMessage(
        'Unable to apply rule fix: missing rule or file path',
      );
      return;
    }

    // Use the same scan scope as ORL scans (directory containing the file).
    const workspacePath = path.dirname(filePath);

    const fileUri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(fileUri);
    const language = detectLanguageFromFile(filePath, document.getText());
    if (!language) {
      vscode.window.showErrorMessage(
        'Unable to apply rule fix: file language could not be detected',
      );
      return;
    }

    // Ensure file is saved before remediation (avoid racing unsaved editor content).
    try {
      await document.save();
    } catch {
      // ignore
    }

    const orlClient = await createOrlClient({
      extensionPath: this.context.extensionPath,
      storagePath: this.context.globalStorageUri.fsPath,
    });
    logger.info('Applying ORL single-rule remediation', {
      ruleName,
      workspacePath,
      filePath,
      language,
    });

    const result = await orlClient.remediateSingleRule({
      workspacePath,
      language,
      ruleName,
      targetFilePath: filePath,
    });

    if (!result.success) {
      vscode.window.showErrorMessage(
        `Failed to apply rule fix: ${result.error || 'unknown error'}`,
      );
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const updatedFiles = new Set<string>();
    let changedAny = false;

    for (const [orlPath, content] of Object.entries(
      result.modifiedFiles || {},
    )) {
      const rel = orlPath.replace(/^\/workspace\/+/, '');
      const absPath = path.join(workspacePath, rel);
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(absPath),
      );
      const before = doc.getText();
      if (before === content) {
        // Skip no-op replacements to avoid confusing "applied but nothing changed" behavior.
        continue;
      }
      changedAny = true;
      updatedFiles.add(absPath);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length),
      );
      edit.replace(doc.uri, fullRange, content);
    }

    if (!changedAny) {
      vscode.window.showInformationMessage(
        `ORL did not produce any changes for rule: ${ruleName} (single-file apply). If this rule needs cross-file context, try “Apply all fixes” for the directory.`,
      );
      return;
    }

    const success = await vscode.workspace.applyEdit(edit);
    if (!success) {
      vscode.window.showErrorMessage(
        'Unable to apply rule fix due to an unexpected error',
      );
      return;
    }

    // Best-effort save
    try {
      for (const p of updatedFiles) {
        const d = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
        await d.save();
      }
    } catch {
      // ignore
    }

    // Emit analytics (best-effort). Treat as "individual" since it's a single rule apply.
    try {
      await queueOrlFixAppliedEvent(this.context, workspacePath, {
        fixKind: 'individual',
        ruleNames: [ruleName],
        ruleIdentifiers: [`orl-rule:${ruleName}`],
        filePaths: Array.from(updatedFiles),
      });
    } catch (e) {
      logger.debug('Failed to queue ORL fix applied event (ignored)', {
        e: e instanceof Error ? e.message : String(e),
      });
    }

    vscode.window.showInformationMessage(
      `Applied ORL fix for rule: ${ruleName}`,
    );
  }

  async getCurrentFile(): Promise<{ file: string; editor: vscode.TextEditor }> {
    const opened = vscode.window.activeTextEditor;
    if (opened) {
      const file = opened.document.fileName;
      return { file: file, editor: opened };
    }
    throw new Error('function lacks active editor');
  }

  // async getFileFromPath(filePath: string): Promise<{ file: string; editor: vscode.TextEditor }> {
  //   const uri = vscode.Uri.file(filePath);
  //   const document = await vscode.workspace.openTextDocument(uri);
  //   const editor = await vscode.window.showTextDocument(document);
  //   return { file: document.fileName, editor };
  // }
}
