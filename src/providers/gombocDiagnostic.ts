import * as vscode from 'vscode';
import {
  IndividualFixesRemediation,
  GroupedFixesRemediation,
} from '../api/client';
export class IndividualFixGombocDiagnostic extends vscode.Diagnostic {
  individualFixGombocResult: IndividualFixesRemediation;
  quickFixMessage: string;
  constructor(
    range: vscode.Range,
    message: string,
    quickFixMessage: string,
    individualFixGombocResult: IndividualFixesRemediation,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.individualFixGombocResult = individualFixGombocResult;
    this.quickFixMessage = quickFixMessage;
  }
}

export class GroupedFixGombocDiagnostic extends vscode.Diagnostic {
  groupedFixGombocResult: GroupedFixesRemediation;
  quickFixMessage: string;
  constructor(
    range: vscode.Range,
    message: string,
    quickFixMessage: string,
    groupedFixGombocResult: GroupedFixesRemediation,
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.groupedFixGombocResult = groupedFixGombocResult;
    this.quickFixMessage = quickFixMessage;
  }
}
