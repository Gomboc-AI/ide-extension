import * as vscode from 'vscode';
import * as path from 'path';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
  OrlRuleFixGombocDiagnostic,
} from './gombocDiagnostic';
import {
  Fixes,
  GroupedFixesRemediation,
  IndividualFixesQuerySuccess,
  IndividualFixesRemediation,
} from '../api/client';
import { FixType } from '../api/__generated__/graphql';
import { DiagnosticCollectionManager } from '../diagnosticCollectionManager';
import { getInfrastructureToolFromFileUri } from '../infrastructureTool';
import { queueOrlFixAppliedEvent } from '../utils/integrationsService';
import { createOrlClient } from '../orl/orlClient';
import { detectLanguageFromFile } from '../utils/scanValidator';
import logger from '../utils/logger';

type IndividualFix = IndividualFixesRemediation['fixes'][number] &
  Pick<
    Pick<IndividualFixesQuerySuccess, 'remediations'>['remediations'][number],
    'benchmarkRecommendation'
  >;

export class ScanResultsProvider {
  public static codeActionDisposable: vscode.Disposable | undefined;
  private static scanResultsProviderInstance: ScanResultsProvider | null = null;
  private individualRemediations: IndividualFixesRemediation[];
  private groupedRemediations: GroupedFixesRemediation[];
  private orlRuleDescriptions: Record<string, string>;
  private orlRuleShortNames: Record<string, string>;

  private constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollectionManager: DiagnosticCollectionManager,
  ) {
    this.individualRemediations = [];
    this.groupedRemediations = [];
    this.orlRuleDescriptions = {};
    this.orlRuleShortNames = {};
  }

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
  }

  public generateComments(
    remediations: Fixes & {
      orlRuleDescriptions?: any;
      orlRuleShortNames?: any;
    },
  ) {
    this.individualRemediations = remediations.individualFixes;
    this.groupedRemediations = remediations.groupedFixes;
    this.orlRuleDescriptions =
      (remediations as any)?.orlRuleDescriptions &&
      typeof (remediations as any).orlRuleDescriptions === 'object'
        ? ((remediations as any).orlRuleDescriptions as Record<string, string>)
        : {};
    this.orlRuleShortNames =
      (remediations as any)?.orlRuleShortNames &&
      typeof (remediations as any).orlRuleShortNames === 'object'
        ? ((remediations as any).orlRuleShortNames as Record<string, string>)
        : {};
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    // the key represents the file path to the file that needs remediation
    const existingResourceBenchmarkFixes: Record<
      string,
      IndividualFixesRemediation[]
    > = {};
    const existingGroupedFixes: Record<string, GroupedFixesRemediation> = {};
    let diagnosticTotal = 0;

    for (const remediation of this.individualRemediations) {
      const filepath =
        remediation.codeObservation.codeResourceInstance.filepath;
      if (remediation.fixes.length === 0) {
        continue;
      }
      const existingData = existingResourceBenchmarkFixes[filepath];
      if (!existingData) {
        existingResourceBenchmarkFixes[filepath] = [remediation];
      } else {
        existingResourceBenchmarkFixes[filepath] = [
          remediation,
          ...existingData,
        ];
      }
    }
    // Ensures that each file only has one grouped remediation
    for (const remediation of this.groupedRemediations) {
      const filepath = remediation.path;
      existingGroupedFixes[filepath] = remediation;
    }

    for (const filepath in existingResourceBenchmarkFixes) {
      // note: file at this piont has \ -> will cause issues when we give it to diagnosticCollection
      // later as vscode expects a uri to have it's unix style / pathing
      // use Uri.file to get unix style, Uri.parse gets the windows style
      const uri = vscode.Uri.file(filepath);
      const currentRemediation = existingResourceBenchmarkFixes[filepath];
      const curDiag: Array<
        | IndividualFixGombocDiagnostic
        | GroupedFixGombocDiagnostic
        | OrlRuleFixGombocDiagnostic
      > = [];
      const uniqueLines = new Set<number>();

      const isOrl = (r: any): boolean =>
        typeof r?.benchmarkRecommendation?.id === 'string' &&
        r.benchmarkRecommendation.id.startsWith('orl-rule:');

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
          const br = remediation?.benchmarkRecommendation as any;
          const embedded = br?.orlRuleNames;
          const ruleNames: string[] = Array.isArray(embedded)
            ? embedded.filter((x: any) => typeof x === 'string' && x.trim())
            : typeof br?.id === 'string' && br.id.startsWith('orl-rule:')
              ? [br.id.replace(/^orl-rule:/, '')]
              : [];

          // Pick a reasonable anchor line for diagnostics.
          let line: number =
            remediation?.codeObservation?.codeResourceInstance?.line ||
            remediation?.fixes?.[0]?.codePosition?.line ||
            1;
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
            if (fix.fixType === FixType.Add) {
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
            message: `${remediation.benchmarkRecommendation.name}`,
            individualFixGombocResult: remediation,
            quickFixMessage: `Fix with Gomboc ${remediation.benchmarkRecommendation.name} for ${remediation.codeObservation.codeResourceInstance.type}`,
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
      `Gomboc found ${diagnosticTotal} fixes`,
    );
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyIndividualRemediation(remediations: IndividualFixesRemediation[]) {
    const edit = new vscode.WorkspaceEdit();
    const updatedFiles = new Set<string>();
    const allFixes: IndividualFix[] = remediations.reduce((acc, curr) => {
      const currentFixes: IndividualFix[] = curr.fixes.map(fix => ({
        ...fix,
        benchmarkRecommendation: curr.benchmarkRecommendation,
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
          `Removed this line to fix ${fix.benchmarkRecommendation.name} with Gomboc`,
        );
      }
    }
    const success = await vscode.workspace.applyEdit(edit);

    // Emit "ORL fix applied" analytics (best-effort) when the edit succeeds.
    if (success) {
      const ruleIdentifiers = Array.from(
        new Set(
          remediations
            .map(r => r?.benchmarkRecommendation?.id)
            .filter((id): id is string => typeof id === 'string')
            .filter(id => id.startsWith('orl-rule:')),
        ),
      );
      const ruleNamesSet = new Set<string>();
      for (const r of remediations) {
        const br: any = r?.benchmarkRecommendation as any;
        const embedded = br?.orlRuleNames;
        if (Array.isArray(embedded)) {
          for (const rn of embedded) {
            if (typeof rn === 'string' && rn.trim()) {
              ruleNamesSet.add(rn);
            }
          }
          continue;
        }
        const id = br?.id;
        if (typeof id === 'string' && id.startsWith('orl-rule:')) {
          const rn = id.slice('orl-rule:'.length);
          if (rn && rn !== 'multiple') {
            ruleNamesSet.add(rn);
          }
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
              .map((c: any) => c?.benchmarkRecommendation?.id)
              .filter((id: any): id is string => typeof id === 'string')
              .filter(id => id.startsWith('orl-rule:')),
          ),
        );
        const ruleNamesSet = new Set<string>();
        for (const c of remediation.comments || []) {
          const br: any = (c as any)?.benchmarkRecommendation;
          const embedded = br?.orlRuleNames;
          if (Array.isArray(embedded)) {
            for (const rn of embedded) {
              if (typeof rn === 'string' && rn.trim()) {
                ruleNamesSet.add(rn);
              }
            }
            continue;
          }
          const id = br?.id;
          if (typeof id === 'string' && id.startsWith('orl-rule:')) {
            const rn = id.slice('orl-rule:'.length);
            if (rn && rn !== 'multiple') {
              ruleNamesSet.add(rn);
            }
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

    const orlClient = createOrlClient(this.context.extensionPath);
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
