// scans all files in the repository
import * as vscode from 'vscode';

export function scanAllFilesCommand(context: vscode.ExtensionContext, apiClient: any) {
  console.log('ahh h this happened  j');
  vscode.window.showInformationMessage("Scan all files command activated");
}