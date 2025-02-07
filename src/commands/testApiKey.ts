// Tests api key
import * as vscode from 'vscode';

export function testApiKeyCommand(context: vscode.ExtensionContext, apiClient: any) {
  vscode.window.showInformationMessage('Test Api key command ran!');
}