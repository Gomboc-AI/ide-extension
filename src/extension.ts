import * as vscode from 'vscode';
import * as path from 'path';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { showBenchmarksCommand } from './commands/showFrameworks';
import { testOrlConnectionCommand } from './commands/testOrlConnection';
import logger, { setLoggerLevel } from './utils/logger';
import { ScanResultsProvider } from './providers/scanResultsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';
import { GombocInfoViewProvider } from './providers/sidebarProvider';
import { OrlHoverProvider } from './providers/orlHoverProvider';
import { getInfrastructureToolFromFileUri } from './infrastructureTool';
import { DiagnosticCollectionManager } from './diagnosticCollectionManager';
import { flushOrlFixAppliedEvents } from './utils/integrationsService';
import { initScanStatus } from './utils/scanStatus';

const previousContentMap = new Map<string, string>();

export async function activate(context: vscode.ExtensionContext) {
  logger.info('VSCode extension activated .... ');
  // Configure logger verbosity (default: info).
  try {
    const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    setLoggerLevel(cfg.get('logLevel'));
  } catch {
    // ignore
  }
  initScanStatus(context);
  // diagnostics initialization
  const diagnosticCollectionManager = DiagnosticCollectionManager.get();
  const diagnosticCollection =
    diagnosticCollectionManager.getDiagnosticCollection();

  const scanResults = ScanResultsProvider.init(
    context,
    diagnosticCollectionManager,
  );

  scanResults.registerApplyRemediation();

  // Best-effort: flush any queued "fix applied" analytics events from prior sessions.
  flushOrlFixAppliedEvents(context).catch(() => {});

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
    {
      name: 'gomboc-vscode-extension.testOrlConnection',
      handler: () => testOrlConnectionCommand(context),
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, handler),
  );

  const onEdit = vscode.workspace.onDidChangeTextDocument(({ document }) => {
    const currentDocumentIac = getInfrastructureToolFromFileUri(document.uri);
    if (!currentDocumentIac) {
      return;
    }
    diagnosticCollectionManager.clearDiagnosticCollection(
      currentDocumentIac,
      document.uri,
    );
  });

  const onSave = vscode.workspace.onDidSaveTextDocument(document => {
    const previousContent = previousContentMap.get(document.uri.toString());
    const currentContent = document.getText();
    if (previousContent === currentContent) {
      return;
    }
    previousContentMap.set(document.uri.toString(), currentContent);

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
        { language: 'tf', scheme: 'file' },
        { language: 'json', scheme: 'file' },
        { language: 'yaml', scheme: 'file' },
        { language: 'plaintext', scheme: 'file' },
        { language: 'dockerfile', scheme: 'file' },
      ],
      new CodeActionProvider(),
    ),
    vscode.languages.registerHoverProvider(
      [
        { language: 'terraform', scheme: 'file' },
        { language: 'tf', scheme: 'file' },
        { language: 'json', scheme: 'file' },
        { language: 'yaml', scheme: 'file' },
        { language: 'plaintext', scheme: 'file' },
        { language: 'dockerfile', scheme: 'file' },
      ],
      new OrlHoverProvider(),
    ),
  );
}

export const isRemediableFile = (filePath: string): boolean => {
  const fileName = path.basename(filePath).toLowerCase();
  const fileExtension = path.extname(filePath).toLowerCase();
  const acceptedFileTypes = [
    '.tf',
    '.hcl',
    '.tfvars',
    '.yaml',
    '.yml',
    '.tpl',
    '.json',
  ];

  // Docker: Dockerfile* (no extension or any extension)
  if (fileName.startsWith('dockerfile')) {
    return true;
  }

  return acceptedFileTypes.includes(fileExtension);
};

const onConfigChange = (
  disposables: vscode.Disposable[],
  commands: { name: string; handler: () => Promise<void> }[],
) => {
  return vscode.workspace.onDidChangeConfiguration(e => {
    // Only react to our extension's settings.
    if (!e.affectsConfiguration('gomboc-vscode-extension')) {
      return;
    }

    // Dispose existing command registrations.
    for (const disposable of disposables) {
      try {
        disposable.dispose();
      } catch {
        // ignore
      }
    }

    // IMPORTANT: clear and replace the list so subsequent config changes
    // dispose the *latest* registrations (prevents "command already exists").
    disposables.length = 0;

    for (const command of commands) {
      disposables.push(
        vscode.commands.registerCommand(command.name, command.handler),
      );
    }
  });
};

export function deactivate() {}
