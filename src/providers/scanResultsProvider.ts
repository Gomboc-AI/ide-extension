import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
  OrlRuleFixGombocDiagnostic,
} from './gombocDiagnostic';
import {
  GroupedFixesRemediation,
  IndividualFixesRemediation,
  OrlRule as ScanRemediationOrlRule,
  RemediationFindingLocation,
  ScanRemediationPayload,
  parseScanRemediationPayload,
} from '../schemas/scanRemediation';
import { toExtensionLine } from '../schemas/orlReport';
import { DiagnosticCollectionManager } from '../diagnosticCollectionManager';
import { vsCodeIntegrationsService } from '../utils/integrationsService';
import { createOrlClient } from '../orl/orlClient';
import { extractRenderableOrlRuleNames } from '../orl/orlRuleNameResolver';
import {
  chooseLanguageImplementation,
  mapLanguageIdToOrlLanguage,
  ILanguage,
} from '@gomboc-ai/gomboc-node-sdk';
import logger from '../utils/logger';
import { parseOrlReport } from '../utils/orlReportParser';
import {
  CheckovEvidence,
  OrlRule as OrlReportRule,
  parseOrlReportPayload,
} from '../schemas/orlReport';

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

/**
 * Snapshot of currently renderable ORL issues for the Fix Reviewer webview.
 */
export type OrlIssuesSnapshot = {
  scanScope?: { workspacePath: string; language?: string; scannedAt?: string };
  issues: Array<{
    ruleName: string;
    ruleShortName: string;
    ruleDescription: string;
    resourceHeader?: string;
    filePath: string;
    line?: number;
    scopedApplyLine?: number;
    checkovIds?: string[];
    fixStrategy?: string;
  }>;
};

/**
 * Owns scan remediation state, diagnostics, code-action commands, and issue snapshots.
 */
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

  /**
   * Creates or returns the shared scan results provider for the extension session.
   */
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

  /**
   * Registers VS Code commands that apply remediation payloads and open fix helpers.
   */
  public registerApplyRemediation() {
    const commands = [
      {
        command: 'gomboc-results.applyIndividualRemediation',
        callback: (fixedResults: IndividualFixesRemediation[]) => {
          this.applyIndividualRemediation(fixedResults);
        },
      },
      {
        command: 'gomboc-results.applyGroupedRemediation',
        callback: (fixedResults: GroupedFixesRemediation[]) => {
          this.applyGroupedRemediation(fixedResults);
        },
      },
      {
        command: 'gomboc-results.applyOrlRuleRemediation',
        callback: (fixedResults: OrlRuleFixGombocDiagnostic[]) => {
          this.applyOrlRuleRemediation(fixedResults);
        },
      },
      // ORL-only: open a structured AI prompt (for Cursor) and guide FixProof revalidation.
      {
        command: 'gomboc-results.openAiFixPrompt',
        callback: (args: {
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
      },
    ];

    commands.forEach(({ command, callback }) => {
      this.context.subscriptions.push(
        vscode.commands.registerCommand(command, callback),
      );
    });
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

  private getRenderableOrlRuleNames(rule: ScanRemediationOrlRule): string[] {
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

  /** Drops trailing blank lines and same-level comments from a scoped resource block. */
  private trimScopedBlockEnd(args: {
    lines: string[];
    block: { startLine: number; endLine: number };
  }): { startLine: number; endLine: number } {
    const { lines, block } = args;
    const startIdx = Math.max(0, block.startLine - 1);
    const resourceIndent = (lines[startIdx]?.match(/^(\s*)/)?.[1] || '').length;
    let endLine = block.endLine;
    while (endLine > block.startLine) {
      const text = lines[endLine - 1] ?? '';
      const trimmed = text.trim();
      if (!trimmed) {
        endLine--;
        continue;
      }
      if (trimmed.startsWith('#')) {
        const indent = (text.match(/^(\s*)/)?.[1] || '').length;
        if (indent <= resourceIndent) {
          endLine--;
          continue;
        }
      }
      break;
    }
    return { startLine: block.startLine, endLine };
  }

  /**
   * Resolve a language-aware scoped edit range anchored at the target line.
   *
   * This keeps single-rule apply focused on one resource block when the language
   * handler can identify a concrete resource range.
   */
  private findScopedEditRange(
    filePath: string,
    content: string,
    line1Based: number,
  ): { startLine: number; endLine: number } | undefined {
    if (!filePath || !content) {
      return undefined;
    }
    const handler = chooseLanguageImplementation({
      filePath,
      content,
    });
    const scopedRange = handler.findScopedEditRange({
      filePath,
      content,
      line: line1Based,
    });
    return scopedRange || undefined;
  }

  private readFileTextForDiagnostics(filePath: string): string | undefined {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      const openDocs = Array.isArray(vscode.workspace.textDocuments)
        ? vscode.workspace.textDocuments
        : [];
      const openDoc = openDocs.find(doc => doc.uri.fsPath === filePath);
      return openDoc?.getText();
    }
  }

  /**
   * Returns leading whitespace for a given 1-based line index.
   * Used to keep ADD fixes aligned with the surrounding code.
   */
  private getLineIndentation(
    content: string | undefined,
    line1Based: number,
  ): string {
    if (!content) {
      return '';
    }
    const lines = content.split('\n');
    if (lines.length === 0) {
      return '';
    }
    const safeIdx = Math.min(
      Math.max(0, Math.floor(line1Based) - 1),
      Math.max(0, lines.length - 1),
    );
    const line = lines[safeIdx] ?? '';
    const match = line.match(/^(\s*)/);
    return match?.[1] || '';
  }

  /**
   * Build a compact diagnostic range delegating to the language handler.
   */
  private buildCompactDiagnosticRange(args: {
    line1Based: number;
    content?: string;
    uniqueOffset?: number;
    handler?: ILanguage;
    anchorCharacter?: number;
  }): vscode.Range {
    const line = Math.max(1, Math.floor(args.line1Based || 1));
    const content = typeof args.content === 'string' ? args.content : '';

    if (args.handler) {
      const result = args.handler.buildDiagnosticRange({
        line1Based: line,
        content,
        uniqueOffset: args.uniqueOffset,
      });
      const anchorStart =
        Number.isFinite(args.anchorCharacter) &&
        (args.anchorCharacter || 0) >= 0
          ? Math.floor(args.anchorCharacter || 0)
          : result.startChar;
      const startChar = Math.max(result.startChar, anchorStart);
      // Large column so VS Code clamps to the line end (same idea as API-mode fixes).
      const endChar = 999;
      return new vscode.Range(
        new vscode.Position(line - 1, startChar),
        new vscode.Position(line - 1, endChar),
      );
    }

    // Inline fallback when no handler is available
    const uniqueOffset =
      Number.isFinite(args.uniqueOffset) && (args.uniqueOffset || 0) > 0
        ? Math.floor(args.uniqueOffset || 0)
        : 0;
    const lines = content ? content.split('\n') : [];
    const idx = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1));
    const lineText = lines[idx] || '';
    const lineLength = lineText.length;

    // Anchor near the first non-whitespace character when possible.
    const firstNonWhitespace = lineText.search(/\S/);
    const startChar =
      firstNonWhitespace >= 0 ? firstNonWhitespace : lineLength > 0 ? 0 : 0;

    // Keep highlight compact and predictable.
    const trimmedLength = lineText.trim().length;
    const compactWidth = Math.max(1, Math.min(24, trimmedLength || 1));
    const maxEnd = Math.max(startChar + 1, lineLength || startChar + 1);
    const rawEnd = startChar + compactWidth + uniqueOffset;
    const anchorStart =
      Number.isFinite(args.anchorCharacter) && (args.anchorCharacter || 0) >= 0
        ? Math.floor(args.anchorCharacter || 0)
        : startChar;
    const anchoredStartChar = Math.min(
      maxEnd - 1,
      Math.max(startChar, anchorStart),
    );
    const endChar = Math.min(maxEnd, Math.max(anchoredStartChar + 1, rawEnd));

    return new vscode.Range(
      new vscode.Position(line - 1, anchoredStartChar),
      new vscode.Position(line - 1, endChar),
    );
  }

  private getFileTextForFix(
    cache: Map<string, string | undefined>,
    filepath: string,
  ): string | undefined {
    if (cache.has(filepath)) {
      return cache.get(filepath);
    }
    const content = this.readFileTextForDiagnostics(filepath);
    cache.set(filepath, content);
    return content;
  }

  /**
   * Apply inferred indentation to unindented lines only.
   * If any non-empty line already has leading whitespace, keep incoming formatting.
   */
  private withInferredIndentation(
    lines: string[],
    indentation: string,
  ): string[] {
    if (!indentation || lines.length === 0) {
      return lines;
    }
    const nonEmpty = lines.filter(line => line.trim().length > 0);
    const hasExistingIndent = nonEmpty.some(line => /^\s/.test(line));
    if (hasExistingIndent) {
      return lines;
    }
    return lines.map(line =>
      line.length > 0 ? `${indentation}${line}` : line,
    );
  }

  private resolveOrlDiagnosticAnchor(args: {
    remediation: IndividualFixesRemediation;
    fileContent: string | undefined;
    fileHandler: ILanguage;
  }): { line: number; character: number } {
    const findingLocation = args.remediation.findingLocation;
    if (findingLocation) {
      return {
        line: toExtensionLine(findingLocation.startLine),
        character: Math.max(0, Math.floor(findingLocation.startColumn)),
      };
    }

    const operationAnchor = this.pickOperationDiagnosticAnchor(
      args.remediation,
    );
    let line: number = operationAnchor.line;
    if (!Number.isFinite(line) || line <= 0) {
      line = 1;
    }
    const resolvedAnchor = args.fileHandler.resolveDiagnosticAnchorLine({
      content: args.fileContent ?? '',
      suggestedLine: line,
      fromFixOperation: operationAnchor.fromFixOperation,
    });
    return {
      line: resolvedAnchor.line,
      character: resolvedAnchor.character,
    };
  }

  private buildLocationDiagnosticRange(args: {
    findingLocation?: RemediationFindingLocation;
    line1Based: number;
    character: number;
    content?: string;
    uniqueOffset?: number;
    handler?: ILanguage;
  }): vscode.Range {
    if (args.findingLocation) {
      const startLine0 = Math.max(
        0,
        Math.floor(args.findingLocation.startLine) - 1,
      );
      const startCol = Math.max(
        0,
        Math.floor(args.findingLocation.startColumn),
      );
      const endLine0 = Number.isFinite(args.findingLocation.endLine)
        ? Math.max(
            startLine0,
            Math.floor(args.findingLocation.endLine as number) - 1,
          )
        : startLine0;
      const endCol = Number.isFinite(args.findingLocation.endColumn)
        ? Math.max(
            startCol + 1,
            Math.floor(args.findingLocation.endColumn as number),
          )
        : 999;
      return new vscode.Range(
        new vscode.Position(startLine0, startCol),
        new vscode.Position(endLine0, endCol),
      );
    }

    return this.buildCompactDiagnosticRange({
      line1Based: args.line1Based,
      content: args.content,
      uniqueOffset: args.uniqueOffset,
      handler: args.handler,
      anchorCharacter: args.character,
    });
  }

  private pickOperationDiagnosticAnchor(
    remediation: IndividualFixesRemediation,
  ): { line: number; fromFixOperation: boolean } {
    const fixes = Array.isArray(remediation?.fixes) ? remediation.fixes : [];
    const operationFix = fixes.find(
      fix => fix.fixType === 'UPDATE' || fix.fixType === 'DELETE',
    );
    if (
      operationFix &&
      Number.isFinite(operationFix.codePosition.line) &&
      operationFix.codePosition.line > 0
    ) {
      return {
        line: Math.floor(operationFix.codePosition.line),
        fromFixOperation: true,
      };
    }

    const addFix = fixes.find(fix => fix.fixType === 'ADD');
    if (
      addFix &&
      Number.isFinite(addFix.codePosition.line) &&
      addFix.codePosition.line > 0
    ) {
      return {
        line: Math.max(1, Math.floor(addFix.codePosition.line) - 1),
        fromFixOperation: true,
      };
    }

    const firstFix = fixes[0];
    if (
      firstFix &&
      Number.isFinite(firstFix.codePosition.line) &&
      firstFix.codePosition.line > 0
    ) {
      return {
        line: Math.floor(firstFix.codePosition.line),
        fromFixOperation: true,
      };
    }

    const observationLine = Number(
      remediation?.codeObservation?.codeResourceInstance?.line,
    );
    if (Number.isFinite(observationLine) && observationLine > 0) {
      return {
        line: Math.floor(observationLine),
        fromFixOperation: false,
      };
    }

    return { line: 1, fromFixOperation: false };
  }

  private extractCheckovIdsFromAnnotations(
    annotations: Record<string, unknown>,
  ): string[] {
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
      const rules = parseOrlReportPayload(parsed)?.spec?.rules;
      if (Array.isArray(rules)) {
        const base = this.stripOrlInstanceSuffix(ruleNameRaw);
        const wanted = new Set([ruleNameRaw, base]);
        const hit = rules.find((r: OrlReportRule) => {
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

  /**
   * Loads a scan remediation payload and stores it for diagnostic generation.
   */
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

  /**
   * Merges a single-rule ORL result into `beforeText`, scoped to one resource block when possible.
   */
  private mergeScopedOrlRemediation(args: {
    filePath: string;
    beforeText: string;
    orlAfterText: string;
    line?: number;
  }):
    | { kind: 'noop'; afterText: string }
    | {
        kind: 'scoped';
        afterText: string;
        startLine: number;
        endLine: number;
        replacement: string;
      }
    | { kind: 'full'; afterText: string } {
    const { filePath, beforeText, orlAfterText, line } = args;
    if (beforeText === orlAfterText) {
      return { kind: 'noop', afterText: beforeText };
    }

    if (typeof line === 'number' && Number.isFinite(line) && line > 0) {
      const beforeBlock = this.findScopedEditRange(filePath, beforeText, line);
      const afterBlock = beforeBlock
        ? this.findScopedEditRange(
            filePath,
            orlAfterText,
            beforeBlock.startLine,
          )
        : undefined;

      if (
        beforeBlock &&
        afterBlock &&
        beforeBlock.startLine === afterBlock.startLine
      ) {
        const beforeLines = beforeText.split('\n');
        const afterLines = orlAfterText.split('\n');
        const trimmedBefore = this.trimScopedBlockEnd({
          lines: beforeLines,
          block: beforeBlock,
        });
        const trimmedAfter = this.trimScopedBlockEnd({
          lines: afterLines,
          block: afterBlock,
        });
        const replacement = afterLines
          .slice(trimmedAfter.startLine - 1, trimmedAfter.endLine)
          .join('\n');
        const existing = beforeLines
          .slice(trimmedBefore.startLine - 1, trimmedBefore.endLine)
          .join('\n');
        if (replacement !== existing) {
          const out = beforeLines.slice();
          out.splice(
            trimmedBefore.startLine - 1,
            trimmedBefore.endLine - trimmedBefore.startLine + 1,
            ...replacement.split('\n'),
          );
          return {
            kind: 'scoped',
            afterText: out.join('\n'),
            startLine: trimmedBefore.startLine,
            endLine: trimmedBefore.endLine,
            replacement,
          };
        }
      }
    }

    return { kind: 'full', afterText: orlAfterText };
  }

  /**
   * Returns the last ORL scan scope and report metadata, if any.
   */
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

  /**
   * Returns a stable snapshot for the issues webview.
   */
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
      const rules = parseOrlReportPayload(parsed)?.spec?.rules;
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
    now: number = Date.now(),
  ): {
    pruned: Record<string, FixProofCheckovTargetsCacheEntry>;
    changed: boolean;
  } {
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
  public async cacheFixProofCheckovTargets(
    args: {
      workspacePath: string;
      checkIds: string[];
      checkIdsByRule?: Record<string, string[]>;
      evidenceByCheckId?: Record<
        string,
        Array<{ ruleName: string; source: string; key: string }>
      >;
    },
    now: () => number = Date.now,
  ): Promise<void> {
    const workspacePath = (args.workspacePath || '').trim();
    if (!workspacePath) {
      return;
    }
    const incomingIds = Array.isArray(args.checkIds) ? args.checkIds : [];

    const raw = this.context.globalState.get(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
    ) as unknown;
    const current: Record<string, FixProofCheckovTargetsCacheEntry> =
      raw && typeof raw === 'object'
        ? (raw as Record<string, FixProofCheckovTargetsCacheEntry>)
        : {};

    const nowMs = now();
    const { pruned } = this.pruneFixProofCheckovCache(current, nowMs);
    const existing = pruned[workspacePath];

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
          const evidence = e as CheckovEvidence;
          if (
            typeof evidence.ruleName !== 'string' ||
            (evidence.source !== 'annotation' &&
              evidence.source !== 'usecase') ||
            typeof evidence.key !== 'string'
          ) {
            continue;
          }
          const arr = mergedEvidence![checkId]!;
          if (
            !arr.some(
              x =>
                x.ruleName === evidence.ruleName &&
                x.source === evidence.source &&
                x.key === evidence.key,
            )
          ) {
            arr.push(evidence);
          }
        }
      }
    };
    mergeEvidence(existing?.evidenceByCheckId);
    mergeEvidence(args.evidenceByCheckId);

    pruned[workspacePath] = {
      workspacePath,
      capturedAtMs: nowMs,
      expiresAtMs: nowMs + ScanResultsProvider.FIXPROOF_CHECKOV_TTL_MS,
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
  public async touchFixProofCheckovTargets(
    args: {
      workspacePath: string;
    },
    now: () => number = Date.now,
  ): Promise<void> {
    const workspacePath = (args.workspacePath || '').trim();
    if (!workspacePath) {
      return;
    }

    const raw = this.context.globalState.get(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
    ) as unknown;
    const current: Record<string, FixProofCheckovTargetsCacheEntry> =
      raw && typeof raw === 'object'
        ? (raw as Record<string, FixProofCheckovTargetsCacheEntry>)
        : {};

    const nowMs = now();
    const { pruned } = this.pruneFixProofCheckovCache(current, nowMs);
    const existing = pruned[workspacePath];
    if (
      !existing ||
      !Array.isArray(existing.checkIds) ||
      existing.checkIds.length === 0
    ) {
      return;
    }

    pruned[workspacePath] = {
      ...existing,
      capturedAtMs: nowMs,
      expiresAtMs: nowMs + ScanResultsProvider.FIXPROOF_CHECKOV_TTL_MS,
    };
    await this.context.globalState.update(
      ScanResultsProvider.FIXPROOF_CHECKOV_CACHE_KEY,
      pruned,
    );
  }

  /**
   * Reads cached Checkov targets for a workspace and reports remaining TTL.
   */
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
      raw && typeof raw === 'object'
        ? (raw as Record<string, FixProofCheckovTargetsCacheEntry>)
        : {};

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

  /**
   * Rebuilds VS Code diagnostics from the stored remediation payloads.
   */
  public createDiagnostic() {
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

    for (const remediation of this.individualRemediations) {
      const filepath =
        remediation.codeObservation.codeResourceInstance.filepath;
      const isOrlRuleRemediation =
        typeof remediation.rule?.id === 'string' &&
        remediation.rule.id.startsWith('orl-rule:');
      if (
        remediation.fixes.length === 0 &&
        !(isOrlRuleRemediation && remediation.findingLocation)
      ) {
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
      const fileContent = this.readFileTextForDiagnostics(filepath);
      const curDiag: Array<
        | IndividualFixGombocDiagnostic
        | GroupedFixGombocDiagnostic
        | OrlRuleFixGombocDiagnostic
      > = [];
      const uniqueLines = new Set<number>();

      // Resolve the language handler once per file for all diagnostic operations
      const fileHandler = chooseLanguageImplementation({
        filePath: filepath,
        content: fileContent ?? '',
      });

      const isOrl = (r: IndividualFixesRemediation): boolean =>
        typeof r?.rule?.id === 'string' && r.rule.id.startsWith('orl-rule:');

      if (currentRemediation.length > 0 && isOrl(currentRemediation[0])) {
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
          {
            ruleName: string;
            line: number;
            character: number;
            resourceHeader?: string;
            findingLocation?: RemediationFindingLocation;
          }
        >();
        for (const remediation of currentRemediation) {
          const rule = remediation.rule;
          const ruleNames = this.getRenderableOrlRuleNames(rule);
          const anchor = this.resolveOrlDiagnosticAnchor({
            remediation,
            fileContent,
            fileHandler,
          });
          const line = anchor.line;

          const resourceHeader: string | undefined =
            typeof remediation?.codeObservation?.codeResourceInstance?.name ===
            'string'
              ? remediation.codeObservation.codeResourceInstance.name
              : undefined;

          for (const rn of ruleNames) {
            const baseRuleName = this.stripOrlInstanceSuffix(rn);
            const findingId = remediation.findingLocation?.id?.trim();
            const ruleResourceKey = findingId
              ? `${baseRuleName}::finding::${findingId}`
              : resourceHeader?.trim()
                ? `${baseRuleName}::resource::${resourceHeader.trim()}`
                : `${baseRuleName}::line::${line}`;
            if (!ruleToMeta.has(ruleResourceKey)) {
              ruleToMeta.set(ruleResourceKey, {
                ruleName: rn,
                line,
                character: anchor.character,
                resourceHeader,
                findingLocation: remediation.findingLocation,
              });
            }
          }
        }

        // Emit one diagnostic per rule.
        let orlIdx = 0;
        for (const [, meta] of ruleToMeta.entries()) {
          const ruleName = meta.ruleName;
          const line = meta.line;
          // Keep each ORL range compact and slightly unique so Problems selection
          // can still produce a single-action lightbulb menu.
          const range = this.buildLocationDiagnosticRange({
            findingLocation: meta.findingLocation,
            line1Based: line,
            content: fileContent,
            uniqueOffset: orlIdx,
            handler: fileHandler,
            character: meta.character,
          });
          const baseRuleName = this.stripOrlInstanceSuffix(ruleName);
          const shortNameRaw =
            this.orlRuleShortNames?.[ruleName] ||
            this.orlRuleShortNames?.[baseRuleName] ||
            baseRuleName;
          const shortName = prettifyShortName(shortNameRaw);
          const description =
            this.orlRuleDescriptions?.[ruleName] ||
            this.orlRuleDescriptions?.[baseRuleName] ||
            baseRuleName;

          const metaHit =
            metaIndex.get(ruleName) ||
            metaIndex.get(this.stripOrlInstanceSuffix(ruleName));
          const scopedApplyLine = meta.findingLocation
            ? meta.findingLocation.startLine
            : undefined;
          issues.push({
            ruleName,
            ruleShortName: shortName,
            ruleDescription: description,
            resourceHeader: meta.resourceHeader,
            filePath: filepath,
            line,
            scopedApplyLine,
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
          const diagnostic = new OrlRuleFixGombocDiagnostic(
            range,
            message,
            `Apply fix (${shortName})`,
            { ruleName, filePath: filepath },
            vscode.DiagnosticSeverity.Error,
          );
          diagnostic.source = 'Gomboc';
          diagnostic.resourceHeader = meta.resourceHeader;
          diagnostic.ruleShortName = shortName;
          diagnostic.ruleDescription = description;
          diagnostic.fixStrategy = metaHit?.fixStrategy;
          diagnostic.fixTask = metaHit?.fixTask;
          diagnostic.scopedApplyLine = scopedApplyLine;
          diagnostic.findingId = meta.findingLocation?.id;
          curDiag.push(diagnostic);
          orlIdx++;
        }

        // Keep "Apply all fixes" but only once (at the first diagnostic line).
        const firstLine =
          uniqueLines.size > 0 ? Math.min(...Array.from(uniqueLines)) : 1;
        const lineIdx = firstLine - 1;
        const contentLines = (fileContent ?? '').split('\n');
        const firstLineText =
          contentLines[
            Math.min(Math.max(0, lineIdx), Math.max(0, contentLines.length - 1))
          ] ?? '';
        const firstNonWs = firstLineText.search(/\S/);
        const gCol =
          firstNonWs >= 0 ? firstNonWs : firstLineText.length > 0 ? 0 : 0;
        const gEndCol =
          firstLineText.length > 0
            ? Math.min(gCol + 1, firstLineText.length)
            : 1;
        const startPosition = new vscode.Position(lineIdx, gCol);
        const endPosition = new vscode.Position(lineIdx, gEndCol);
        const groupedDiagnostic = new GroupedFixGombocDiagnostic(
          new vscode.Range(startPosition, endPosition),
          'Apply all fixes',
          'Apply all fixes',
          existingGroupedFixes[filepath],
          vscode.DiagnosticSeverity.Error,
        );
        groupedDiagnostic.source = 'Gomboc';
        curDiag.push(groupedDiagnostic);
      } else {
        // API mode (or legacy): keep individual per-fix diagnostics + grouped apply-all.
        for (const remediation of currentRemediation) {
          const operationAnchor =
            this.pickOperationDiagnosticAnchor(remediation);
          let startLine = operationAnchor.line;
          const startAnchor = fileHandler.resolveDiagnosticAnchorLine({
            content: fileContent ?? '',
            suggestedLine: startLine,
            fromFixOperation: operationAnchor.fromFixOperation,
          });
          startLine = startAnchor.line;
          const startPosition = new vscode.Position(
            startLine - 1,
            startAnchor.character,
          );
          uniqueLines.add(startLine);
          const endPosition = new vscode.Position(
            startLine - 1,
            Math.max(startAnchor.character + 1, 999),
          );

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
    const fileContentsByPath = new Map<string, string | undefined>();
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
      const fileContent = this.getFileTextForFix(
        fileContentsByPath,
        fix.filepath,
      );
      const inferredIndent =
        fix.codePosition.column <= 0
          ? this.getLineIndentation(fileContent, fix.codePosition.line)
          : '';
      if (fix.fixType === 'ADD') {
        let addIndent = ' '.repeat(fix.codePosition.column);
        if (fix.codePosition.column <= 0) {
          const normalizedNewLines = this.withInferredIndentation(
            fix.newLine,
            inferredIndent,
          );
          const normalizedValue = normalizedNewLines.join('\n');
          edit.insert(file, startPosition, `${normalizedValue}` + '\n');
        } else {
          edit.insert(file, startPosition, `${addIndent}${newValue}` + '\n');
        }
      } else if (fix.fixType === 'UPDATE') {
        const normalizedLines =
          fix.codePosition.column <= 0
            ? this.withInferredIndentation(fix.newLine, inferredIndent)
            : fix.newLine;
        edit.replace(file, range, `${normalizedLines.join('\n')}`);
      } else {
        // delete but delete type doesn't exist yet for us
        const deletePrefix =
          fix.codePosition.column > 0
            ? ' '.repeat(fix.codePosition.column)
            : inferredIndent;
        edit.replace(
          file,
          range,
          `${deletePrefix}Removed this line to fix ${fix.rule.name} with Gomboc`,
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
        const rule = r?.rule;
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
        vsCodeIntegrationsService
          .queueOrlFixAppliedEvent(workspacePath, {
            fixKind: 'individual',
            ruleNames: Array.from(ruleNamesSet),
            ruleIdentifiers,
            filePaths: files,
          })
          .catch(() => {});
      }
    }

    // once we apply a remediation we have to dispose and clear everything and re-run
    for (const file of updatedFiles) {
      const uri = vscode.Uri.file(file);
      let content: string | undefined;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        // ignore
      }
      const handler = content
        ? chooseLanguageImplementation({ filePath: file, content })
        : undefined;
      if (handler) {
        this.diagnosticCollectionManager.clearDiagnosticCollection(
          handler.diagnosticClearScope,
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
      const document = await vscode.workspace.openTextDocument(file);
      const groupedHandler = chooseLanguageImplementation({
        filePath: remediation.path,
        content: document.getText(),
      });
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
              .map(c => c?.rule?.id)
              .filter((id): id is string => typeof id === 'string')
              .filter(id => id.startsWith('orl-rule:')),
          ),
        );
        const ruleNamesSet = new Set<string>();
        for (const c of remediation.comments || []) {
          const rule = c?.rule;
          for (const ruleName of this.getRenderableOrlRuleNames(rule)) {
            ruleNamesSet.add(ruleName);
          }
        }
        const workspacePath = path.dirname(remediation.path);
        if (ruleIdentifiers.length > 0 || ruleNamesSet.size > 0) {
          vsCodeIntegrationsService
            .queueOrlFixAppliedEvent(workspacePath, {
              fixKind: 'grouped',
              ruleNames: Array.from(ruleNamesSet),
              ruleIdentifiers,
              filePaths: [remediation.path],
            })
            .catch(() => {});
        }
      } catch {
        // ignore analytics errors
      }

      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();
      }
      // once we apply a remediation we have to dispose and clear everything and re-run
      this.diagnosticCollectionManager.clearDiagnosticCollection(
        groupedHandler.diagnosticClearScope,
        file,
      );
      if (ScanResultsProvider.codeActionDisposable) {
        ScanResultsProvider.codeActionDisposable.dispose();
      }
    }
  }

  async applyOrlRuleRemediation(
    args: Array<{
      ruleName: string;
      filePath: string;
      line?: number;
      scopedApplyLine?: number;
      findingId?: string;
      resourceHeader?: string;
    }>,
  ) {
    const first = Array.isArray(args) ? args[0] : undefined;
    const ruleName = first?.ruleName;
    const filePath = first?.filePath;
    const line = first?.scopedApplyLine ?? first?.line;
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
    const docText = document.getText();
    const handler = chooseLanguageImplementation({
      filePath,
      content: docText,
    });
    const languageInfo = handler.getDocumentInfo({
      filePath,
      content: docText,
    });
    const language = mapLanguageIdToOrlLanguage({
      languageId: languageInfo.languageId,
      filePath,
    });
    if (!language) {
      vscode.window.showErrorMessage(
        `Unable to apply rule fix: unsupported language (${languageInfo.languageId || 'unknown'})`,
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
      // When a diagnostic line is available, prefer replacing only the language
      // handler scoped resource range. ORL returns full-file content for single-rule
      // runs, so this keeps "Apply fix" scoped to the selected resource instead of
      // applying all same-rule instances in the file.
      let appliedScopedEdit = false;
      const merged = this.mergeScopedOrlRemediation({
        filePath: absPath,
        beforeText: before,
        orlAfterText: content,
        line,
      });
      if (merged.kind === 'scoped') {
        changedAny = true;
        updatedFiles.add(absPath);
        const beforeLines = before.split('\n');
        const scopedRange = new vscode.Range(
          new vscode.Position(merged.startLine - 1, 0),
          new vscode.Position(
            merged.endLine - 1,
            beforeLines[merged.endLine - 1]?.length || 0,
          ),
        );
        edit.replace(doc.uri, scopedRange, merged.replacement);
        appliedScopedEdit = true;
      }

      if (!appliedScopedEdit) {
        changedAny = true;
        updatedFiles.add(absPath);
        const fullRange = new vscode.Range(
          doc.positionAt(0),
          doc.positionAt(doc.getText().length),
        );
        edit.replace(doc.uri, fullRange, content);
      }
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
      await vsCodeIntegrationsService.queueOrlFixAppliedEvent(workspacePath, {
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
