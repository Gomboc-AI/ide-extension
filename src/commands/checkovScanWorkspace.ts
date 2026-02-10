import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../utils/logger';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import { CheckovDockerVerifier } from '../fixproof/checkov/CheckovDockerVerifier';
import { CheckovScanCoordinator } from '../fixproof/checkov/CheckovScanCoordinator';

export async function checkovScanWorkspaceCommand(
  scanResultsProvider: ScanResultsProvider,
): Promise<void> {
  const last = scanResultsProvider.getLastOrlScanContext();
  const fallbackWorkspacePath = vscode.window.activeTextEditor?.document?.uri
    ?.fsPath
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const workspacePath = last?.workspacePath || fallbackWorkspacePath;
  if (!workspacePath) {
    vscode.window.showErrorMessage(
      'Checkov scan requires a directory scope. Run an ORL scan first or open a file in the target directory.',
    );
    return;
  }

  const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const image =
    (cfg.get('checkovContainerImage') as string | undefined) ||
    'bridgecrew/checkov:latest';

  logger.info('Checkov full scan starting', { workspacePath, image });

  const defaultSkipPaths = [
    '.git',
    '.terraform',
    '.orl-temp',
    '.orl-debug',
    'node_modules',
  ];
  const frameworks =
    last?.language === 'terraform'
      ? ['terraform']
      : typeof last?.language === 'string' &&
          last.language.toLowerCase().startsWith('cloudformation')
        ? ['cloudformation']
        : undefined;
  const verifier = new CheckovDockerVerifier({
    image,
    frameworks,
    skipPaths: defaultSkipPaths,
  });

  const result = await CheckovScanCoordinator.runExclusive({
    title: 'Checkov full scan',
    task: async () => {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Running Checkov scan (full workspace)',
          cancellable: false,
        },
        async () => {
          return await verifier.scanAll({ workspacePath });
        },
      );
    },
  });

  if (!result) {
    return;
  }

  const openDetails = async () => {
    const details = {
      scope: {
        workspacePath,
        scannedAt: new Date().toISOString(),
      },
      failingCheckIds: result.failingCheckIds,
      failedByCheckId: result.failedByCheckId,
      summary: result.summary,
    };
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(details, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

  const copyFailing = async () => {
    const text = result.failingCheckIds.join('\n');
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(
      'Copied failing Checkov IDs to clipboard.',
    );
  };

  if (result.allPassed) {
    const choice = await vscode.window.showInformationMessage(
      'Checkov scan passed (no failing checks found).',
      { modal: true },
      'Show details',
    );
    if (choice === 'Show details') {
      await openDetails();
    }
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Checkov scan found failing checks: ${result.failingCheckIds.length} unique IDs.`,
    { modal: true },
    'Show failing IDs',
    'Copy failing IDs',
    'Show details',
  );

  if (choice === 'Show failing IDs') {
    const doc = await vscode.workspace.openTextDocument({
      content: result.failingCheckIds.join('\n') + '\n',
      language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }
  if (choice === 'Copy failing IDs') {
    await copyFailing();
    return;
  }
  if (choice === 'Show details') {
    await openDetails();
    return;
  }
}
