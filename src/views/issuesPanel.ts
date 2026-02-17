import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import { fixProofCheckovVerifyForPanel } from '../commands/fixProofCheckovVerify';
import { FixPreviewService } from '../fixpreviews/fixPreviewService.js';
import { applyHunksToText } from '../fixpreviews/applyHunks.js';

type IssuesPanelToExtMessage =
  | { type: 'ready' }
  | { type: 'requestSnapshot' }
  | { type: 'openFile'; filePath: string; line?: number }
  | { type: 'rescan' }
  | {
      type: 'applySelected';
      issues: Array<{ ruleName: string; filePath: string }>;
    }
  | {
      type: 'previewSelected';
      issues: Array<{ ruleName: string; filePath: string }>;
    }
  | {
      type: 'applyPreviewSelection';
      files: Array<{ filePath: string; keptHunkFingerprints: string[] }>;
    }
  | { type: 'openDiffInEditor'; filePath: string; afterText: string }
  | { type: 'verify' };

type ExtToIssuesPanelMessage =
  | { type: 'snapshot'; payload: any }
  | {
      type: 'applyProgress';
      payload: {
        done: number;
        total: number;
        ruleName?: string;
        filePath?: string;
      };
    }
  | { type: 'applyResult'; payload: { ok: boolean; error?: string } }
  | {
      type: 'previewProgress';
      payload: {
        done: number;
        total: number;
        ruleName?: string;
        filePath?: string;
      };
    }
  | { type: 'previewResult'; payload: any }
  | { type: 'previewError'; payload: { message: string } }
  | { type: 'previewApplyResult'; payload: { ok: boolean; message?: string } }
  | { type: 'verifyResult'; payload: { ok: boolean; summary: string } }
  | {
      type: 'toast';
      payload: { kind: 'info' | 'warn' | 'error'; message: string };
    };

export class IssuesPanel {
  private static currentPanel: IssuesPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly scanResultsProvider: ScanResultsProvider;
  private readonly fixPreviewService: FixPreviewService;
  private readonly disposables: vscode.Disposable[] = [];
  private lastPreviewContext:
    | {
        scanScope: {
          workspacePath: string;
          language: string;
          scannedAt?: string;
        };
        selectedIssues: Array<{ ruleName: string; filePath: string }>;
      }
    | undefined;

  public static show(
    context: vscode.ExtensionContext,
    scanResultsProvider: ScanResultsProvider,
  ): IssuesPanel {
    if (IssuesPanel.currentPanel) {
      IssuesPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return IssuesPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'gombocIssues',
      'Gomboc: Open Fix Reviewer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    IssuesPanel.currentPanel = new IssuesPanel(
      panel,
      context,
      scanResultsProvider,
    );
    return IssuesPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    scanResultsProvider: ScanResultsProvider,
  ) {
    this.panel = panel;
    this.context = context;
    this.scanResultsProvider = scanResultsProvider;
    this.fixPreviewService = new FixPreviewService({
      extensionPath: context.extensionPath,
      storagePath: context.globalStorageUri.fsPath,
    });

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (m: IssuesPanelToExtMessage) => this.onMessage(m),
      undefined,
      this.disposables,
    );

    // Live updates on scans.
    this.disposables.push(
      this.scanResultsProvider.onDidUpdateIssues(snapshot => {
        this.post({ type: 'snapshot', payload: snapshot });
      }),
    );
  }

  private post(message: ExtToIssuesPanelMessage): void {
    this.panel.webview.postMessage(message).then(
      () => {},
      () => {},
    );
  }

  private async onMessage(message: IssuesPanelToExtMessage): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const snapshot = this.scanResultsProvider.getCurrentIssuesSnapshot();
        this.post({ type: 'snapshot', payload: snapshot });
        return;
      }
      case 'requestSnapshot': {
        const snapshot = this.scanResultsProvider.getCurrentIssuesSnapshot();
        this.post({ type: 'snapshot', payload: snapshot });
        return;
      }
      case 'openFile': {
        const fp = (message.filePath || '').trim();
        if (!fp) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(fp),
        );
        const editor = await vscode.window.showTextDocument(doc, {
          preview: false,
          viewColumn: vscode.ViewColumn.One,
        });
        const line = Number.isFinite(message.line)
          ? (message.line as number)
          : undefined;
        if (line && line > 0) {
          const pos = new vscode.Position(line - 1, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter,
          );
        }
        return;
      }
      case 'rescan': {
        vscode.commands.executeCommand('gomboc-vscode-extension.scanFile').then(
          () => {},
          () => {},
        );
        return;
      }
      case 'applySelected': {
        const issues = Array.isArray(message.issues) ? message.issues : [];
        if (!issues.length) {
          this.post({
            type: 'toast',
            payload: { kind: 'info', message: 'No issues selected.' },
          });
          return;
        }

        // Guardrail: cap bulk size.
        const capped = issues.slice(0, 10);
        if (issues.length > capped.length) {
          this.post({
            type: 'toast',
            payload: {
              kind: 'warn',
              message: `Selection capped at ${capped.length} issues (v1 guardrail).`,
            },
          });
        }

        const total = capped.length;
        for (let i = 0; i < capped.length; i++) {
          const cur = capped[i];
          this.post({
            type: 'applyProgress',
            payload: {
              done: i,
              total,
              ruleName: cur.ruleName,
              filePath: cur.filePath,
            },
          });
          try {
            await this.scanResultsProvider.applyOrlRuleRemediation([cur]);
          } catch (e) {
            this.post({
              type: 'applyResult',
              payload: {
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              },
            });
            return;
          }
        }

        this.post({ type: 'applyProgress', payload: { done: total, total } });
        this.post({ type: 'applyResult', payload: { ok: true } });
        return;
      }
      case 'previewSelected': {
        const issues = Array.isArray(message.issues) ? message.issues : [];
        if (!issues.length) {
          this.post({
            type: 'toast',
            payload: { kind: 'info', message: 'No issues selected.' },
          });
          return;
        }

        // Guardrail: cap preview size.
        const capped = issues.slice(0, 10);
        if (issues.length > capped.length) {
          this.post({
            type: 'toast',
            payload: {
              kind: 'warn',
              message: `Selection capped at ${capped.length} issues (v1 guardrail).`,
            },
          });
        }

        const last = this.scanResultsProvider.getLastOrlScanContext();
        const scopeWorkspacePath = last?.workspacePath;
        const scopeLanguage = last?.language;
        if (!scopeWorkspacePath || !scopeLanguage) {
          this.post({
            type: 'previewError',
            payload: {
              message:
                'Preview requires an ORL scan scope. Run an ORL scan first, then try preview again.',
            },
          });
          return;
        }

        try {
          const previewContext = {
            scanScope: {
              workspacePath: scopeWorkspacePath,
              language: scopeLanguage,
              scannedAt: last?.scannedAt,
            },
            selectedIssues: capped,
          };
          const result = await this.fixPreviewService.previewSelected({
            ...previewContext,
            onProgress: (p: {
              done: number;
              total: number;
              current?: { ruleName: string; filePath: string };
            }) => {
              this.post({
                type: 'previewProgress',
                payload: {
                  done: p.done,
                  total: p.total,
                  ruleName: p.current?.ruleName,
                  filePath: p.current?.filePath,
                },
              });
            },
          });
          this.lastPreviewContext = previewContext;
          this.post({ type: 'previewResult', payload: result });
        } catch (e) {
          this.post({
            type: 'previewError',
            payload: { message: e instanceof Error ? e.message : String(e) },
          });
        }
        return;
      }
      case 'applyPreviewSelection': {
        const files = Array.isArray(message.files) ? message.files : [];
        if (!files.length) {
          this.post({
            type: 'previewApplyResult',
            payload: { ok: false, message: 'No files to apply.' },
          });
          return;
        }
        if (files.length > 25) {
          this.post({
            type: 'previewApplyResult',
            payload: {
              ok: false,
              message: 'Refusing to apply: too many files selected (max 25).',
            },
          });
          return;
        }
        if (!this.lastPreviewContext) {
          this.post({
            type: 'previewApplyResult',
            payload: {
              ok: false,
              message: 'No preview context found. Run Preview again first.',
            },
          });
          return;
        }

        try {
          const preview = await this.fixPreviewService.previewSelected({
            ...this.lastPreviewContext,
          });
          const totalKeptHunks = files.reduce((sum, f) => {
            const kept = Array.isArray(f.keptHunkFingerprints)
              ? f.keptHunkFingerprints.length
              : 0;
            return sum + kept;
          }, 0);
          if (totalKeptHunks > 400) {
            throw new Error(
              'Refusing to apply: too many hunks selected (max 400).',
            );
          }
          await this.applyKeptHunks({
            preview,
            keptByFile: new Map(
              files.map(f => [
                f.filePath,
                new Set(
                  Array.isArray(f.keptHunkFingerprints)
                    ? f.keptHunkFingerprints
                    : [],
                ),
              ]),
            ),
          });
          this.post({
            type: 'previewApplyResult',
            payload: { ok: true, message: 'Applied kept changes.' },
          });

          // Rescan to refresh issues/preview.
          vscode.commands
            .executeCommand('gomboc-vscode-extension.scanFile')
            .then(
              () => {},
              () => {},
            );
        } catch (e) {
          this.post({
            type: 'previewApplyResult',
            payload: {
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            },
          });
        }
        return;
      }
      case 'openDiffInEditor': {
        const filePath = (message.filePath || '').trim();
        if (!filePath) {
          return;
        }
        const afterText =
          typeof message.afterText === 'string' ? message.afterText : '';
        const left = vscode.Uri.file(filePath);
        const rightDoc = await vscode.workspace.openTextDocument({
          content: afterText,
          language: 'plaintext',
        });
        await vscode.commands.executeCommand(
          'vscode.diff',
          left,
          rightDoc.uri,
          `Gomboc Preview: ${filePath}`,
          { preview: true },
        );
        return;
      }
      case 'verify': {
        try {
          const result = await fixProofCheckovVerifyForPanel(
            this.scanResultsProvider,
          );
          if (!result.ok) {
            this.post({
              type: 'verifyResult',
              payload: { ok: false, summary: result.error },
            });
            return;
          }
          if (result.allPassed) {
            this.post({
              type: 'verifyResult',
              payload: {
                ok: true,
                summary: `Third Party Compare: passed for ${result.checkCount} targeted checks.`,
              },
            });
            return;
          }
          this.post({
            type: 'verifyResult',
            payload: {
              ok: false,
              summary: `Third Party Compare: still failing for ${result.failingCheckIds.length} / ${result.checkCount} targeted checks.`,
            },
          });
        } catch (e) {
          this.post({
            type: 'verifyResult',
            payload: {
              ok: false,
              summary: e instanceof Error ? e.message : String(e),
            },
          });
        }
        return;
      }
    }
  }

  private async applyKeptHunks(args: {
    preview: any;
    keptByFile: Map<string, Set<string>>;
  }): Promise<void> {
    const preview = args.preview;
    const files: any[] = Array.isArray(preview?.files) ? preview.files : [];
    const edit = new vscode.WorkspaceEdit();
    for (const f of files) {
      const filePath = (f?.filePath || '').trim();
      if (!filePath) {
        continue;
      }
      const kept = args.keptByFile.get(filePath);
      if (!kept) {
        continue;
      }
      const beforeText = typeof f?.beforeText === 'string' ? f.beforeText : '';
      const hunks: any[] = Array.isArray(f?.hunks) ? f.hunks : [];

      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const current = doc.getText();
      if (current !== beforeText) {
        throw new Error(
          `Refusing to apply preview: file changed since preview was generated: ${filePath}`,
        );
      }

      const target = applyHunksToText({
        beforeText,
        hunks,
        keptFingerprints: kept,
      });
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(current.length),
      );
      edit.replace(uri, fullRange, target);
    }
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      throw new Error('Failed to apply preview changes.');
    }
    await vscode.workspace.saveAll(false);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const icons = {
      check: iconCheck(),
      search: iconSearch(),
      refresh: iconRefresh(),
      tool: iconTool(),
      undo: iconUndo(),
      apply: iconApply(),
      diff: iconDiff(),
    };
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gomboc: Open Fix Reviewer</title>
    <style>
      :root {
        --pad: 12px;
        --border: 1px solid var(--vscode-panel-border);
        --fg: var(--vscode-foreground);
        --muted: var(--vscode-descriptionForeground);
        --bg: var(--vscode-editor-background);
        --listBg: var(--vscode-sideBar-background);
        --btnBg: var(--vscode-button-background);
        --btnFg: var(--vscode-button-foreground);
        --btnBgHover: var(--vscode-button-hoverBackground);
        --warn: var(--vscode-notificationsWarningIcon-foreground);
        --err: var(--vscode-notificationsErrorIcon-foreground);
        --ok: var(--vscode-notificationsInfoIcon-foreground);
      }
      html, body { height: 100%; }
      body {
        padding: 0;
        margin: 0;
        color: var(--fg);
        background: var(--bg);
        font-family: -apple-system,BlinkMacSystemFont,Segoe WPC,Segoe UI,sans-serif;
      }
      .topbar {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: var(--pad);
        border-bottom: var(--border);
      }
      button {
        background: var(--btnBg);
        color: var(--btnFg);
        border: none;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover { background: var(--btnBgHover); }
      button.secondary {
        background: transparent;
        color: var(--fg);
        border: 1px solid var(--vscode-input-border);
      }
      .status { margin-left: auto; color: var(--muted); font-size: 12px; }
      .layout {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        height: calc(100% - 52px);
      }
      .list {
        border-right: var(--border);
        background: var(--listBg);
        overflow: auto;
      }
      .details {
        overflow: auto;
        padding: var(--pad);
      }
      .group {
        padding: 8px var(--pad);
        border-bottom: var(--border);
      }
      .group h3 {
        margin: 8px 0;
        font-size: 12px;
        color: var(--muted);
        font-weight: 600;
      }
      .item {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 8px;
        padding: 6px 0;
      }
      .title { font-size: 13px; }
      .meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
      .link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; }
      .pill {
        display: inline-block;
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 999px;
        border: 1px solid var(--vscode-input-border);
        color: var(--muted);
        margin-left: 6px;
      }
      .toast { font-size: 12px; color: var(--muted); padding: 0 var(--pad) var(--pad); }
      .previewWrap { padding: var(--pad); border-top: var(--border); }
      .previewHeader { display:flex; gap:8px; align-items:center; margin-bottom: 8px; }
      .previewActions { margin-left:auto; display:flex; gap:8px; align-items:center; }
      .loadingCard {
        display:flex;
        gap:10px;
        align-items:center;
        padding: 10px;
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        background: var(--vscode-editorWidget-background);
        margin: 8px 0 10px;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
        border-top-color: var(--vscode-foreground);
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .loadingText { font-size: 12px; color: var(--muted); }
      .previewFiles { display:flex; flex-direction: column; gap: 12px; }
      .previewFile { border: 1px solid var(--vscode-input-border); border-radius: 6px; overflow: hidden; }
      .previewFileTop { display:flex; justify-content: space-between; gap: 10px; padding: 8px 10px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-input-border); }
      .previewFileTop .meta { margin: 0; }
      .diff { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 12px; line-height: 1.4; padding: 10px; white-space: pre; overflow:auto; background: var(--vscode-editor-background); }
      .diffLine { display:block; }
      .diffAdd { background: color-mix(in srgb, var(--vscode-diffEditor-insertedTextBackground) 65%, transparent); }
      .diffDel { background: color-mix(in srgb, var(--vscode-diffEditor-removedTextBackground) 65%, transparent); }
      .diffCtx { color: var(--vscode-foreground); opacity: 0.9; }
      .smallBtn { padding: 4px 8px; font-size: 12px; }
      .btnInner { display:inline-flex; gap:6px; align-items:center; }
      .btnIcon { width: 14px; height: 14px; display:inline-block; color: var(--vscode-foreground); opacity: 0.9; }
      button.secondary .btnIcon { opacity: 0.8; }
      .hunk { border-top: 1px solid var(--vscode-input-border); }
      .hunkTop { display:flex; align-items:center; gap:8px; padding: 6px 10px; background: color-mix(in srgb, var(--vscode-editorWidget-background) 75%, transparent); border-bottom: 1px solid var(--vscode-input-border); }
      .hunkTop code { font-size: 11px; color: var(--muted); }
      .hunkTop .meta { margin: 0; }
      details.ctx { border-top: 1px solid var(--vscode-input-border); }
      details.ctx > summary { cursor: pointer; list-style: none; padding: 8px 10px; background: color-mix(in srgb, var(--vscode-editorWidget-background) 55%, transparent); }
      details.ctx > summary::-webkit-details-marker { display:none; }
      details.ctx > summary.ctxSummary { display:flex; gap:8px; align-items:flex-start; }
      details.ctx > summary.ctxSummary::before {
        content: '▸';
        font-size: 32px;
        line-height: 1;
        margin-top: -2px;
        color: var(--muted);
        flex: 0 0 auto;
      }
      details.ctx[open] > summary.ctxSummary::before { content: '▾'; }
      .ctxSummaryBody { display:flex; flex-direction: column; gap: 2px; }
      .ctxTitle { font-size: 12px; color: var(--vscode-foreground); opacity: 0.9; }
      .ctxMeta { font-size: 11px; color: var(--muted); margin-top: 2px; }
      .ctxBody { padding: 10px; white-space: pre; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 12px; line-height: 1.4; background: var(--vscode-editor-background); }
    </style>
  </head>
  <body>
    <div class="topbar">
      <button id="applySelectedBtn"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.check}</span><span>Apply selected</span></span></button>
      <button id="previewBtn" class="secondary"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.search}</span><span>Preview</span></span></button>
      <button id="rescanBtn" class="secondary"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.refresh}</span><span>Rescan</span></span></button>
      <button id="verifyBtn" class="secondary"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.tool}</span><span>Third Party Compare</span></span></button>
      <div id="status" class="status">Idle</div>
    </div>
    <div class="layout">
      <div class="list">
        <div id="toast" class="toast"></div>
        <div id="issues"></div>
      </div>
      <div class="details">
        <div id="detailsEmpty" class="meta">Select an issue to see details.</div>
        <div id="details" style="display:none"></div>
        <div id="preview" class="previewWrap" style="display:none">
          <div class="previewHeader">
            <div class="meta"><strong>Preview</strong></div>
            <div id="previewMeta" class="meta"></div>
            <div class="previewActions">
              <button id="previewKeepAllBtn" class="secondary smallBtn"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.check}</span><span>Keep all</span></span></button>
              <button id="previewUndoAllBtn" class="secondary smallBtn"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.undo}</span><span>Undo all</span></span></button>
              <button id="previewApplyKeptBtn" class="smallBtn"><span class="btnInner"><span class="btnIcon" aria-hidden="true">${icons.apply}</span><span>Apply kept changes</span></span></button>
            </div>
          </div>
          <div id="previewLoading" class="loadingCard" style="display:none">
            <div class="spinner" aria-hidden="true"></div>
            <div id="previewLoadingText" class="loadingText">Loading preview…</div>
          </div>
          <div id="previewFiles" class="previewFiles"></div>
        </div>
      </div>
    </div>

    <script nonce="${nonce}">
      const ICONS = ${JSON.stringify(icons)};
      const vscode = acquireVsCodeApi();
      const state = {
        snapshot: null,
        selectedKey: null,
        selectedSet: new Set(),
        preview: {
          payload: null,
          keptByFile: new Map(),
        },
      };

      const elIssues = document.getElementById('issues');
      const elStatus = document.getElementById('status');
      const elToast = document.getElementById('toast');
      const elDetails = document.getElementById('details');
      const elDetailsEmpty = document.getElementById('detailsEmpty');
      const elPreview = document.getElementById('preview');
      const elPreviewFiles = document.getElementById('previewFiles');
      const elPreviewMeta = document.getElementById('previewMeta');
      const elPreviewLoading = document.getElementById('previewLoading');
      const elPreviewLoadingText = document.getElementById('previewLoadingText');
      const elPreviewKeepAllBtn = document.getElementById('previewKeepAllBtn');
      const elPreviewUndoAllBtn = document.getElementById('previewUndoAllBtn');
      const elPreviewApplyKeptBtn = document.getElementById('previewApplyKeptBtn');

      function keyOf(i) { return i.ruleName + '|' + i.filePath; }
      function setStatus(s) { elStatus.textContent = s; }
      function toast(kind, message) {
        const color = kind === 'error' ? 'var(--err)' : kind === 'warn' ? 'var(--warn)' : 'var(--ok)';
        elToast.innerHTML = '<span style="color:' + color + ';">' + message + '</span>';
        setTimeout(() => { if (elToast.textContent === message) elToast.textContent = ''; }, 5000);
      }

      function renderDetails(issue) {
        if (!issue) {
          elDetails.style.display = 'none';
          elDetailsEmpty.style.display = 'block';
          return;
        }
        elDetailsEmpty.style.display = 'none';
        elDetails.style.display = 'block';
        const checkov = Array.isArray(issue.checkovIds) && issue.checkovIds.length
          ? issue.checkovIds.map(id => '<code>' + id + '</code>').join(', ')
          : '<span class="meta">none</span>';
        elDetails.innerHTML = \`
          <div class="title"><strong>\${escapeHtml(issue.ruleShortName || issue.ruleName)}</strong></div>
          <div class="meta">\${escapeHtml(issue.ruleName)}</div>
          <div style="height:10px"></div>
          <div class="meta"><strong>File</strong>: <span class="link" data-open="1">\${escapeHtml(issue.filePath)}</span></div>
          \${issue.resourceHeader ? '<div class="meta"><strong>Resource</strong>: ' + escapeHtml(issue.resourceHeader) + '</div>' : ''}
          \${issue.fixStrategy ? '<div class="meta"><strong>Fix strategy</strong>: <code>' + escapeHtml(issue.fixStrategy) + '</code></div>' : ''}
          <div class="meta"><strong>Checkov IDs</strong>: \${checkov}</div>
          <div style="height:10px"></div>
          <div class="meta"><strong>Description</strong></div>
          <div style="white-space:pre-wrap; margin-top:6px;">\${escapeHtml(issue.ruleDescription || '')}</div>
        \`;

        const openLink = elDetails.querySelector('[data-open="1"]');
        if (openLink) {
          openLink.addEventListener('click', () => {
            vscode.postMessage({ type: 'openFile', filePath: issue.filePath, line: issue.line });
          });
        }
      }

      function updateApplyKeptVisibility() {
        let anyKept = false;
        for (const set of state.preview.keptByFile.values()) {
          if (set && set.size > 0) {
            anyKept = true;
            break;
          }
        }
        elPreviewApplyKeptBtn.style.display = anyKept ? '' : 'none';
      }

      function renderPreview(payload) {
        const isNewPayload = payload !== state.preview.payload;
        state.preview.payload = payload;
        if (isNewPayload) {
          state.preview.keptByFile = new Map();
        }
        if (!payload || !Array.isArray(payload.files) || payload.files.length === 0) {
          elPreview.style.display = 'none';
          elPreviewLoading.style.display = 'none';
          elPreviewFiles.innerHTML = '';
          elPreviewMeta.textContent = '';
          updateApplyKeptVisibility();
          return;
        }
        elPreview.style.display = 'block';
        elPreviewMeta.textContent = payload.scannedAt ? ('scannedAt: ' + payload.scannedAt) : '';
        elPreviewLoading.style.display = 'none';
        elPreviewFiles.innerHTML = '';

        for (const f of payload.files) {
          const hunks = Array.isArray(f.hunks) ? f.hunks : [];
          let keptSet = state.preview.keptByFile.get(f.filePath);
          if (!keptSet) {
            keptSet = new Set(hunks.map(h => h.fingerprint));
            state.preview.keptByFile.set(f.filePath, keptSet);
          }

          const fileDiv = document.createElement('div');
          fileDiv.className = 'previewFile';
          const rules = Array.isArray(f.appliedRules) ? f.appliedRules : [];
          const rulesText = rules.length ? (rules.slice(0, 6).join(', ') + (rules.length > 6 ? ', …' : '')) : '(none)';
          fileDiv.innerHTML = \`
            <div class="previewFileTop">
              <div>
                <div class="title"><strong>\${escapeHtml(f.filePath)}</strong></div>
                <div class="meta">Rules: \${escapeHtml(rulesText)}</div>
              </div>
              <div style="display:flex; gap:8px; align-items:center;">
                <button class="secondary smallBtn" data-open-diff="1"><span class="btnInner"><span class="btnIcon" aria-hidden="true">\${ICONS.diff}</span><span>Open diff in editor</span></span></button>
              </div>
            </div>
            <div class="diff"></div>
          \`;
          const diffEl = fileDiv.querySelector('.diff');
          if (!hunks.length) {
            const diff = Array.isArray(f.diff) ? f.diff : [];
            diffEl.innerHTML = diff.map(dl => {
              const kind = dl.kind;
              const cls = kind === 'add' ? 'diffLine diffAdd' : kind === 'del' ? 'diffLine diffDel' : 'diffLine diffCtx';
              const prefix = kind === 'add' ? '+' : kind === 'del' ? '-' : ' ';
              return '<span class=\"' + cls + '\">' + prefix + ' ' + escapeHtml(dl.text ?? '') + '</span>';
            }).join('');
          } else {
            diffEl.style.padding = '0';
            diffEl.innerHTML = hunks.map(h => {
              const kept = keptSet.has(h.fingerprint);
              const header = '<div class="hunkTop">'
                + '<input type="checkbox" data-hunk-fp="' + escapeHtml(h.fingerprint) + '" ' + (kept ? 'checked' : '') + ' />'
                + '<code>@@ -' + escapeHtml(h.oldStart) + ',' + escapeHtml(h.oldLines) + ' +' + escapeHtml(h.newStart) + ',' + escapeHtml(h.newLines) + ' @@</code>'
                + '<div style="flex:1"></div>'
                + '<button class="secondary smallBtn" data-undo-hunk="' + escapeHtml(h.fingerprint) + '"><span class="btnInner"><span class="btnIcon" aria-hidden="true">' + ICONS.undo + '</span><span>Undo</span></span></button>'
                + '</div>';
              const body = '<div class="diff" style="padding:10px;">' + (Array.isArray(h.lines) ? h.lines : []).map(dl => {
                const kind = dl.kind;
                const cls = kind === 'add' ? 'diffLine diffAdd' : kind === 'del' ? 'diffLine diffDel' : 'diffLine diffCtx';
                const prefix = kind === 'add' ? '+' : kind === 'del' ? '-' : ' ';
                return '<span class=\"' + cls + '\">' + prefix + ' ' + escapeHtml(dl.text ?? '') + '</span>';
              }).join('') + '</div>';
              return '<div class="hunk">' + header + body + '</div>';
            }).join('');

            diffEl.querySelectorAll('input[data-hunk-fp]').forEach(cb => {
              cb.addEventListener('change', (e) => {
                const fp = e.target.getAttribute('data-hunk-fp');
                if (!fp) return;
                if (e.target.checked) keptSet.add(fp); else keptSet.delete(fp);
                updateApplyKeptVisibility();
              });
            });
            diffEl.querySelectorAll('button[data-undo-hunk]').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const fp = e.target.getAttribute('data-undo-hunk');
                if (!fp) return;
                keptSet.delete(fp);
                renderPreview(state.preview.payload);
              });
            });
          }

          // Resource context (collapsible), if provided by the extension.
          const contexts = Array.isArray(f.contexts) ? f.contexts : [];
          if (contexts.length) {
            const ctxWrap = document.createElement('div');
            ctxWrap.innerHTML = contexts.map(c => {
              const title = escapeHtml(c.title || 'Context');
              const meta = 'Lines ' + escapeHtml(c.startLine) + '–' + escapeHtml(c.endLine) + (c.truncated ? ' (truncated)' : '');
              const body = escapeHtml(c.text || '');
              return '<details class="ctx">'
                + '<summary class="ctxSummary"><div class="ctxSummaryBody"><div class="ctxTitle"><strong>Show full resource</strong>: ' + title + '</div><div class="ctxMeta">' + meta + '</div></div></summary>'
                + '<div class="ctxBody">' + body + '</div>'
                + '</details>';
            }).join('');
            fileDiv.appendChild(ctxWrap);
          }

          const btn = fileDiv.querySelector('[data-open-diff=\"1\"]');
          btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openDiffInEditor', filePath: f.filePath, afterText: f.afterText });
          });
          elPreviewFiles.appendChild(fileDiv);
        }
        updateApplyKeptVisibility();
      }

      function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      }

      function render(snapshot) {
        state.snapshot = snapshot;
        elIssues.innerHTML = '';
        const issues = (snapshot && Array.isArray(snapshot.issues)) ? snapshot.issues : [];
        const byFile = new Map();
        for (const i of issues) {
          const fp = i.filePath || '(unknown)';
          if (!byFile.has(fp)) byFile.set(fp, []);
          byFile.get(fp).push(i);
        }

        if (!issues.length) {
          elIssues.innerHTML = '<div class="group"><div class="meta">No issues yet. Run a scan.</div></div>';
          renderDetails(null);
          return;
        }

        for (const [fp, items] of byFile.entries()) {
          const group = document.createElement('div');
          group.className = 'group';
          group.innerHTML = '<h3>' + escapeHtml(fp) + '</h3>';
          for (const issue of items) {
            const k = keyOf(issue);
            const row = document.createElement('div');
            row.className = 'item';
            const checked = state.selectedSet.has(k) ? 'checked' : '';
            const fixPill = issue.fixStrategy ? '<span class="pill">' + escapeHtml(issue.fixStrategy) + '</span>' : '';
            row.innerHTML = \`
              <div><input type="checkbox" data-k="\${escapeHtml(k)}" \${checked} /></div>
              <div>
                <div class="title"><span class="link" data-select="1">\${escapeHtml(issue.ruleShortName || issue.ruleName)}</span>\${fixPill}</div>
                <div class="meta">\${issue.resourceHeader ? escapeHtml(issue.resourceHeader) : ''}</div>
              </div>
            \`;
            row.querySelector('[data-select="1"]').addEventListener('click', () => {
              state.selectedKey = k;
              renderDetails(issue);
            });
            row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
              const on = e.target.checked;
              if (on) state.selectedSet.add(k); else state.selectedSet.delete(k);
            });
            group.appendChild(row);
          }
          elIssues.appendChild(group);
        }

        if (state.selectedKey) {
          const found = issues.find(i => keyOf(i) === state.selectedKey);
          renderDetails(found || null);
        } else {
          renderDetails(null);
        }
      }

      document.getElementById('rescanBtn').addEventListener('click', () => {
        setStatus('Rescanning...');
        vscode.postMessage({ type: 'rescan' });
      });
      document.getElementById('previewBtn').addEventListener('click', () => {
        const snapshot = state.snapshot || {};
        const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];
        const selected = issues.filter(i => state.selectedSet.has(keyOf(i))).map(i => ({ ruleName: i.ruleName, filePath: i.filePath }));
        if (!selected.length) {
          toast('info', 'No issues selected.');
          return;
        }
        setStatus('Previewing...');
        elPreview.style.display = 'block';
        elPreviewLoading.style.display = 'flex';
        elPreviewLoadingText.textContent = 'Loading preview…';
        elPreviewFiles.innerHTML = '';
        vscode.postMessage({ type: 'previewSelected', issues: selected });
      });
      elPreviewKeepAllBtn.addEventListener('click', () => {
        const payload = state.preview.payload;
        if (!payload || !Array.isArray(payload.files)) return;
        for (const f of payload.files) {
          const hunks = Array.isArray(f.hunks) ? f.hunks : [];
          state.preview.keptByFile.set(f.filePath, new Set(hunks.map(h => h.fingerprint)));
        }
        renderPreview(payload);
      });
      elPreviewUndoAllBtn.addEventListener('click', () => {
        const payload = state.preview.payload;
        if (!payload || !Array.isArray(payload.files)) return;
        for (const f of payload.files) {
          state.preview.keptByFile.set(f.filePath, new Set());
        }
        renderPreview(payload);
      });
      elPreviewApplyKeptBtn.addEventListener('click', () => {
        const payload = state.preview.payload;
        if (!payload || !Array.isArray(payload.files) || !payload.files.length) {
          toast('info', 'No preview to apply.');
          return;
        }
        const files = payload.files.map(f => ({
          filePath: f.filePath,
          keptHunkFingerprints: Array.from(state.preview.keptByFile.get(f.filePath) || []),
        }));
        setStatus('Applying kept changes...');
        vscode.postMessage({ type: 'applyPreviewSelection', files });
      });
      document.getElementById('verifyBtn').addEventListener('click', () => {
        setStatus('Verifying...');
        vscode.postMessage({ type: 'verify' });
      });
      document.getElementById('applySelectedBtn').addEventListener('click', () => {
        const snapshot = state.snapshot || {};
        const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];
        const selected = issues.filter(i => state.selectedSet.has(keyOf(i))).map(i => ({ ruleName: i.ruleName, filePath: i.filePath }));
        if (!selected.length) {
          toast('info', 'No issues selected.');
          return;
        }
        setStatus('Applying...');
        vscode.postMessage({ type: 'applySelected', issues: selected });
      });

      window.addEventListener('message', event => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        switch (msg.type) {
          case 'snapshot':
            setStatus('Loaded');
            render(msg.payload);
            // If a rescan changed issues, clear any stale preview.
            renderPreview(null);
            elPreviewLoading.style.display = 'none';
            break;
          case 'previewProgress':
            setStatus('Previewing ' + msg.payload.done + '/' + msg.payload.total);
            elPreview.style.display = 'block';
            elPreviewLoading.style.display = 'flex';
            elPreviewLoadingText.textContent = 'Loading preview… ' + msg.payload.done + '/' + msg.payload.total;
            break;
          case 'previewResult':
            setStatus('Preview ready');
            renderPreview(msg.payload);
            break;
          case 'previewError':
            setStatus('Preview failed');
            renderPreview(null);
            elPreviewLoading.style.display = 'none';
            toast('error', msg.payload.message || 'Preview failed.');
            break;
          case 'previewApplyResult':
            setStatus(msg.payload.ok ? 'Applied kept changes' : 'Apply kept failed');
            toast(msg.payload.ok ? 'info' : 'error', msg.payload.ok ? (msg.payload.message || 'Applied kept changes.') : ('Apply kept failed: ' + (msg.payload.message || 'unknown error')));
            vscode.postMessage({ type: 'requestSnapshot' });
            break;
          case 'applyProgress':
            setStatus('Applying ' + (msg.payload.done) + '/' + msg.payload.total);
            break;
          case 'applyResult':
            setStatus(msg.payload.ok ? 'Applied' : 'Apply failed');
            toast(msg.payload.ok ? 'info' : 'error', msg.payload.ok ? 'Apply complete.' : ('Apply failed: ' + (msg.payload.error || 'unknown error')));
            vscode.postMessage({ type: 'requestSnapshot' });
            break;
          case 'verifyResult':
            setStatus(msg.payload.ok ? 'Verified' : 'Verify failed');
            toast(msg.payload.ok ? 'info' : 'error', msg.payload.summary || '');
            break;
          case 'toast':
            toast(msg.payload.kind, msg.payload.message);
            break;
        }
      });

      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>`;
  }

  public dispose(): void {
    IssuesPanel.currentPanel = undefined;
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
  }
}

function iconCheck(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3L13 4.5"/></svg>';
}

function iconSearch(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.6 10.6L14 14"/></svg>';
}

function iconRefresh(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 0 1-8.7 3.4"/><path d="M3 8a5 5 0 0 1 8.7-3.4"/><path d="M11.7 1.7V4.8H8.6"/><path d="M4.3 14.3V11.2h3.1"/></svg>';
}

function iconTool(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5a3.2 3.2 0 0 0 4 4L10 10l-4 4-2-.5.5-2 4-4 3.5-3.5a3.2 3.2 0 0 0-4-4l1.5 1.5-2 2z"/></svg>';
}

function iconUndo(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4H3v3.5"/><path d="M3.1 7.4A6 6 0 1 0 8 2.5"/></svg>';
}

function iconApply(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13.5h10"/><path d="M8 2.5v8"/><path d="M5.2 7.7L8 10.6l2.8-2.9"/></svg>';
}

function iconDiff(): string {
  return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3v10h3"/><path d="M10 3h3v10h-3"/><path d="M6.5 8h3"/></svg>';
}
