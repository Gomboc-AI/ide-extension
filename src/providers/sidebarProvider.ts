import * as vscode from 'vscode';

/***
 * A provider for the sidebar component
 */
export class GombocInfoViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (m: { type: string }) => {
        if (m?.type === 'openReviewer') {
          vscode.commands
            .executeCommand('gomboc-vscode-extension.showIssues')
            .then(
              () => {},
              () => {},
            );
        }
      },
      undefined,
      this.context.subscriptions,
    );
  }

  getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { padding: 12px; font-family: -apple-system,BlinkMacSystemFont,Segoe WPC,Segoe UI,sans-serif; }
          .wrap { display:flex; flex-direction: column; gap: 10px; }
          button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            width: fit-content;
          }
          button:hover { background: var(--vscode-button-hoverBackground); }
          .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <img src="${webview.asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              './static/GombocWhiteGreenLogo.svg',
            ),
          )}" width="100" />
          <h2>Welcome to Gomboc!</h2>
          <div class="meta">Quick links</div>
          <button id="openReviewerBtn">Open Fix Reviewer</button>
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          document.getElementById('openReviewerBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'openReviewer' });
          });
        </script>
      </body>
      </html>
    `;
  }
}
