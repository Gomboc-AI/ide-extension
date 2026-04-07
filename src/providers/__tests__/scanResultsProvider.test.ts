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
  queueOrlFixAppliedEvent: jest.fn().mockResolvedValue(undefined),
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
  afterEach(() => {
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
});
