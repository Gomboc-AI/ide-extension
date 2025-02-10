// opens up the webview
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';

export function showFrameworksCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {
  vscode.window.showInformationMessage('Show frameworks command ran!');
}
