// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';

export function scanFileCommand(context: vscode.ExtensionContext, apiClient: any) {
  vscode.window.showInformationMessage('Scan File command Ran!');
}