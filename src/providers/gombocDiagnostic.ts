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

/**
 * ORL-only: a synthetic diagnostic representing "apply this single ORL rule".
 * The handler reruns ORL with only this rule and applies the resulting file updates.
 */
export class OrlRuleFixGombocDiagnostic extends vscode.Diagnostic {
  ruleName: string;
  filePath: string;
  resourceHeader?: string;
  ruleShortName?: string;
  ruleDescription?: string;
  quickFixMessage: string;

  constructor(
    range: vscode.Range,
    message: string,
    quickFixMessage: string,
    args: { ruleName: string; filePath: string },
    severity?: vscode.DiagnosticSeverity,
  ) {
    super(range, message, severity);
    this.ruleName = args.ruleName;
    this.filePath = args.filePath;
    this.quickFixMessage = quickFixMessage;
  }
}
