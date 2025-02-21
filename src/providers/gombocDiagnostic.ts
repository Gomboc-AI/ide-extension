import * as vscode from 'vscode';
import { ScanLocalScenarioComments } from '../api/__generated__/graphql';
export class GombocDiagnostic extends vscode.Diagnostic {
  gombocResult: ScanLocalScenarioComments;
  constructor(
    range: vscode.Range,
    message: string,
    gombocResult: ScanLocalScenarioComments,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.gombocResult = gombocResult;
  }
}
