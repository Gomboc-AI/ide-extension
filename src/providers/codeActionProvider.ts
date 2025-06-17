import * as vscode from 'vscode';
import { GombocDiagnostic } from './gombocDiagnostic';
export class CodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];
  // required function fo the codeActionProvider. This is what does the action
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (context.diagnostics.length === 0) {
      return [];
    }
    const diagnostics = context.diagnostics.filter(diagnostic =>
      isGombocDiagnostic(diagnostic),
    );
    return diagnostics.map((diagnostic: GombocDiagnostic) =>
      this.createCommandCodeAction(diagnostic),
    );
  }

  // Create individual quick fix
  private createCommandCodeAction(
    diagnostic: GombocDiagnostic,
  ): vscode.CodeAction {
    const { quickFixMessage } = diagnostic;

    const gombocDiagnostic: GombocDiagnostic = diagnostic;
    const action = new vscode.CodeAction(
      quickFixMessage,
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.applyRemediation',
      title: 'Gomboc fix',
      tooltip: 'This will apply Gomboc fix for the vulnerability',
      arguments: [[gombocDiagnostic.gombocResult]],
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  async getFileFromPath(
    filePath: string,
  ): Promise<{ file: string; editor: vscode.TextEditor }> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    return { file: document.fileName, editor };
  }
}

function isGombocDiagnostic(
  diagnostic: vscode.Diagnostic,
): diagnostic is GombocDiagnostic {
  return (diagnostic as GombocDiagnostic).gombocResult !== undefined;
}
