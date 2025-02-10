// opens up the webview
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getHTMLForStatments } from '../views/frameworkPanel';

/**
 * Opens up a webview displaying all the organizations current security policy
 */
export async function showFrameworksCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {
  try {
    const organization = await apiClient.securityFrameworks();

    // if success, display a webview of the data
    const panel = vscode.window.createWebviewPanel(
      'myWebview',
      'Gomboc Policy Statements',
      vscode.ViewColumn.One,
      {},
    );
    const htmlContent = getHTMLForStatments(organization);
    panel.webview.html = htmlContent;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error displaying frameworks for organization: ${error}`,
    );
  }
}
