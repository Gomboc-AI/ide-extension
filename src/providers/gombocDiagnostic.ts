import * as vscode from 'vscode';
import { RemediationComment } from '../api/__generated__/graphql';
export class GombocDiagnostic extends vscode.Diagnostic {
  gombocResult: RemediationComment;
  constructor(
    range: vscode.Range,
    message: string,
    gombocResult: RemediationComment,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.gombocResult = gombocResult;
  }
}
