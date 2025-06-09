// opens up the webview
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getHTMLForBenchmarks } from '../views/frameworkPanel';

/**
 * Opens up a webview displaying all the organizations current security policy
 */
export async function showBenchmarksCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {
  try {
    const benchmarks =
      await apiClient.securityAdoptedBenchmarkRecommendations();

    // if success, display a webview of the data
    const panel = vscode.window.createWebviewPanel(
      'myWebview',
      'Gomboc Policy Statements',
      vscode.ViewColumn.One,
      {},
    );
    const htmlContent = getHTMLForBenchmarks(benchmarks);
    panel.webview.html = htmlContent;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error displaying benchmarks for organization: ${error}`,
    );
  }
}
