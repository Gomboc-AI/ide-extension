import * as vscode from 'vscode';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { scanAllFilesCommand } from './commands/scanAllFiles';
import { showFrameworksCommand } from './commands/showFrameworks';
import { CustomerApiClient } from './api/client';
import logger from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
  logger.info('VSCode extension activated .... ');
  const apiClient = new CustomerApiClient();

  const commands = [
    {
      name: 'gomboc-vscode-extension.testApiKey',
      handler: () => testApiKeyCommand(context, apiClient),
    },
    {
      name: 'gomboc-vscode-extension.scanFile',
      handler: () => scanFileCommand(context, apiClient),
    },
    {
      name: 'gomboc-vscode-extension.scanAllFiles',
      handler: () => scanAllFilesCommand(context, apiClient),
    },
    {
      name: 'gomboc-vscode-extension.showFrameworks',
      handler: () => showFrameworksCommand(context, apiClient),
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, handler),
  );

  context.subscriptions.push(...disposables);
}

export function deactivate() {} // prob don't need to cleanup anything here
