import * as vscode from 'vscode';
import { ScanResultsProvider } from '../scanResultsProvider';
import type { DiagnosticCollectionManager } from '../../diagnosticCollectionManager';
import type { OrlClient } from '../../orl/orlClient';

jest.mock('../../orl/orlClient', () => ({
  createOrlClient: jest.fn(),
}));
jest.mock('../../utils/scanValidator', () => ({
  detectLanguageFromFile: jest.fn(() => 'terraform'),
}));
jest.mock('../../utils/integrationsService', () => ({
  vsCodeIntegrationsService: {
    queueOrlFixAppliedEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

import { createOrlClient } from '../../orl/orlClient';

type FakeDoc = {
  uri: vscode.Uri;
  fileName: string;
  getText: () => string;
  save: () => Promise<boolean>;
  positionAt: (offset: number) => vscode.Position;
};

function createProviderHarness() {
  (
    ScanResultsProvider as unknown as { scanResultsProviderInstance: unknown }
  ).scanResultsProviderInstance = null;
  const diagnosticCollection = { clear: jest.fn() };
  const diagnosticCollectionManager = {
    getDiagnosticCollection: jest.fn(() => diagnosticCollection),
    updateDiagnosticCollection: jest.fn(),
    clearDiagnosticCollection: jest.fn(),
  };
  const context = {
    extensionPath: '/ext',
    globalStorageUri: { fsPath: '/storage' },
    subscriptions: [],
    globalState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as vscode.ExtensionContext;

  const provider = ScanResultsProvider.init(
    context,
    diagnosticCollectionManager as unknown as DiagnosticCollectionManager,
  ) as ScanResultsProvider;
  return { provider, diagnosticCollectionManager };
}

describe('ScanResultsProvider branch deltas', () => {
  const setRemediations = (
    provider: ScanResultsProvider,
    remediation: {
      rule: { id: string; name: string; shortName: string };
      codeObservation: {
        codeResourceInstance: {
          filepath: string;
          line: number;
          name?: string;
          type: string;
        };
      };
      fixes: Array<{
        filepath: string;
        codePosition: { line: number; column: number };
        fixType: 'ADD' | 'DELETE' | 'UPDATE';
        newLine: string[];
      }>;
    },
  ) => {
    (
      provider as unknown as { individualRemediations: unknown[] }
    ).individualRemediations = [remediation];
    (
      provider as unknown as { groupedRemediations: unknown[] }
    ).groupedRemediations = [
      { path: '/repo/main.tf', content: '', comments: [] },
    ];
  };

  const getFirstDiagnosticStartLine = (
    diagnosticCollectionManager: ReturnType<
      typeof createProviderHarness
    >['diagnosticCollectionManager'],
  ): number => {
    const calls = (
      diagnosticCollectionManager.updateDiagnosticCollection as jest.Mock
    ).mock.calls;
    const diagnostics = calls[0][1] as Array<{ range: vscode.Range }>;
    return diagnostics[0].range.start.line;
  };

  afterEach(() => {
    (
      vscode.workspace as unknown as {
        textDocuments: Array<{
          uri: { fsPath: string };
          getText: () => string;
        }>;
      }
    ).textDocuments = [];
    (
      vscode.window as unknown as { activeTextEditor?: unknown }
    ).activeTextEditor = undefined;
    jest.clearAllMocks();
  });

  it('creates separate ORL diagnostics for same base rule on different lines', () => {
    const { provider, diagnosticCollectionManager } = createProviderHarness();

    const remediationBase = {
      rule: {
        id: 'orl-rule:abc',
        name: 'rule_alpha001',
        metadata: { short_name: 'rule alpha', description: 'desc' },
      },
      codeObservation: {
        codeResourceInstance: {
          filepath: '/repo/main.tf',
          line: 4,
          name: 'resource_a',
          type: 'aws_s3_bucket',
        },
      },
      fixes: [
        {
          codePosition: { line: 4, column: 0 },
          fixType: 'UPDATE',
          newLine: ['x'],
        },
      ],
    };

    (
      provider as unknown as { individualRemediations: unknown[] }
    ).individualRemediations = [
      remediationBase,
      {
        ...remediationBase,
        rule: {
          ...remediationBase.rule,
          name: 'rule_alpha002',
        },
        codeObservation: {
          codeResourceInstance: {
            ...remediationBase.codeObservation.codeResourceInstance,
            line: 9,
            name: 'resource_b',
          },
        },
        fixes: [
          {
            codePosition: { line: 9, column: 0 },
            fixType: 'UPDATE',
            newLine: ['y'],
          },
        ],
      },
    ];
    (
      provider as unknown as { groupedRemediations: unknown[] }
    ).groupedRemediations = [
      { path: '/repo/main.tf', content: '', comments: [] },
    ];

    provider.createDiagnostic();

    const calls = (
      diagnosticCollectionManager.updateDiagnosticCollection as jest.Mock
    ).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const diagnostics = calls[0][1] as Array<{
      ruleName?: string;
      message: string;
      range?: vscode.Range;
    }>;
    const orlDiagnostics = diagnostics.filter(
      d => typeof d.ruleName === 'string' && d.message !== 'Apply all fixes',
    );
    expect(orlDiagnostics).toHaveLength(2);
    const startLines = orlDiagnostics
      .map(d => d.range?.start.line)
      .filter((n): n is number => typeof n === 'number');
    expect(startLines).toEqual(expect.arrayContaining([3, 8]));
  });

  it('uses scoped Terraform replacement when line resolves to a resource block', async () => {
    const { provider } = createProviderHarness();
    const before = [
      'resource "aws_s3_bucket" "a" {',
      '  acl = "private"',
      '}',
      '',
      'resource "aws_s3_bucket" "b" {',
      '  acl = "private"',
      '}',
    ].join('\n');
    const after = [
      'resource "aws_s3_bucket" "a" {',
      '  acl = "private"',
      '}',
      '',
      'resource "aws_s3_bucket" "b" {',
      '  acl = "public-read"',
      '}',
    ].join('\n');

    const docByPath = new Map<string, FakeDoc>();
    const createDoc = (filePath: string, text: string): FakeDoc => ({
      uri: vscode.Uri.file(filePath),
      fileName: filePath,
      getText: () => text,
      save: jest.fn().mockResolvedValue(true),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    });
    docByPath.set('/repo/main.tf', createDoc('/repo/main.tf', before));

    (
      vscode.workspace.openTextDocument as unknown as jest.Mock
    ).mockImplementation(async (uri: vscode.Uri) => {
      const fsPath = (uri as unknown as { fsPath: string }).fsPath;
      return docByPath.get(fsPath) as unknown as vscode.TextDocument;
    });
    const applyEditMock = jest
      .mocked(vscode.workspace.applyEdit)
      .mockResolvedValue(true);
    jest.mocked(createOrlClient).mockResolvedValue({
      remediateSingleRule: jest.fn().mockResolvedValue({
        success: true,
        modifiedFiles: { '/workspace/main.tf': after },
      }),
    } as unknown as OrlClient);

    await provider.applyOrlRuleRemediation([
      { ruleName: 'rule_alpha', filePath: '/repo/main.tf', line: 5 },
    ]);

    const edit = applyEditMock.mock.calls[0][0] as unknown as {
      edits: Array<{ range: vscode.Range; newText: string }>;
    };
    expect(edit.edits[0].range.start.line).toBe(4);
    expect(edit.edits[0].newText).toContain('"b"');
    expect(edit.edits[0].newText).toContain('public-read');
    expect(edit.edits[0].newText).not.toContain('"a"');
  });

  it('falls back to full-file replacement when scoped block cannot be resolved', async () => {
    const { provider } = createProviderHarness();
    const before = 'terraform { required_version = ">= 1.0.0" }\n';
    const after = 'terraform { required_version = ">= 1.1.0" }\n';
    const doc: FakeDoc = {
      uri: vscode.Uri.file('/repo/main.tf'),
      fileName: '/repo/main.tf',
      getText: () => before,
      save: jest.fn().mockResolvedValue(true),
      positionAt: (offset: number) => new vscode.Position(0, offset),
    };

    (
      vscode.workspace.openTextDocument as unknown as jest.Mock
    ).mockResolvedValue(doc as unknown as vscode.TextDocument);
    const applyEditMock = jest
      .mocked(vscode.workspace.applyEdit)
      .mockResolvedValue(true);
    jest.mocked(createOrlClient).mockResolvedValue({
      remediateSingleRule: jest.fn().mockResolvedValue({
        success: true,
        modifiedFiles: { '/workspace/main.tf': after },
      }),
    } as unknown as OrlClient);

    await provider.applyOrlRuleRemediation([
      { ruleName: 'rule_alpha', filePath: '/repo/main.tf', line: 1 },
    ]);

    const edit = applyEditMock.mock.calls[0][0] as unknown as {
      edits: Array<{ range: vscode.Range; newText: string }>;
    };
    expect(edit.edits[0].newText).toBe(after);
  });

  it('applies ADD fixes with indentation from the target line when column is zero', async () => {
    const { provider } = createProviderHarness();
    (
      vscode.workspace as unknown as {
        textDocuments: Array<{
          uri: { fsPath: string };
          getText: () => string;
        }>;
      }
    ).textDocuments = [
      {
        uri: { fsPath: '/repo/main.tf' },
        getText: () =>
          [
            'resource "aws_instance" "explicit_bad" {',
            '  instance_type = "c5.large"',
            '}',
          ].join('\n'),
      },
    ];
    const applyEditMock = jest
      .mocked(vscode.workspace.applyEdit)
      .mockResolvedValue(true);

    await provider.applyIndividualRemediation([
      {
        rule: {
          id: 'api-rule:add',
          name: 'Add property',
          shortName: 'add_property',
        },
        codeObservation: {
          codeResourceInstance: {
            filepath: '/repo/main.tf',
            line: 2,
            type: 'terraform',
          },
          disposition: 'NonCompliant',
        },
        fixes: [
          {
            filepath: '/repo/main.tf',
            oldLine: '',
            newLine: ['ebs_optimized = false'],
            codePosition: { line: 2, column: 0 },
            lineOffset: 0,
            fixType: 'ADD',
          },
        ],
      },
    ]);

    const edit = applyEditMock.mock.calls[0][0] as unknown as {
      edits: Array<{ type: string; newText: string }>;
    };
    const insertEdit = edit.edits.find(e => e.type === 'insert');

    expect(insertEdit).toBeDefined();
    expect(insertEdit?.newText).toBe('  ebs_optimized = false\n');
  });

  it('applies UPDATE fixes with indentation from the target line when column is zero', async () => {
    const { provider } = createProviderHarness();
    (
      vscode.workspace as unknown as {
        textDocuments: Array<{
          uri: { fsPath: string };
          getText: () => string;
        }>;
      }
    ).textDocuments = [
      {
        uri: { fsPath: '/repo/main.tf' },
        getText: () =>
          [
            'resource "aws_instance" "explicit_bad" {',
            '  instance_type = "c5.large"',
            '}',
          ].join('\n'),
      },
    ];
    const applyEditMock = jest
      .mocked(vscode.workspace.applyEdit)
      .mockResolvedValue(true);

    await provider.applyIndividualRemediation([
      {
        rule: {
          id: 'api-rule:update',
          name: 'Update property',
          shortName: 'update_property',
        },
        codeObservation: {
          codeResourceInstance: {
            filepath: '/repo/main.tf',
            line: 2,
            type: 'terraform',
          },
          disposition: 'NonCompliant',
        },
        fixes: [
          {
            filepath: '/repo/main.tf',
            oldLine: '  instance_type = "c5.large"',
            newLine: ['instance_type = "c6i.large"'],
            codePosition: { line: 2, column: 0 },
            lineOffset: 0,
            fixType: 'UPDATE',
          },
        ],
      },
    ]);

    const edit = applyEditMock.mock.calls[0][0] as unknown as {
      edits: Array<{ type: string; newText: string }>;
    };
    const replaceEdit = edit.edits.find(e => e.type === 'replace');

    expect(replaceEdit).toBeDefined();
    expect(replaceEdit?.newText).toBe('  instance_type = "c6i.large"');
  });

  it('applies DELETE placeholder with indentation from the target line', async () => {
    const { provider } = createProviderHarness();
    (
      vscode.workspace as unknown as {
        textDocuments: Array<{
          uri: { fsPath: string };
          getText: () => string;
        }>;
      }
    ).textDocuments = [
      {
        uri: { fsPath: '/repo/main.tf' },
        getText: () =>
          [
            'resource "aws_instance" "explicit_bad" {',
            '  ebs_optimized = false',
            '}',
          ].join('\n'),
      },
    ];
    const applyEditMock = jest
      .mocked(vscode.workspace.applyEdit)
      .mockResolvedValue(true);

    await provider.applyIndividualRemediation([
      {
        rule: {
          id: 'api-rule:delete',
          name: 'Delete property',
          shortName: 'delete_property',
        },
        codeObservation: {
          codeResourceInstance: {
            filepath: '/repo/main.tf',
            line: 2,
            type: 'terraform',
          },
          disposition: 'NonCompliant',
        },
        fixes: [
          {
            filepath: '/repo/main.tf',
            oldLine: '  ebs_optimized = false',
            newLine: [],
            codePosition: { line: 2, column: 0 },
            lineOffset: 0,
            fixType: 'DELETE',
          },
        ],
      },
    ]);

    const edit = applyEditMock.mock.calls[0][0] as unknown as {
      edits: Array<{ type: string; newText: string }>;
    };
    const replaceEdit = edit.edits.find(e => e.type === 'replace');

    expect(replaceEdit).toBeDefined();
    expect(replaceEdit?.newText).toBe(
      '  Removed this line to fix Delete property with Gomboc',
    );
  });

  it('anchors UPDATE diagnostics to the update line', () => {
    const { provider, diagnosticCollectionManager } = createProviderHarness();
    setRemediations(provider, {
      rule: { id: 'api-rule:1', name: 'api_rule', shortName: 'api_rule' },
      codeObservation: {
        codeResourceInstance: {
          filepath: '/repo/main.tf',
          line: 25,
          type: 'terraform',
        },
      },
      fixes: [
        {
          filepath: '/repo/main.tf',
          codePosition: { line: 5, column: 0 },
          fixType: 'UPDATE',
          newLine: ['updated'],
        },
      ],
    });

    provider.createDiagnostic();

    expect(getFirstDiagnosticStartLine(diagnosticCollectionManager)).toBe(4);
  });

  it('anchors DELETE diagnostics to the delete line', () => {
    const { provider, diagnosticCollectionManager } = createProviderHarness();
    setRemediations(provider, {
      rule: { id: 'api-rule:1', name: 'api_rule', shortName: 'api_rule' },
      codeObservation: {
        codeResourceInstance: {
          filepath: '/repo/main.tf',
          line: 25,
          type: 'terraform',
        },
      },
      fixes: [
        {
          filepath: '/repo/main.tf',
          codePosition: { line: 6, column: 0 },
          fixType: 'DELETE',
          newLine: [''],
        },
      ],
    });

    provider.createDiagnostic();

    expect(getFirstDiagnosticStartLine(diagnosticCollectionManager)).toBe(5);
  });

  it('anchors ADD diagnostics to the previous line and clamps to line one', () => {
    const { provider, diagnosticCollectionManager } = createProviderHarness();
    setRemediations(provider, {
      rule: { id: 'api-rule:1', name: 'api_rule', shortName: 'api_rule' },
      codeObservation: {
        codeResourceInstance: {
          filepath: '/repo/main.tf',
          line: 25,
          type: 'terraform',
        },
      },
      fixes: [
        {
          filepath: '/repo/main.tf',
          codePosition: { line: 1, column: 0 },
          fixType: 'ADD',
          newLine: ['new'],
        },
      ],
    });

    provider.createDiagnostic();

    expect(getFirstDiagnosticStartLine(diagnosticCollectionManager)).toBe(0);
  });

  it('prefers UPDATE over ADD when both fixes exist', () => {
    const { provider, diagnosticCollectionManager } = createProviderHarness();
    setRemediations(provider, {
      rule: { id: 'api-rule:1', name: 'api_rule', shortName: 'api_rule' },
      codeObservation: {
        codeResourceInstance: {
          filepath: '/repo/main.tf',
          line: 25,
          type: 'terraform',
        },
      },
      fixes: [
        {
          filepath: '/repo/main.tf',
          codePosition: { line: 10, column: 0 },
          fixType: 'ADD',
          newLine: ['new'],
        },
        {
          filepath: '/repo/main.tf',
          codePosition: { line: 7, column: 0 },
          fixType: 'UPDATE',
          newLine: ['updated'],
        },
      ],
    });

    provider.createDiagnostic();

    expect(getFirstDiagnosticStartLine(diagnosticCollectionManager)).toBe(6);
  });
});
