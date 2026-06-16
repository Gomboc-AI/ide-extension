import * as vscode from 'vscode';
import * as path from 'path';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { showIssuesCommand } from './commands/showIssues';
import { testOrlConnectionCommand } from './commands/testOrlConnection';
import { fixProofCheckovVerifyCommand } from './commands/fixProofCheckovVerify';
import { checkovScanWorkspaceCommand } from './commands/checkovScanWorkspace';
import logger, { setLoggerLevel } from './utils/logger';
import { ScanResultsProvider } from './providers/scanResultsProvider';
import { CodeActionProvider } from './providers/codeActionProvider';
import { GombocInfoViewProvider } from './providers/sidebarProvider';
import { clearOrlRulesCache } from './orl/orlClient';
import { OrlHoverProvider } from './providers/orlHoverProvider';
import {
  chooseLanguageImplementation,
  detectLanguageId,
} from '@gomboc-ai/gomboc-node-sdk';
import { DiagnosticCollectionManager } from './diagnosticCollectionManager';
import {
  initializeIntegrationsService,
  vsCodeIntegrationsService,
} from './utils/integrationsService';
import { initScanStatus } from './utils/scanStatus';
import { telemetryService } from './utils/telemetry';

const previousContentMap = new Map<string, string>();

export async function activate(context: vscode.ExtensionContext) {
  telemetryService.initialize({
    extensionVersion:
      typeof context.extension?.packageJSON?.version === 'string'
        ? context.extension.packageJSON.version
        : 'unknown',
    vscodeVersion: vscode.version,
  });
  telemetryService.recordEvent('extension.activate');

  logger.info('VSCode extension activated .... ');
  // Configure logger verbosity (default: info).
  try {
    const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    setLoggerLevel(cfg.get('logLevel'));
  } catch {
    // ignore
  }
  initScanStatus(context);
  initializeIntegrationsService(context);
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
  vsCodeIntegrationsService.flushOrlFixAppliedEvents().catch(() => {});

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
      name: 'gomboc-vscode-extension.testOrlConnection',
      handler: () => testOrlConnectionCommand(context),
    },
    {
      name: 'gomboc-vscode-extension.fixProofCheckovVerify',
      handler: () => fixProofCheckovVerifyCommand(scanResults),
    },
    {
      name: 'gomboc-vscode-extension.checkovScanWorkspace',
      handler: () => checkovScanWorkspaceCommand(scanResults),
    },
    {
      name: 'gomboc-vscode-extension.showIssues',
      handler: () => showIssuesCommand(context, scanResults),
    },
    {
      name: 'gomboc-vscode-extension.clearRulesCache',
      handler: async () => {
        try {
          await clearOrlRulesCache(context.globalStorageUri.fsPath);
          vscode.window.showInformationMessage(
            'ORL rules cache cleared. Next scan will pull fresh rules.',
          );
        } catch {
          vscode.window.showErrorMessage('Failed to clear ORL rules cache.');
        }
      },
    },
  ];

  const disposables = commands.map(({ name, handler }) =>
    vscode.commands.registerCommand(name, () =>
      telemetryService.withSpan(
        'command.execute',
        { 'command.id': name },
        async () => handler(),
      ),
    ),
  );

  const onEdit = vscode.workspace.onDidChangeTextDocument(({ document }) => {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const handler = chooseLanguageImplementation({
      filePath: document.uri.fsPath,
      content: document.getText(),
    });
    diagnosticCollectionManager.clearDiagnosticCollection(
      handler.diagnosticClearScope,
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

  const languageList = [
    { language: 'terraform', scheme: 'file' },
    { language: 'tf', scheme: 'file' },
    { language: 'hcl', scheme: 'file' },
    { language: 'json', scheme: 'file' },
    { language: 'yaml', scheme: 'file' },
    { language: 'plaintext', scheme: 'file' },
    { language: 'dockerfile', scheme: 'file' },
    { language: 'xml', scheme: 'file' },
    { language: 'groovy', scheme: 'file' },
    { language: 'kotlin', scheme: 'file' },
    { language: 'python', scheme: 'file' },
    { language: 'java', scheme: 'file' },
    { language: 'bicep', scheme: 'file' },
  ];

  context.subscriptions.push(
    ...disposables,
    diagnosticCollection,
    sidebarWebview,
    onSave,
    onEdit,
    onConfigChange(disposables, commands),
    vscode.env.onDidChangeTelemetryEnabled(() => telemetryService.configure()),
    vscode.languages.registerCodeActionsProvider(
      languageList,
      new CodeActionProvider(),
    ),
    vscode.languages.registerHoverProvider(
      languageList,
      new OrlHoverProvider(),
    ),
  );
}

export const isRemediableFile = (filePath: string): boolean => {
  return (
    detectLanguageId({
      filePath,
      content: '',
    }) !== null
  );
};

const onConfigChange = (
  disposables: vscode.Disposable[],
  commands: { name: string; handler: () => Promise<void> }[],
) => {
  return vscode.workspace.onDidChangeConfiguration(() => {
    telemetryService.configure();
    for (const disposable of disposables) {
      disposable.dispose();
    }
    for (const command of commands) {
      vscode.commands.registerCommand(command.name, () =>
        telemetryService.withSpan(
          'command.execute',
          { 'command.id': command.name },
          async () => command.handler(),
        ),
      );
    }
  });
};

export async function deactivate() {
  telemetryService.recordEvent('extension.deactivate');
  await telemetryService.shutdown();
}
