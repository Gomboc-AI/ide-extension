import * as vscode from 'vscode';
import { ScanFileOrScenarioVscodeComments } from '../api/__generated__/graphql';
import { GombocDiagnostic } from './gombocDiagnostic';

export class ScanResultsProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
    private comments: ScanFileOrScenarioVscodeComments[],
  ) {
    this.comments = [];
  }

  // used to link up the comments to the diff? possibly? tbd
  async generateComments(comments: ScanFileOrScenarioVscodeComments[]) {
    // if we need to do some rearranging of some sort we should do that here
    this.comments = comments;
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  async createDiagnostic() {
    this.diagnosticCollection.clear();
    for (const result of this.comments) {
      const uri = vscode.Uri.parse(result.filePath);
      const diagnostic: GombocDiagnostic[] = [];
      for (const comment of result.commentData) {
        const startPosition = new vscode.Position(comment.lineNumber, 0);
        const endPosition = new vscode.Position(comment.lineNumber, 999);

        // in future we can add more information here, and link to code changes
        diagnostic.push({
          message: comment.text,
          gombocResult: result,
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc ',
        });
      }
      this.diagnosticCollection.set(uri, diagnostic);
    }
  }
}
