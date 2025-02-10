// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';

export function scanFileCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {
  vscode.window.showInformationMessage('Scan File command Ran!');
}
