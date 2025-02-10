// opens up the webview
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';

export async function showFrameworksCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {

  try {
    const frameworks = await apiClient.securityFrameworks();

    // if success, display a webview of the data
    const panel = vscode.window.createWebviewPanel(
      'myWebview',
      'Gomboc Policy Statements',
      vscode.ViewColumn.One,
      {},
    );
    const htmlContent = `
    <html>
      <main>
        <h2>
          test
        </h2>
        <p>
          Here's a paragraph
        </p>
      </main>
    </html>
    `;

    panel.webview.html = htmlContent;

  } catch (error) {
    vscode.window.showErrorMessage(
      `Error displaying frameworks for organization: ${error}`,
    );
  }
}
