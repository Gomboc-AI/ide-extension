// opens up the webview
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getHTMLForBenchmarks } from '../views/frameworkPanel';

/**
 * Opens up a webview displaying all the organizations current security policy
 */
export async function showBenchmarksCommand(context: vscode.ExtensionContext) {
  try {
    const apiClient = new CustomerApiClient();
    // if success, display a webview of the data
    const panel = vscode.window.createWebviewPanel(
      'myWebview',
      'Gomboc Policy Statements',
      vscode.ViewColumn.One,
      {},
    );
    panel.webview.html = `<html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: sans-serif; padding: 1rem; }
          li { margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <h1>Retrieving your adopted security benchmarks...</h2>
      </body>
    </html>`;
    const benchmarks =
      await apiClient.securityAdoptedBenchmarkRecommendations();

    const htmlContent = getHTMLForBenchmarks(benchmarks);
    panel.webview.html = htmlContent;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error displaying benchmarks for organization: ${error}`,
    );
  }
}
