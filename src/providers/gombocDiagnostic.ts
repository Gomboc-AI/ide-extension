import * as vscode from 'vscode';
import { RemediationComment } from '../api/__generated__/graphql';
export class GombocDiagnostic extends vscode.Diagnostic {
  gombocResult: RemediationComment;
  quickFixMessage: string;
  constructor(
    range: vscode.Range,
    message: string,
    quickFixMessage: string,
    gombocResult: RemediationComment,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.gombocResult = gombocResult;
    this.quickFixMessage = quickFixMessage
  }
}
