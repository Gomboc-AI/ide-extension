import * as vscode from 'vscode';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
} from './gombocDiagnostic';
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

    const diagnostics = context.diagnostics.filter(
      diagnostic =>
        this._isGombocGroupedFixDiagnostic(diagnostic) ||
        this._isGombocIndividualFixDiagnostic(diagnostic),
    );

    return diagnostics.reduce((acc, cur) => {
      if (this._isGombocGroupedFixDiagnostic(cur)) {
        return [...acc, this._createGroupedFixCommandCodeAction(cur)];
      } else if (this._isGombocIndividualFixDiagnostic(cur)) {
        return [...acc, this._createIndividualFixCommandCodeAction(cur)];
      }
      return acc;
    }, [] as vscode.CodeAction[]);
  }

  private _isGombocGroupedFixDiagnostic(
    diagnostic: vscode.Diagnostic,
  ): diagnostic is GroupedFixGombocDiagnostic {
    return diagnostic.hasOwnProperty('groupedFixGombocResult');
  }

  private _isGombocIndividualFixDiagnostic(
    diagnostic: vscode.Diagnostic,
  ): diagnostic is IndividualFixGombocDiagnostic {
    return diagnostic.hasOwnProperty('individualFixGombocResult');
  }

  private _createIndividualFixCommandCodeAction(
    diagnostic: IndividualFixGombocDiagnostic,
  ): vscode.CodeAction {
    const { quickFixMessage } = diagnostic;

    const action = new vscode.CodeAction(
      quickFixMessage,
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.applyIndividualRemediation',
      title: 'Gomboc fix',
      tooltip: 'This will apply Gomboc fix for the vulnerability',
      arguments: [[diagnostic.individualFixGombocResult]],
    };
    action.diagnostics = [diagnostic];
    return action;
  }

  private _createGroupedFixCommandCodeAction(
    diagnostic: GroupedFixGombocDiagnostic,
  ): vscode.CodeAction {
    const { quickFixMessage } = diagnostic;

    const action = new vscode.CodeAction(
      quickFixMessage,
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.applyGroupedRemediation',
      title: 'Gomboc fix',
      tooltip: 'This will apply all available fixes',
      arguments: [[diagnostic.groupedFixGombocResult]],
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
