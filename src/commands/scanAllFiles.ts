// scans all files in the repository
import * as vscode from 'vscode';

export function scanAllFilesCommand(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Scan all files command activated');
}
