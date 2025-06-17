import * as vscode from 'vscode';
import { GombocDiagnostic } from './gombocDiagnostic';
import { IndividualFixesQueryRemediation } from '../api/client';

export class ScanResultsProvider {
  public static codeActionDisposable: vscode.Disposable | undefined;
  private static scanResultsProviderInstance: ScanResultsProvider | null = null;

  private constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
    private remediations: IndividualFixesQueryRemediation[],
  ) {
    this.remediations = [];
  }

  static init(
    context: vscode.ExtensionContext,
    diagnosticCollection: vscode.DiagnosticCollection,
    remediations: IndividualFixesQueryRemediation[],
  ) {
    if (this.codeActionDisposable !== undefined) {
      this.codeActionDisposable.dispose();
    }
    if (this.scanResultsProviderInstance === null) {
      this.scanResultsProviderInstance = new ScanResultsProvider(
        context,
        diagnosticCollection,
        remediations,
      );
    }
    return this.scanResultsProviderInstance;
  }

  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyRemediation',
        fixedResults => {
          this.applyRemediation(fixedResults);
        },
      ),
    );
  }

  public generateComments(remediations: IndividualFixesQueryRemediation[]) {
    this.remediations = remediations;
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    // clears the diagnostics and quick fixes
    this.diagnosticCollection.clear();
    if (ScanResultsProvider.codeActionDisposable) {
      ScanResultsProvider.codeActionDisposable.dispose();
    }

    const diagnostic: GombocDiagnostic[] = [];

    // the key represents the file path to the file that needs remediation
    const existingResourceBenchmarkFixes: Record<
      string,
      IndividualFixesQueryRemediation[]
    > = {};
    let diagnosticTotal = 0;

    for (const remediation of this.remediations) {
      const filepath =
        remediation.codeObservation.codeResourceInstance.filepath;
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

    for (const filepath in existingResourceBenchmarkFixes) {
      const uri = vscode.Uri.parse(filepath);
      const currentRemediation = existingResourceBenchmarkFixes[filepath];
      const curDiag: GombocDiagnostic[] = [];
      for (const remediation of currentRemediation) {
        const startPosition = new vscode.Position(
          remediation.codeObservation.codeResourceInstance.line - 1,
          0,
        );
        const endPosition = new vscode.Position(
          remediation.codeObservation.codeResourceInstance.line - 1,
          999,
        );

        diagnosticTotal++;
        curDiag.push({
          message: `Fix for ${remediation.codeObservation.codeResourceInstance.type} to enforce apply recommendation ${remediation.benchmarkRecommendation.name}`,
          gombocResult: remediation,
          quickFixMessage: `Enforce ${remediation.benchmarkRecommendation.name} for ${remediation.codeObservation.codeResourceInstance.type}`,
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc ',
        });
      }
      this.diagnosticCollection.set(uri, curDiag.concat(diagnostic));
    }
    diagnosticTotal += diagnostic.length;
    vscode.window.showInformationMessage(
      `We completed a scan of your IaC and found ${diagnosticTotal} fixes to comply with your organization's selected benchmarks.`,
    );
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyRemediation(remediations: IndividualFixesQueryRemediation[]) {
    const edit = new vscode.WorkspaceEdit();
    for (const remediation of remediations) {
      let offset = 0;
      // Fixes are assumed to be in order.
      // With VScode, the edits are made without the previous fix, so an offset is needed
      for (const fix of remediation.fixes) {
        const fixPosition = fix.codePosition.line - 1 - offset;
        let startPosition = new vscode.Position(fixPosition, 0);
        offset = offset + fix.lineOffset;
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
          edit.replace(file, range, newValue);
        } else {
          // delete but delete type doesn't exist yet for us
          edit.delete(file, range);
        }
      }
    }
    const success = await vscode.workspace.applyEdit(edit);

    if (success) {
      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();

        // once we apply a remediation we have to dispose and clear everything and re-run
        this.diagnosticCollection.clear();
        if (ScanResultsProvider.codeActionDisposable) {
          ScanResultsProvider.codeActionDisposable.dispose();
        }
        vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
        return;
      }
    }
    // once we apply a remediation we have to dispose and clear everything and re-run
    this.diagnosticCollection.clear();
    if (ScanResultsProvider.codeActionDisposable) {
      ScanResultsProvider.codeActionDisposable.dispose();
    }
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
