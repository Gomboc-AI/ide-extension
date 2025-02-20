import * as vscode from 'vscode';
import { ScanFileOrScenarioVscodeComments } from '../api/__generated__/graphql';
import { GombocDiagnostic } from './gombocDiagnostic';

export class ScanResultsProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
    private results: ScanFileOrScenarioVscodeComments[],
  ) {
    this.results = [];
  }

  // used to link up the comments to the diff? possibly? tbd
  async generateComments(results: ScanFileOrScenarioVscodeComments[]) {
    // if we need to do some rearranging of some sort we should do that here
    this.results = results;
  }

  // public registerSettings() {
  //   this.context.subscriptions.push(
  //     vscode.commands.registerCommand(commands)
  //   )
  // }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  async createDiagnostic() {
    this.diagnosticCollection.clear();
    for (const result of this.results) {
      // each result is one remediation
      const diagnostic: GombocDiagnostic[] = [];
      const uri = vscode.Uri.parse(result.fileName);
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
      this.diagnosticCollection.set(uri, diagnostic);
    }
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyRemediation() {}
}
