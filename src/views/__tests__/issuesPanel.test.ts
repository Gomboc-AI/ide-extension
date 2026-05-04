import * as vscode from 'vscode';
import { buildWebviewHtml, handleWebviewMessage } from '../issuesPanel';
import type { ScanResultsProvider } from '../../providers/scanResultsProvider';
import { fixProofCheckovVerifyForPanel } from '../../commands/fixProofCheckovVerify';

jest.mock('../../commands/fixProofCheckovVerify', () => ({
  fixProofCheckovVerifyForPanel: jest.fn().mockResolvedValue({
    ok: true,
    summary: 'ok',
  }),
}));
jest.mock(
  '../../fixpreviews/fixPreviewService.js',
  () => ({
    FixPreviewService: jest.fn().mockImplementation(() => ({
      previewRules: jest.fn().mockResolvedValue({ files: [] }),
    })),
  }),
  { virtual: true },
);
jest.mock(
  '../../fixpreviews/applyHunks.js',
  () => ({
    applyHunksToText: jest.fn((before: string) => before),
  }),
  { virtual: true },
);

describe('issuesPanel helpers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('buildWebviewHtml includes expected selection metadata fields', () => {
    const webview = {
      html: '',
      postMessage: jest.fn().mockResolvedValue(true),
      onDidReceiveMessage: jest.fn(),
      asWebviewUri: (uri: vscode.Uri) => uri,
      cspSource: 'vscode-resource:',
    };
    const html = buildWebviewHtml({
      webview: webview as unknown as vscode.Webview,
    });

    expect(html).toContain("String(Number.isFinite(i.line) ? i.line : '')");
    expect(html).toContain('i.resourceHeader ||');
    expect(html).toContain('line: i.line');
    expect(html).toContain('resourceHeader: i.resourceHeader');
  });

  it('previewSelected posts preview results', async () => {
    const post = jest.fn();
    const previewSelected = jest.fn().mockResolvedValue({ files: [] });
    const provider = {
      getCurrentIssuesSnapshot: jest.fn(() => ({ issues: [] })),
      getLastOrlScanContext: jest.fn(() => ({
        workspacePath: '/repo',
        language: 'terraform',
        scannedAt: 'now',
      })),
    } as unknown as ScanResultsProvider;

    await handleWebviewMessage({
      message: {
        type: 'previewSelected',
        issues: [{ ruleName: 'r', filePath: '/repo/main.tf' }],
      },
      panel: {} as vscode.WebviewPanel,
      service: { previewSelected } as unknown as never,
      scanResultsProvider: provider,
      post,
      lastPreviewContext: undefined,
      setLastPreviewContext: jest.fn(),
      applyKeptHunks: jest.fn(),
      applyFn: jest.fn(),
    });

    expect(previewSelected).toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'previewResult' }),
    );
  });

  it('applyPreviewSelection calls applyKeptHunks and posts success', async () => {
    const post = jest.fn();
    const previewSelected = jest.fn().mockResolvedValue({ files: [] });
    const applyKeptHunks = jest.fn().mockResolvedValue(undefined);

    await handleWebviewMessage({
      message: {
        type: 'applyPreviewSelection',
        files: [{ filePath: '/repo/main.tf', keptHunkFingerprints: ['abc'] }],
      },
      panel: {} as vscode.WebviewPanel,
      service: {
        previewSelected,
        clearCache: jest.fn(),
      } as unknown as never,
      scanResultsProvider: {} as ScanResultsProvider,
      post,
      lastPreviewContext: {
        scanScope: { workspacePath: '/repo', language: 'terraform' },
        selectedIssues: [{ ruleName: 'r', filePath: '/repo/main.tf' }],
      },
      setLastPreviewContext: jest.fn(),
      applyKeptHunks,
      applyFn: jest.fn(),
    });

    expect(applyKeptHunks).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'previewApplyResult',
        payload: expect.objectContaining({ ok: true }),
      }),
    );
  });

  it('openDiffInEditor executes vscode.diff command', async () => {
    (
      vscode.workspace.openTextDocument as unknown as jest.Mock
    ).mockResolvedValue({
      uri: vscode.Uri.file('/virtual/after'),
      getText: () => 'after',
    } as unknown as vscode.TextDocument);
    (vscode.commands.executeCommand as unknown as jest.Mock).mockResolvedValue(
      undefined,
    );
    const post = jest.fn();

    await handleWebviewMessage({
      message: {
        type: 'openDiffInEditor',
        filePath: '/repo/main.tf',
        afterText: 'after',
      },
      panel: {} as vscode.WebviewPanel,
      service: {} as never,
      scanResultsProvider: {} as ScanResultsProvider,
      post,
      lastPreviewContext: undefined,
      setLastPreviewContext: jest.fn(),
      applyKeptHunks: jest.fn(),
      applyFn: jest.fn(),
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.stringContaining('/repo/main.tf'),
      expect.anything(),
    );
  });

  it('verify posts failing summary when verify is not ok', async () => {
    (fixProofCheckovVerifyForPanel as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'verification failed',
    });
    const post = jest.fn();

    await handleWebviewMessage({
      message: { type: 'verify' },
      panel: {} as vscode.WebviewPanel,
      service: {} as never,
      scanResultsProvider: {} as ScanResultsProvider,
      post,
      lastPreviewContext: undefined,
      setLastPreviewContext: jest.fn(),
      applyKeptHunks: jest.fn(),
      applyFn: jest.fn(),
    });

    expect(post).toHaveBeenCalledWith({
      type: 'verifyResult',
      payload: { ok: false, summary: 'verification failed' },
    });
  });

  it('unknown message type does nothing and does not throw', async () => {
    const post = jest.fn();
    await expect(
      handleWebviewMessage({
        message: { type: 'unknown' } as unknown as never,
        panel: {} as vscode.WebviewPanel,
        service: {} as never,
        scanResultsProvider: {} as ScanResultsProvider,
        post,
        lastPreviewContext: undefined,
        setLastPreviewContext: jest.fn(),
        applyKeptHunks: jest.fn(),
        applyFn: jest.fn(),
      }),
    ).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });
});
