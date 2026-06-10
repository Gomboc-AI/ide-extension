import * as vscode from 'vscode';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
  OrlRuleFixGombocDiagnostic,
} from './gombocDiagnostic';
export class CodeActionProvider implements vscode.CodeActionProvider {
  private _isRangeOnDiagnosticLine(
    range: vscode.Range | vscode.Selection,
    diagnostic: vscode.Diagnostic,
  ): boolean {
    const targetStartLine = range.start.line;
    const targetEndLine = range.end.line;
    return (
      diagnostic.range.start.line <= targetEndLine &&
      diagnostic.range.end.line >= targetStartLine
    );
  }

  // required function fo the codeActionProvider. This is what does the action
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const docDiagnostics = vscode.languages.getDiagnostics(document.uri) || [];
    const contextDiagnostics =
      context.diagnostics.length > 0
        ? context.diagnostics
        : docDiagnostics.filter(d => this._isRangeOnDiagnosticLine(range, d));
    if (contextDiagnostics.length === 0) {
      return [];
    }

    const diagnostics = contextDiagnostics.filter(
      diagnostic =>
        this._isGombocGroupedFixDiagnostic(diagnostic) ||
        this._isGombocIndividualFixDiagnostic(diagnostic) ||
        this._isOrlRuleFixDiagnostic(diagnostic),
    );

    // If the current selection range exactly matches a diagnostic range (common when
    // invoked from the Problems panel), prefer only that diagnostic to avoid showing
    // multiple quick-fix actions for overlapping diagnostics on the same line.

    // Never treat the grouped "Apply all" diagnostic as an exact-match anchor: its
    // range is intentionally full-line (0..999) and overlaps ORL rule diagnostics, so
    // Problems/lightbulb can pass that wide range and would otherwise hide per-rule fixes.
    const exactMatches = diagnostics.filter(
      d => !this._isGombocGroupedFixDiagnostic(d) && d.range.isEqual(range),
    );
    const scoped = exactMatches.length > 0 ? exactMatches : diagnostics;
    // Always keep grouped apply-all diagnostics available, even when exact-match scoping
    // narrows to a single ORL diagnostic from the Problems panel.
    const groupedDiagnostics = docDiagnostics.filter(d =>
      this._isGombocGroupedFixDiagnostic(d),
    );
    const scopedWithGrouped = [...scoped];
    for (const grouped of groupedDiagnostics) {
      if (!scopedWithGrouped.includes(grouped)) {
        scopedWithGrouped.push(grouped);
      }
    }

    return scopedWithGrouped.reduce((acc, cur) => {
      if (this._isGombocGroupedFixDiagnostic(cur)) {
        return [...acc, this._createGroupedFixCommandCodeAction(cur)];
      } else if (this._isGombocIndividualFixDiagnostic(cur)) {
        return [...acc, this._createIndividualFixCommandCodeAction(cur)];
      } else if (this._isOrlRuleFixDiagnostic(cur)) {
        const actions = [this._createOrlRuleFixCommandCodeAction(cur)];
        if (cur.fixStrategy === 'ai_prompt') {
          actions.push(this._createAiFixPromptCodeAction(cur));
        }
        return [...acc, ...actions];
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

  private _isOrlRuleFixDiagnostic(
    diagnostic: vscode.Diagnostic,
  ): diagnostic is OrlRuleFixGombocDiagnostic {
    return (
      diagnostic.hasOwnProperty('ruleName') &&
      diagnostic.hasOwnProperty('filePath')
    );
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

  private _createOrlRuleFixCommandCodeAction(
    diagnostic: OrlRuleFixGombocDiagnostic,
  ): vscode.CodeAction {
    const { quickFixMessage } = diagnostic;

    const action = new vscode.CodeAction(
      quickFixMessage,
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.applyOrlRuleRemediation',
      title: 'Gomboc fix',
      tooltip:
        'This will rerun ORL with only the selected rule and apply the results',
      arguments: [
        [
          {
            ruleName: diagnostic.ruleName,
            filePath: diagnostic.filePath,
            line:
              diagnostic.scopedApplyLine ??
              diagnostic.range.start.line + 1,
            findingId: diagnostic.findingId,
            resourceHeader: diagnostic.resourceHeader,
          },
        ],
      ],
    };
    action.diagnostics = [diagnostic];
    return action;
  }

  /**
   * ORL-only: open an AI prompt for non-deterministic fixes, then revalidate via FixProof.
   *
   * Note: VS Code itself does not have Cursor AI. This action prepares a safe, structured prompt
   * (and copies it to clipboard) so the user can run it in Cursor, then come back and verify.
   */
  private _createAiFixPromptCodeAction(
    diagnostic: OrlRuleFixGombocDiagnostic,
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Try AI Fix (validated)',
      vscode.CodeActionKind.QuickFix,
    );
    action.command = {
      command: 'gomboc-results.openAiFixPrompt',
      title: 'Try AI Fix (validated)',
      tooltip:
        'Opens a structured AI fix prompt and guides FixProof revalidation',
      arguments: [
        {
          ruleName: diagnostic.ruleName,
          filePath: diagnostic.filePath,
          resourceHeader: diagnostic.resourceHeader,
          ruleShortName: diagnostic.ruleShortName,
          ruleDescription: diagnostic.ruleDescription,
          fixTask: diagnostic.fixTask,
        },
      ],
    };
    action.diagnostics = [diagnostic];
    return action;
  }
}
