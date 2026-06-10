import * as vscode from 'vscode';
import { CodeActionProvider } from '../codeActionProvider';
import {
  GroupedFixGombocDiagnostic,
  OrlRuleFixGombocDiagnostic,
} from '../gombocDiagnostic';

describe('CodeActionProvider', () => {
  const makeDocument = (uri: vscode.Uri): vscode.TextDocument =>
    ({ uri }) as vscode.TextDocument;
  const makeContext = (
    diagnostics: vscode.Diagnostic[],
  ): vscode.CodeActionContext =>
    ({
      diagnostics,
      // Use numeric enum value directly because our lightweight vscode Jest mock
      // does not currently expose CodeActionTriggerKind.
      triggerKind: 1,
      only: undefined,
    }) as vscode.CodeActionContext;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps grouped apply-all action available with exact ORL match', () => {
    const provider = new CodeActionProvider();
    const range = new vscode.Range(
      new vscode.Position(4, 0),
      new vscode.Position(4, 10),
    );
    const orlDiagnostic = new OrlRuleFixGombocDiagnostic(
      range,
      'Rule A',
      'Apply fix (Rule A)',
      { ruleName: 'rule_a001', filePath: '/repo/main.tf' },
      vscode.DiagnosticSeverity.Error,
    );
    const groupedDiagnostic = new GroupedFixGombocDiagnostic(
      new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 20)),
      'Apply all fixes',
      'Apply all fixes',
      { path: '/repo/main.tf', content: '', comments: [] },
      vscode.DiagnosticSeverity.Error,
    );

    (vscode.languages.getDiagnostics as unknown as jest.Mock).mockReturnValue([
      groupedDiagnostic,
      orlDiagnostic,
    ]);

    const actions = provider.provideCodeActions(
      makeDocument(vscode.Uri.file('/repo/main.tf')),
      range,
      makeContext([orlDiagnostic]),
      {} as vscode.CancellationToken,
    );

    const commandIds = actions
      .map(action => action.command?.command)
      .filter((v): v is string => typeof v === 'string');
    expect(commandIds).toContain('gomboc-results.applyOrlRuleRemediation');
    expect(commandIds).toContain('gomboc-results.applyGroupedRemediation');
  });

  it('prefers scopedApplyLine over diagnostic range for ORL command arguments', () => {
    const provider = new CodeActionProvider();
    const range = new vscode.Range(
      new vscode.Position(103, 0),
      new vscode.Position(103, 15),
    );
    const orlDiagnostic = new OrlRuleFixGombocDiagnostic(
      range,
      'Ebs encryption enabled',
      'Apply fix (Ebs encryption enabled)',
      {
        ruleName:
          'gomboc-ai/cloudformation/aws_ec2_volume/ebs-encryption-enabled000',
        filePath: '/repo/cfngoat.yaml',
      },
      vscode.DiagnosticSeverity.Error,
    );
    orlDiagnostic.scopedApplyLine = 103;

    const actions = provider.provideCodeActions(
      makeDocument(vscode.Uri.file('/repo/cfngoat.yaml')),
      range,
      makeContext([orlDiagnostic]),
      {} as vscode.CancellationToken,
    );

    const action = actions.find(
      a => a.command?.command === 'gomboc-results.applyOrlRuleRemediation',
    );
    expect(action?.command?.arguments).toEqual([
      [
        {
          ruleName:
            'gomboc-ai/cloudformation/aws_ec2_volume/ebs-encryption-enabled000',
          filePath: '/repo/cfngoat.yaml',
          line: 103,
          resourceHeader: undefined,
        },
      ],
    ]);
  });

  it('passes line and resource header in ORL command arguments', () => {
    const provider = new CodeActionProvider();
    const range = new vscode.Range(
      new vscode.Position(7, 0),
      new vscode.Position(7, 15),
    );
    const orlDiagnostic = new OrlRuleFixGombocDiagnostic(
      range,
      'Rule B',
      'Apply fix (Rule B)',
      { ruleName: 'rule_b002', filePath: '/repo/main.tf' },
      vscode.DiagnosticSeverity.Error,
    );
    orlDiagnostic.resourceHeader = 'resource "aws_s3_bucket" "example"';

    (vscode.languages.getDiagnostics as unknown as jest.Mock).mockReturnValue([
      orlDiagnostic,
    ]);

    const actions = provider.provideCodeActions(
      makeDocument(vscode.Uri.file('/repo/main.tf')),
      range,
      makeContext([orlDiagnostic]),
      {} as vscode.CancellationToken,
    );

    const action = actions.find(
      a => a.command?.command === 'gomboc-results.applyOrlRuleRemediation',
    );
    expect(action).toBeDefined();
    expect(action?.command?.arguments).toEqual([
      [
        {
          ruleName: 'rule_b002',
          filePath: '/repo/main.tf',
          line: 8,
          resourceHeader: 'resource "aws_s3_bucket" "example"',
        },
      ],
    ]);
  });

  it('falls back to same-line document diagnostics when context is empty', () => {
    const provider = new CodeActionProvider();
    const compactRange = new vscode.Range(
      new vscode.Position(10, 6),
      new vscode.Position(10, 12),
    );
    const cursorRangeOutsideCompact = new vscode.Range(
      new vscode.Position(10, 0),
      new vscode.Position(10, 0),
    );
    const orlDiagnostic = new OrlRuleFixGombocDiagnostic(
      compactRange,
      'Rule C',
      'Apply fix (Rule C)',
      { ruleName: 'rule_c003', filePath: '/repo/main.tf' },
      vscode.DiagnosticSeverity.Error,
    );
    const groupedDiagnostic = new GroupedFixGombocDiagnostic(
      new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 20)),
      'Apply all fixes',
      'Apply all fixes',
      { path: '/repo/main.tf', content: '', comments: [] },
      vscode.DiagnosticSeverity.Error,
    );

    (vscode.languages.getDiagnostics as unknown as jest.Mock).mockReturnValue([
      groupedDiagnostic,
      orlDiagnostic,
    ]);

    const actions = provider.provideCodeActions(
      makeDocument(vscode.Uri.file('/repo/main.tf')),
      cursorRangeOutsideCompact,
      makeContext([]),
      {} as vscode.CancellationToken,
    );

    const commandIds = actions
      .map(action => action.command?.command)
      .filter((v): v is string => typeof v === 'string');
    expect(commandIds).toContain('gomboc-results.applyOrlRuleRemediation');
    expect(commandIds).toContain('gomboc-results.applyGroupedRemediation');
  });
});
