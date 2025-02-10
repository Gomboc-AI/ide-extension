// scans all files in the repository
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';

export function scanAllFilesCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
) {
  vscode.window.showInformationMessage('Scan all files command activated');
}
