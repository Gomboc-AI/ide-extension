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
import { TelemetryOperationContext, telemetryService } from './utils/telemetry';

const previousContentMap = new Map<string, string>();

/**
 * Activates the VS Code extension, registers commands, providers, diagnostics, and telemetry.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Configure logging before telemetry initialization so startup diagnostics are visible.
  try {
    const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    setLoggerLevel(cfg.get('logLevel'));
  } catch (error) {
    logger.error(
      'Failed to set logger level from configuration, using default.',
      error,
    );
    // ignore
  }

  logger.debug('Activating Gomboc VSCode extension', {
    extensionVersion:
      typeof context.extension?.packageJSON?.version === 'string'
        ? context.extension.packageJSON.version
        : 'unknown',
    vscodeVersion: vscode.version,
  });

  telemetryService.initialize({
    extensionVersion:
      typeof context.extension?.packageJSON?.version === 'string'
        ? context.extension.packageJSON.version
        : 'unknown',
    vscodeVersion: vscode.version,
  });
  telemetryService.recordEvent('extension.activate');
  logger.info('Telemetry service initialized.');

  logger.info('VSCode extension activated .... ');
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

  const commands: Array<{
    name: string;
    handler: (telemetry: TelemetryOperationContext) => Promise<void>;
  }> = [
    {
      name: 'gomboc-vscode-extension.testApiKey',
      handler: () => testApiKeyCommand(context),
    },
    {
      name: 'gomboc-vscode-extension.scanFile',
      handler: telemetry =>
        telemetry.withChildSpan(
          'command.scan_file',
          { 'command.id': 'gomboc-vscode-extension.scanFile' },
          scanFileTelemetry =>
            scanFileCommand(context, scanResults, scanFileTelemetry),
        ),
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
        async telemetry => handler(telemetry),
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
    onConfigChange(),
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

/**
 * Returns whether a file path can be mapped to a supported remediation language.
 */
export const isRemediableFile = (filePath: string): boolean => {
  return (
    detectLanguageId({
      filePath,
      content: '',
    }) !== null
  );
};

const onConfigChange = () => {
  return vscode.workspace.onDidChangeConfiguration(() => {
    telemetryService.configure();

    try {
      const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
      setLoggerLevel(cfg.get('logLevel'));
    } catch {
      // ignore and warn
      console.warn('Failed to update logger level');
    }
  });
};

/**
 * Flushes telemetry and releases extension resources during VS Code shutdown.
 */
export async function deactivate() {
  telemetryService.recordEvent('extension.deactivate');
  await telemetryService.shutdown();
}
