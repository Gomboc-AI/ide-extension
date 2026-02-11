import * as vscode from 'vscode';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import { IssuesPanel } from '../views/issuesPanel';

export async function showIssuesCommand(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
): Promise<void> {
  IssuesPanel.show(context, scanResultsProvider);
}

