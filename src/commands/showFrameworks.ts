// opens up the webview
import * as vscode from 'vscode';

export function showFrameworksCommand(
  context: vscode.ExtensionContext,
  apiClient: any,
) {
  vscode.window.showInformationMessage('Show frameworks command ran!');
}
