import * as vscode from 'vscode';
import { IndividualFixesQueryRemediation } from '../api/client';
export class GombocDiagnostic extends vscode.Diagnostic {
  gombocResult: IndividualFixesQueryRemediation;
  quickFixMessage: string;
  constructor(
    range: vscode.Range,
    message: string,
    quickFixMessage: string,
    gombocResult: IndividualFixesQueryRemediation,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.gombocResult = gombocResult;
    this.quickFixMessage = quickFixMessage;
  }
}
