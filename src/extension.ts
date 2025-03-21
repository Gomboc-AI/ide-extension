import * as vscode from 'vscode';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { showFrameworksCommand } from './commands/showFrameworks';
import { CustomerApiClient } from './api/client';
import logger from './utils/logger';
import { ScanResultsProvider } from './providers/scanResultsProvider';


export function activate(context: vscode.ExtensionContext) {
  logger.info('VSCode extension activated .... ');
  const apiClient = new CustomerApiClient();

  // diagnostics initialization
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('Gomboc-Results');
  const scanResults = new ScanResultsProvider(
    context,
    diagnosticCollection,
    []
  );

  scanResults.registerApplyRemediation();

  const commands = [
    {
      name: 'gomboc-vscode-extension.testApiKey',
      handler: () => testApiKeyCommand(context, apiClient),
    },
    {
      name: 'gomboc-vscode-extension.scanFile',
      handler: () => scanFileCommand(context, apiClient, scanResults),
    },
    {
      name: 'gomboc-vscode-extension.showFrameworks',
      handler: () => showFrameworksCommand(context, apiClient),
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, handler),
  );

  context.subscriptions.push(...disposables, diagnosticCollection);
}

export function deactivate() { }