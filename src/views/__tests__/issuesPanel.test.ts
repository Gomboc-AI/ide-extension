import * as vscode from 'vscode';
import { IssuesPanel } from '../issuesPanel';
import type { ScanResultsProvider } from '../../providers/scanResultsProvider';

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

describe('IssuesPanel branch deltas', () => {
  afterEach(() => {
    jest.clearAllMocks();
    (IssuesPanel as unknown as { currentPanel?: IssuesPanel }).currentPanel =
      undefined;
  });

  it('embeds unique keying with line/resource and includes line/resource in selected payloads', () => {
    const webview = {
      html: '',
      postMessage: jest.fn().mockResolvedValue(true),
      onDidReceiveMessage: jest.fn(),
      asWebviewUri: (uri: vscode.Uri) => uri,
    };
    const panel = {
      webview,
      reveal: jest.fn(),
      onDidDispose: jest.fn(),
      dispose: jest.fn(),
    } as unknown as vscode.WebviewPanel;

    jest.mocked(vscode.window.createWebviewPanel).mockReturnValue(panel);

    const fakeProvider = {
      getCurrentIssuesSnapshot: jest.fn(() => ({ issues: [] })),
      onDidUpdateIssues: jest.fn(
        (listener: (snapshot: unknown) => void) =>
          new vscode.Disposable(() => listener),
      ),
    } as unknown as ScanResultsProvider;
    const context = {
      extensionPath: '/ext',
      globalStorageUri: { fsPath: '/storage' },
    } as unknown as vscode.ExtensionContext;

    IssuesPanel.show(context, fakeProvider);
    const html = webview.html;

    expect(html).toContain("String(Number.isFinite(i.line) ? i.line : '')");
    expect(html).toContain('i.resourceHeader ||');
    expect(html).toContain('line: i.line');
    expect(html).toContain('resourceHeader: i.resourceHeader');
  });
});
