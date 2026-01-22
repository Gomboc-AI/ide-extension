import * as vscode from 'vscode';
import { createOrlClient } from '../orl/orlClient';
import logger from '../utils/logger';

export async function testOrlConnectionCommand(
  context: vscode.ExtensionContext,
) {
  try {
    logger.info('Testing ORL connection...');

    // Show progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Testing ORL Connection',
        cancellable: false,
      },
      async progress => {
        progress.report({ increment: 0, message: 'Creating ORL client...' });

        const orlClient = createOrlClient({
          extensionPath: context.extensionPath,
          storagePath: context.globalStorageUri.fsPath,
        });

        progress.report({
          increment: 50,
          message: 'Testing Docker connectivity...',
        });

        const isConnected = await orlClient.testConnection();

        progress.report({
          increment: 100,
          message: 'Connection test complete',
        });

        if (isConnected) {
          vscode.window
            .showInformationMessage(
              'ORL connection test successful',
              'Open Settings',
            )
            .then(selection => {
              if (selection === 'Open Settings') {
                vscode.commands.executeCommand(
                  'workbench.action.openSettings',
                  'gomboc-vscode-extension.remediateOrlEnabled',
                );
              }
            });
        } else {
          vscode.window
            .showErrorMessage('ORL connection test failed', 'Open Settings')
            .then(selection => {
              if (selection === 'Open Settings') {
                vscode.commands.executeCommand(
                  'workbench.action.openSettings',
                  'gomboc-vscode-extension',
                );
              }
            });
        }
      },
    );
  } catch (error) {
    logger.error('ORL connection test failed', { error });
    vscode.window.showErrorMessage(
      `ORL connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
