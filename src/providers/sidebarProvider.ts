import * as vscode from 'vscode';

export class GombocInfoViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    console.log('resolved webview');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

  getHtmlForWebview(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <img src="${webview.asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            './static/GombocWhiteGreenLogo.svg',
          ),
        )}" width="100" />
        <h2>Welcome to Gomboc!</h2>
      </body>
      </html>
    `;
  }
}
