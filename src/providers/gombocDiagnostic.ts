import * as vscode from 'vscode';
import { ScanFileOrScenarioVscodeComments } from '../api/__generated__/graphql';
export class GombocDiagnostic extends vscode.Diagnostic {
  gombocResult: ScanFileOrScenarioVscodeComments;
  constructor(
    range: vscode.Range,
    message: string,
    gombocResult: ScanFileOrScenarioVscodeComments,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.gombocResult = gombocResult;
  }
}
