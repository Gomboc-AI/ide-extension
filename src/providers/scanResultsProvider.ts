import * as vscode from 'vscode';
import { ScanFileOrScenarioVscodeComments } from '../api/__generated__/graphql';
import { GombocDiagnostic } from './gombocDiagnostic';
import { CodeActionProvider } from './codeActionProvider';

export class ScanResultsProvider {
  public codeActionDisposable: vscode.Disposable | undefined;
  constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
    private results: ScanFileOrScenarioVscodeComments[],
  ) {
    this.results = [];
  }

  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyRemediation',
        (fixedResults, file) => {
          this.applyRemediation(fixedResults, file);
        },
      ),
    );
  }

  public generateComments(comments: ScanFileOrScenarioVscodeComments[]) {
    this.results = comments;
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    // clears the diagnostics and quick fixes
    this.diagnosticCollection.clear();
    if (this.codeActionDisposable) {
      this.codeActionDisposable.dispose;
    }
    for (const result of this.results) {
      // each result is one remediation
      const uri = vscode.Uri.parse(result.fileName);
      const diagnostic: GombocDiagnostic[] = [];
      // sometimes will be multiple diagnostics on a single file
      const curDiag = this.diagnosticCollection.get(uri) as GombocDiagnostic[];
      for (const fix of result.fixes) {
        const startPosition = new vscode.Position(fix.lineNumber, 0);
        const endPosition = new vscode.Position(fix.lineNumber, 999);

        diagnostic.push({
          message: result.description,
          gombocResult: result,
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc ',
        });
      }
      this.diagnosticCollection.set(uri, curDiag.concat(diagnostic));
    }
    this.addQuickFixes();
  }

  // Registers the code action providers so that they show up under each diagnostic
  addQuickFixes() {
    if (this.codeActionDisposable) {
      this.codeActionDisposable.dispose;
    }
    const file = this.getCurrentFile();
    this.codeActionDisposable = vscode.languages.registerCodeActionsProvider(
      {
        language: file.editor.document.languageId,
        scheme: file.editor.document.uri.scheme,
      },
      new CodeActionProvider(this.results, file, this.diagnosticCollection),
    );
  }

  // Uses the scan result + diagnostic in order to apply a fix
  applyRemediation(
    fixedResults: ScanFileOrScenarioVscodeComments,
    file: { file: string; editor: vscode.TextEditor },
    // diagnosticCollection: vscode.DiagnosticCollection,
    // fixAll: boolean,
    // fixLine: boolean,
  ) {
    file.editor.edit(editbuilder => {
      for (const fix of fixedResults.fixes) {
        const lineRange = file.editor.document.lineAt(fix.lineNumber).range;
        editbuilder.replace(lineRange, fix.newValue);
      }
    });
  }

  getCurrentFile(): { file: string; editor: vscode.TextEditor } {
    const opened = vscode.window.activeTextEditor;
    if (opened) {
      const file = opened.document.fileName;
      return { file: file, editor: opened };
    }
    throw new Error('function lacks active editor');
  }
}