import { ScanLocalScenarioInput } from './../api/__generated__/graphql';
// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getFileType } from '../utils/lib';
import {
  InfrastructureTool,
  IacScanContent,
} from '../api/__generated__/graphql';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import * as path from 'path';
import { createOrlClient } from '../orl/orlClient';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer } from '../utils/fileDiffAnalyzer';
import { OrlResultConverter } from '../orl/orlResultConverter';
import { ScanValidator } from '../utils/scanValidator';
import {
  sendOrlReportToIntegrations,
  sendErrorToIntegrations,
} from '../utils/integrationsService';
import { setScanStatus } from '../utils/scanStatus';
import { createProfiler } from '../utils/profiler';
import { parseOrlReport } from '../utils/orlReportParser';
import { CheckovIdExtractor } from '../fixproof/checkov/CheckovIdExtractor';

/**
 * ORL scans are executed by spawning a docker container (`orlClient.remediate`).
 * Overlapping runs can race on temp workspace state and frequently cause the
 * “first scan works, subsequent scans fail” behavior when retriggered quickly
 * (save events, command palette, post-remediation rescans, etc.).
 *
 * We intentionally serialize ORL scans and allow at most one queued "latest"
 * rescan request while a scan is running.
 */
let orlScanRunning = false;
let orlScanQueued = false;
let orlScanSeq = 0;

export async function scanFileCommand(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  // Resolve whether we should run ORL vs the legacy CustomerAPI scan path.
  // Precedence:
  // 1) Local extension setting can force ORL on (override).
  // 2) Otherwise, attempt server-side feature flag (CustomerAPI/OpenFeature).
  // 3) If that fails, fall back to the local extension setting.
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const orlEnabledSetting =
    (config.get('remediateOrlEnabled') as boolean) ?? false;

  let useOrl = orlEnabledSetting;
  if (!useOrl) {
    try {
      const apiClient = new CustomerApiClient();
      const flagEnabled = await apiClient.isProcessorOrlEnabled();
      useOrl = Boolean(flagEnabled) || orlEnabledSetting;
      logger.info('ORL enablement resolved via CustomerAPI flag', {
        flag: 'processor-orl-enabled',
        flagEnabled,
        settingOverride: orlEnabledSetting,
        useOrl,
      });
    } catch (error) {
      // Fall back to the local setting if the flag check fails.
      useOrl = orlEnabledSetting;
      logger.warn(
        'Failed to resolve ORL feature flag via CustomerAPI; falling back to extension setting',
        {
          flag: 'processor-orl-enabled',
          useOrl,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  } else {
    logger.info('ORL remediation forced on via extension setting', {
      settingOverride: orlEnabledSetting,
      useOrl,
    });
  }

  if (useOrl) {
    logger.info('Using ORL client');
    await runOrlScanSerialized(context, scanResultsProvider);
  } else {
    logger.info('Using traditional API client');
    await scanWithApiClient(scanResultsProvider);
  }
}

async function runOrlScanSerialized(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  if (orlScanRunning) {
    orlScanQueued = true;
    logger.info('ORL scan already running; queued a rescan');
    setScanStatus({ running: true, queued: true });
    return;
  }

  orlScanRunning = true;
  setScanStatus({ running: true, queued: false });
  const seq = ++orlScanSeq;
  try {
    do {
      orlScanQueued = false;
      logger.info('ORL scan execution begin', { seq });
      await scanWithOrl(context, scanResultsProvider);
      logger.info('ORL scan execution end', { seq, queued: orlScanQueued });
      setScanStatus({ running: true, queued: orlScanQueued });
    } while (orlScanQueued);
  } finally {
    orlScanRunning = false;
    setScanStatus({ running: false });
  }
}

async function scanWithOrl(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  let workspacePath: string | undefined;
  let language: string | undefined;

  try {
    const scanId = `scanWithOrl:${Date.now()}:${Math.random()
      .toString(16)
      .slice(2, 10)}`;
    const prof = createProfiler({
      scanId,
      component: 'scanFile.scanWithOrl',
    });
    logger.info('ORL scan starting');
    const editor = vscode.window.activeTextEditor;

    // Validate file type and prepare scan parameters.
    // Important: when a webview is focused, VS Code may not have an active text editor.
    // In that case, fall back to the last ORL scan scope so "Rescan" from the Issues panel works.
    let filePath: string | undefined;
    let filetype: string | undefined;
    try {
      if (editor) {
        const scanPrep = ScanValidator.validateAndPrepareScan(editor);
        filePath = scanPrep.filePath;
        workspacePath = scanPrep.workspacePath;
        filetype = scanPrep.filetype;
        language = scanPrep.language;
      } else {
        const last = scanResultsProvider.getLastOrlScanContext();
        workspacePath = last?.workspacePath;
        language = last?.language;
        if (!workspacePath || !language) {
          vscode.window.showErrorMessage(
            'Scan requires an active IaC file. Open a Terraform/CloudFormation file (or run one scan first) then try again.',
          );
          return;
        }
        filePath = await pickRepresentativeFileInDirectory({
          workspacePath,
          language,
        });
        if (!filePath) {
          vscode.window.showErrorMessage(
            `Scan could not find a representative IaC file under: ${workspacePath}`,
          );
          return;
        }
        filetype = getFileType(filePath);
      }
    } catch (error) {
      // Validation error (400) - file type not supported, language detection failed, etc.
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';
      logger.error('Scan validation failed', { error: errorMessage });
      vscode.window.showErrorMessage(`Scan validation failed: ${errorMessage}`);

      // Report validation error to integrations service (non-blocking)
      const editorPath = editor?.document?.uri?.fsPath;
      const editorWorkspacePath =
        editorPath ||
        workspacePath ||
        (vscode.window.activeTextEditor?.document?.uri?.fsPath
          ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
          : undefined);
      sendErrorToIntegrations(
        editorWorkspacePath || '',
        undefined,
        errorMessage,
        400,
        'Scan validation',
      ).catch(() => {
        // Error already logged in sendErrorToIntegrations
      });
      return;
    }

    // Safety: should be set by validation/fallback above.
    if (!filePath || !filetype || !workspacePath || !language) {
      logger.warn('ORL scan missing required parameters (skipping)', {
        filePath,
        filetype,
        workspacePath,
        language,
      });
      return;
    }

    logger.info('ORL scanning scope', {
      currentFile: filePath,
      workspacePath: workspacePath,
      scope: 'workspace-level (all IaC files in directory)',
    });

    // Create ORL client and execute remediation
    // Pass extension path so we know exactly where hooks are
    const orlClient = await createOrlClient({
      extensionPath: context.extensionPath,
      storagePath: context.globalStorageUri.fsPath,
    });
    const result = await orlClient.remediate(workspacePath, language);
    prof.mark('orlClient.remediate', {
      success: result.success,
      exitCode: result.exitCode,
    });

    // Dump the raw ORL report for debugging/parsing experiments.
    //
    // Important: ORL report payloads can be very large (MBs). Logging the entire report as one
    // giant JSON log line can get truncated/dropped by VS Code log viewers. So we emit a small
    // META line and then stream the full report in safe-sized chunks, each with the same prefix
    // for filtering.
    const rawOrlReport = typeof result.report === 'string' ? result.report : '';
    const baseLogFields = {
      scanId,
      workspacePath,
      language,
      exitCode: result.exitCode,
      reportLength: rawOrlReport.length,
    };

    logger.info('GOMBOC_ORL::REPORT META', baseLogFields);

    // Keep chunks reasonably small so they reliably show up in "Log (Extension Host)" / output.
    const chunkSize = 8_000;
    const totalChunks = Math.max(1, Math.ceil(rawOrlReport.length / chunkSize));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(rawOrlReport.length, start + chunkSize);
      const chunk = rawOrlReport.slice(start, end);
      logger.info(
        `GOMBOC_ORL::REPORT CHUNK ${chunkIndex + 1}/${totalChunks}\n${chunk}`,
        { ...baseLogFields, chunkIndex, chunkStart: start, chunkEnd: end },
      );
    }

    if (result.success && result.exitCode === 2) {
      logger.warn(
        'ORL scan completed with errors in the report; delivering available fixes',
        {
          exitCode: result.exitCode,
          error: result.error,
        },
      );
    } else if (result.success && result.exitCode === 3) {
      logger.warn(
        'ORL fix count is less than finding count; delivering available fixes',
        {
          exitCode: result.exitCode,
        },
      );
    }

    if (!result.success) {
      const errorMessage = result.error || 'ORL remediation failed';
      logger.error('ORL remediation failed', { error: errorMessage });
      vscode.window.showErrorMessage(`ORL remediation failed: ${errorMessage}`);

      // Report ORL execution error to integrations service (non-blocking)
      sendErrorToIntegrations(
        workspacePath,
        language,
        errorMessage,
        500,
        'ORL execution',
      ).catch(() => {
        // Error already logged in sendErrorToIntegrations
      });
      return;
    }

    // Persist last ORL report + scope so FixProof verification steps can reuse it.
    // We set this immediately after ORL succeeds, even if later conversion fails.
    scanResultsProvider.setLastOrlScanContext({
      workspacePath,
      language,
      report: result.report,
    });

    // Cache the (non-empty) targeted Checkov ID list for FixProof verification.
    // This prevents the list from "disappearing" after the user applies fixes and a rescan
    // produces a report with 0 fixes/changes.
    try {
      const parsed = parseOrlReport(result.report);
      const extractor = new CheckovIdExtractor();
      const extracted = extractor.extract({
        parsedReport: parsed,
        onlyRulesThatChangedCode: true,
      });
      if (extracted.checkIds.length) {
        // Additive cache: only grows; never shrinks.
        scanResultsProvider
          .cacheFixProofCheckovTargets({
            workspacePath,
            checkIds: extracted.checkIds,
            checkIdsByRule: extracted.checkIdsByRule,
            evidenceByCheckId: extracted.evidenceByCheckId as any,
          })
          .catch(() => {});
      } else {
        // Still touch the TTL so the session cache expires after inactivity, not after "no new IDs".
        scanResultsProvider
          .touchFixProofCheckovTargets({ workspacePath })
          .catch(() => {});
      }
    } catch (e) {
      logger.debug('FixProof: failed to cache Checkov targets (ignored)', {
        e: e instanceof Error ? e.message : String(e),
      });
    }

    // Convert ORL result to IDE extension format
    let scanResponse;
    try {
      scanResponse = await OrlResultConverter.convertToScanResponse(
        result,
        filetype,
        filePath,
      );
      prof.mark('OrlResultConverter.convertToScanResponse', {
        individualFixes: scanResponse.individualFixes?.length ?? 0,
        groupedFixes: scanResponse.groupedFixes?.length ?? 0,
      });
    } catch (error) {
      // Conversion error (500) - report parsing failed, file diff analysis failed, etc.
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown conversion error';
      logger.error('ORL result conversion failed', { error: errorMessage });
      vscode.window.showErrorMessage(
        `Failed to process ORL results: ${errorMessage}`,
      );

      // Report conversion error to integrations service (non-blocking)
      sendErrorToIntegrations(
        workspacePath,
        language,
        errorMessage,
        500,
        'Result conversion',
      ).catch(() => {
        // Error already logged in sendErrorToIntegrations
      });
      return;
    }

    logger.info('ORL scan response converted', {
      individualFixesCount: scanResponse.individualFixes.length,
      groupedFixesCount: scanResponse.groupedFixes.length,
      modifiedFiles: Object.keys(result.modifiedFiles),
    });
    scanResultsProvider.generateComments(scanResponse);
    prof.mark('scanResultsProvider.generateComments');
    scanResultsProvider.createDiagnostic();
    prof.mark('scanResultsProvider.createDiagnostic');

    // Send ORL report to integrations service (non-blocking)
    // This runs asynchronously and won't break the remediation workflow if it fails
    sendOrlReportToIntegrations(result, workspacePath, language).catch(
      error => {
        // Error is already logged in sendOrlReportToIntegrations
        // Just ensure it doesn't propagate
        logger.debug('ORL report submission error handled', { error });
      },
    );
    prof.end({ success: true });
  } catch (error) {
    // General catch-all for unexpected errors (500)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error('ORL scan failed', { error: errorMessage });
    vscode.window.showErrorMessage(`ORL scan failed: ${errorMessage}`);

    // Report unexpected error to integrations service (non-blocking)
    // Use workspacePath if we have it, otherwise try to get it from editor
    const errorWorkspacePath =
      workspacePath ||
      (vscode.window.activeTextEditor
        ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
        : undefined);

    if (errorWorkspacePath) {
      sendErrorToIntegrations(
        errorWorkspacePath,
        language,
        errorMessage,
        500,
        'Unexpected error',
      ).catch(() => {
        // Error already logged in sendErrorToIntegrations
      });
    }
  }
}

async function pickRepresentativeFileInDirectory(args: {
  workspacePath: string;
  language: string;
}): Promise<string | undefined> {
  const workspacePath = (args.workspacePath || '').trim();
  const language = (args.language || '').trim().toLowerCase();
  if (!workspacePath || !language) {
    return undefined;
  }

  const entries = await vscode.workspace.fs.readDirectory(
    vscode.Uri.file(workspacePath),
  );
  const files = entries
    .filter(([_, t]) => t === vscode.FileType.File)
    .map(([name]) => name);

  const pickBy = (pred: (name: string) => boolean): string | undefined => {
    const hit = files.find(pred);
    return hit ? path.join(workspacePath, hit) : undefined;
  };

  // Terraform
  if (language === 'terraform') {
    return (
      pickBy(n => n.toLowerCase().endsWith('.tf')) ||
      pickBy(n => n.toLowerCase().endsWith('.hcl')) ||
      pickBy(n => n.toLowerCase().endsWith('.tfvars')) ||
      undefined
    );
  }

  // Docker
  if (language === 'docker') {
    return (
      pickBy(n => n.toLowerCase().startsWith('dockerfile')) ||
      pickBy(n => n.toLowerCase().endsWith('.dockerfile')) ||
      undefined
    );
  }

  // Helm
  if (language === 'helm') {
    return (
      pickBy(n => n.toLowerCase().endsWith('.tpl')) ||
      pickBy(n => n.toLowerCase().endsWith('.yaml')) ||
      pickBy(n => n.toLowerCase().endsWith('.yml')) ||
      undefined
    );
  }

  // CloudFormation / Kubernetes / YAML-ish
  if (
    language.startsWith('cloudformation') ||
    language === 'kubernetes' ||
    language.endsWith('-yaml') ||
    language.endsWith('-json')
  ) {
    return (
      pickBy(n => n.toLowerCase().endsWith('.yaml')) ||
      pickBy(n => n.toLowerCase().endsWith('.yml')) ||
      pickBy(n => n.toLowerCase().endsWith('.json')) ||
      undefined
    );
  }

  // Fallback: any file in the directory.
  return files.length ? path.join(workspacePath, files[0]) : undefined;
}

async function scanWithApiClient(scanResultsProvider: ScanResultsProvider) {
  setScanStatus({ running: true, queued: false });
  try {
    const apiClient = new CustomerApiClient();
    // ----- Gather input ------- //
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
      const last = scanResultsProvider.getLastOrlScanContext();
      if (!last?.workspacePath) {
        vscode.window.showErrorMessage(
          'Scan requires an active IaC file. Open a Terraform/CloudFormation file then try again.',
        );
        return;
      }
      // API mode needs a concrete file scope; pick one in the last scanned directory.
      const filePath = await pickRepresentativeFileInDirectory({
        workspacePath: last.workspacePath,
        language: last.language || 'terraform',
      });
      if (!filePath) {
        vscode.window.showErrorMessage(
          `Scan could not find a representative IaC file under: ${last.workspacePath}`,
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(filePath),
      );
      await vscode.window.showTextDocument(doc, { preview: false });
      editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
    }
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const filetype = getFileType(filePath);

    let fileContents: IacScanContent[];
    let tool: InfrastructureTool;

    if (filetype === 'tf') {
      tool = InfrastructureTool.Terraform;
      fileContents = await getTFScenarioFiles(document);
    } else if (filetype === 'yml' || filetype === 'yaml') {
      tool = InfrastructureTool.Cloudformation;
      fileContents = getCFNFile(document);
    } else {
      vscode.window.showErrorMessage(
        'Current file is not a cloudformation or terraform file',
      );
      throw new Error('Current file is not a cloudformation or terraform file');
    }

    // const metaData = await generateRequestMetadata();

    // ----- Send data to customerapi ------ //
    const inputObject: ScanLocalScenarioInput = {
      fileContents,
      iacTool: tool,
    };

    const scanResponse = await apiClient.getFixes({ inputObject });

    scanResultsProvider.generateComments(scanResponse);
    scanResultsProvider.createDiagnostic();
  } finally {
    setScanStatus({ running: false });
  }
}

async function getTFScenarioFiles(
  document: vscode.TextDocument,
): Promise<IacScanContent[]> {
  // updating this to use native os path so we can support windows
  // fsPath is the native reading path, and .path is the unix style vscode path
  // Note, we most likely just want to use fsPath for most purposes
  const currentFilePath = document.uri.fsPath;

  const directoryPath = path.dirname(currentFilePath);
  const entries = await vscode.workspace.fs.readDirectory(
    vscode.Uri.file(directoryPath),
  );

  const contents: IacScanContent[] = [];
  for (const [name, fileType] of entries) {
    if (fileType === vscode.FileType.File && name.endsWith('.tf')) {
      const filePath = path.join(directoryPath, name);
      const fileUri = vscode.Uri.file(filePath);

      const data = await vscode.workspace.fs.readFile(fileUri);
      const contentString = new TextDecoder().decode(data);

      contents.push({
        filePath: filePath, // Use the native OS path directly
        fileContent: Buffer.from(contentString, 'utf8').toString('base64'),
      });
    }
  }
  return contents;
}

/**
 * Only care about the current file, just return base64 of it
 */
export function getCFNFile(document: vscode.TextDocument): IacScanContent[] {
  return [
    {
      filePath: document.uri.fsPath,
      fileContent: Buffer.from(document.getText(), 'utf8').toString('base64'),
    },
  ];
}
