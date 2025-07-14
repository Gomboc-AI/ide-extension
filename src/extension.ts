import * as vscode from 'vscode';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { showBenchmarksCommand } from './commands/showFrameworks';
import { CustomerApiClient } from './api/client';
import logger from './utils/logger';
import { ScanResultsProvider } from './providers/scanResultsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';

export async function activate(context: vscode.ExtensionContext) {
  logger.info('VSCode extension activated .... ');
  const apiClient = new CustomerApiClient();
  // diagnostics initialization
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('Gomboc-Results');
  const scanResults = ScanResultsProvider.init(context, diagnosticCollection);

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
      name: 'gomboc-vscode-extension.showBenchmarks',
      handler: () => showBenchmarksCommand(context, apiClient),
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, handler),
  );

  const onEdit = vscode.workspace.onDidChangeTextDocument(() => {
    diagnosticCollection.clear();
  });

  context.subscriptions.push(
    ...disposables,
    diagnosticCollection,
    onSave,
    onEdit,
    onConfigChange(disposables, commands),
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'terraform', scheme: 'file' },
        { language: 'json', scheme: 'file' },
        { language: 'yaml', scheme: 'file' },
      ],
      new CodeActionProvider(),
    ),
  );
}

const onSave = vscode.workspace.onDidSaveTextDocument(() => {
  const onSaveSetting = vscode.workspace
    .getConfiguration('gomboc-vscode-extension')
    .get('scanOnFileSave');
  if (onSaveSetting) {
    vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
  }
});

const onConfigChange = (
  disposables: vscode.Disposable[],
  commands: { name: string; handler: () => Promise<void> }[],
) => {
  return vscode.workspace.onDidChangeConfiguration(() => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    for (const command of commands) {
      vscode.commands.registerCommand(command.name, command.handler);
    }
  });
};

export function deactivate() {}
