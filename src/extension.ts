import * as vscode from 'vscode';
import * as path from 'path';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { showBenchmarksCommand } from './commands/showFrameworks';
import { CustomerApiClient } from './api/client';
import logger from './utils/logger';
import { ScanResultsProvider } from './providers/scanResultsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';
import { GombocInfoViewProvider } from './providers/sidebarProvider';

export async function activate(context: vscode.ExtensionContext) {
  logger.info('VSCode extension activated .... ');
  // diagnostics initialization
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection('Gomboc-Results');
  const scanResults = ScanResultsProvider.init(context, diagnosticCollection);

  scanResults.registerApplyRemediation();

  const commands = [
    {
      name: 'gomboc-vscode-extension.testApiKey',
      handler: () => testApiKeyCommand(context),
    },
    {
      name: 'gomboc-vscode-extension.scanFile',
      handler: () => scanFileCommand(context, scanResults),
    },
    {
      name: 'gomboc-vscode-extension.showBenchmarks',
      handler: () => showBenchmarksCommand(context),
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, handler),
  );

  const onEdit = vscode.workspace.onDidChangeTextDocument(() => {
    diagnosticCollection.clear();
  });

  const onSave = vscode.workspace.onDidSaveTextDocument(() => {
    const onSaveSetting = vscode.workspace
      .getConfiguration('gomboc-vscode-extension')
      .get('scanOnFileSave');
    const openedFilepath =
      vscode.window.activeTextEditor?.document.fileName ?? '';
    if (onSaveSetting && isRemediableFile(openedFilepath)) {
      vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
    }
  });

  const sidebarWebview = vscode.window.registerWebviewViewProvider(
    'gombocInfoView',
    new GombocInfoViewProvider(context),
  );

  context.subscriptions.push(
    ...disposables,
    diagnosticCollection,
    sidebarWebview,
    onSave,
    onEdit,
    onConfigChange(disposables, commands),
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'terraform', scheme: 'file' },
        { language: 'json', scheme: 'file' },
        { language: 'yaml', scheme: 'file' },
        { language: 'plaintext', scheme: 'file' },
      ],
      new CodeActionProvider(),
    ),
  );
}

export const isRemediableFile = (filePath: string): boolean => {
  const acceptedFileTypes = ['.tf', '.yaml', '.yml'];
  const fileExtension = path.extname(filePath);
  return acceptedFileTypes.includes(fileExtension);
};

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
