import * as vscode from 'vscode';
import { GombocDiagnostic } from './gombocDiagnostic';
import { ScanFileOrScenarioVscodeComments } from '../api/__generated__/graphql';
export class CodeActionProvider implements vscode.CodeActionProvider {
  private results;
  private readonly file: { file: string; editor: vscode.TextEditor };
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];
  private readonly fixableResults = [];

  constructor(
    results: ScanFileOrScenarioVscodeComments[],
    file: { file: string; editor: vscode.TextEditor },
    diagnosticCollection: vscode.DiagnosticCollection,
  ) {
    this.results = results;
    (this.file = file), (this.diagnosticCollection = diagnosticCollection);
  }

  // required function fo the codeActionProvider. This is what does the action
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    // goes through all the diagnostics and applies the code changes
    return context.diagnostics
      .filter(isGombocDiagnostic)
      .map((diagnostic: GombocDiagnostic) =>
        this.createCommandCodeAction(diagnostic),
      );
    // when ready for the apply all, add it here
  }

  // Create individual quick fix
  private createCommandCodeAction(
    diagnostic: GombocDiagnostic,
  ): vscode.CodeAction {
    const message = diagnostic.message;

    const gombocDiagnostic: GombocDiagnostic = diagnostic;
    const action = new vscode.CodeAction(
      'Apply fix to ' + message,
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.applyRemediation',
      title: 'Gomboc fix',
      tooltip: 'This will apply Gomboc fix for the vulnerability',
      arguments: [
        gombocDiagnostic.gombocResult,
        this.file,
        this.diagnosticCollection,
        false,
        false,
      ],
    };
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    return action;
  }

  // create a quick fix for the entire file
  // private createFixFileCodeAction(
  //   diagnostic: vscode.Diagnostic,
  //   fixableResults,
  // ): vscode.CodeAction[] {
  //   const action = new vscode.CodeAction(
  //     'File : Apply all available fixes',
  //     vscode.CodeActionKind.QuickFix,
  //   );

  //   action.command = {
  //     command: 'gomboc-results.applyRemediation',
  //     title: 'Gomboc fix',
  //     tooltip: 'This will apply Gomboc fix for the vulnerability',
  //     arguments: [
  //       fixableResults,
  //       this.results,
  //       this.file,
  //       this.diagnosticCollection,
  //       true,
  //       false,
  //     ],
  //   };

  //   action.diagnostics = [diagnostic];
  //   action.isPreferred = true;
  //   return [action];
  // }
}

function isGombocDiagnostic(
  diagnostic: vscode.Diagnostic,
): diagnostic is GombocDiagnostic {
  return (diagnostic as GombocDiagnostic).gombocResult !== undefined;
}
