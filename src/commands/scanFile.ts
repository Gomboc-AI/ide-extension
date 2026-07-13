// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import * as path from 'path';
import { createOrlClient } from '../orl/orlClient';
import logger from '../utils/logger';
import { OrlResultConverter } from '../orl/orlResultConverter';
import { ScanValidator } from '../utils/scanValidator';
import { vsCodeIntegrationsService } from '../utils/integrationsService';
import { setScanStatus } from '../utils/scanStatus';
import { createProfiler } from '../utils/profiler';
import { parseOrlReport } from '../utils/orlReportParser';
import { CheckovIdExtractor } from '../fixproof/checkov/CheckovIdExtractor';
import {
  TelemetryOperationContext,
  telemetryService,
} from '../utils/telemetry';
import {
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from '@gomboc-ai/gomboc-node-sdk';

/**
 * Serializes ORL scans and allows a single queued rerun.
 */
export class OrlScanSerializer {
  private running = false;
  private queued = false;
  private seq = 0;

  public async run(args: {
    task: (args: { seq: number }) => Promise<void>;
  }): Promise<void> {
    if (this.running) {
      this.queued = true;
      logger.info('ORL scan already running; queued a rescan');
      setScanStatus({ running: true, queued: true });
      return;
    }

    this.running = true;
    setScanStatus({ running: true, queued: false });
    const seq = ++this.seq;
    try {
      do {
        this.queued = false;
        logger.info('ORL scan execution begin', { seq });
        await args.task({ seq });
        logger.info('ORL scan execution end', { seq, queued: this.queued });
        setScanStatus({ running: true, queued: this.queued });
      } while (this.queued);
    } finally {
      this.running = false;
      setScanStatus({ running: false });
    }
  }
}

const orlScanSerializer = new OrlScanSerializer();

/**
 * Derives a stable filetype token used by conversion and telemetry.
 */
function deriveFiletypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext) {
    return ext.slice(1);
  }
  return path.basename(filePath).toLowerCase();
}

/**
 * Runs the active ORL scan command and updates scan results for diagnostics and UI.
 */
export async function scanFileCommand(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
  commandTelemetry?: TelemetryOperationContext,
) {
  logger.info('Using ORL client');
  await runOrlScanSerialized(context, scanResultsProvider, commandTelemetry);
}

/**
 * Routes scan execution through the shared serializer to avoid overlap races.
 */
async function runOrlScanSerialized(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
  commandTelemetry?: TelemetryOperationContext,
) {
  await orlScanSerializer.run({
    task: async () =>
      scanWithOrl(context, scanResultsProvider, commandTelemetry),
  });
}

async function scanWithOrl(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
  commandTelemetry?: TelemetryOperationContext,
) {
  const runScan = async (scanTelemetry: TelemetryOperationContext) => {
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
          language = scanPrep.language;
        } else {
          const last = scanResultsProvider.getLastOrlScanContext();
          workspacePath = last?.workspacePath;
          language = last?.language;
          if (!workspacePath || !language) {
            vscode.window.showErrorMessage(
              'Scan requires an active supported file. Open a supported file (or run one scan first) then try again.',
            );
            return;
          }
          filePath = await pickRepresentativeFileInDirectory({
            workspacePath,
            language,
          });
          if (!filePath) {
            vscode.window.showErrorMessage(
              `Scan could not find a representative file under: ${workspacePath}`,
            );
            return;
          }
        }
        if (filePath) {
          filetype = deriveFiletypeFromPath(filePath);
        }
      } catch (error) {
        // Validation error (400) - file type not supported, language detection failed, etc.
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown validation error';
        logger.error('Scan validation failed', { error: errorMessage });
        scanTelemetry.recordEvent('orl.scan.validation_failed', {
          'scan.error_context': 'Scan validation',
          'error.code': 'validation_failed',
          'scan.language': language ?? 'unknown',
        });
        scanTelemetry.setAttributes({ 'scan.outcome': 'validation_failed' });
        vscode.window.showErrorMessage(
          `Scan validation failed: ${errorMessage}`,
        );

        // Report validation error to integrations service (non-blocking)
        const editorPath = editor?.document?.uri?.fsPath;
        const editorWorkspacePath =
          editorPath ||
          workspacePath ||
          (vscode.window.activeTextEditor?.document?.uri?.fsPath
            ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
            : undefined);
        vsCodeIntegrationsService
          .sendError(
            editorWorkspacePath || '',
            undefined,
            errorMessage,
            400,
            'Scan validation',
          )
          .catch(() => {
            // Error already logged in sendError
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
        scanTelemetry.recordEvent('orl.scan.skipped', {
          'scan.skip_reason': 'missing_required_parameters',
          'scan.language': language ?? 'unknown',
          'scan.file_type': filetype ?? 'unknown',
        });
        scanTelemetry.setAttributes({ 'scan.outcome': 'skipped' });
        return;
      }

      logger.info('ORL scanning scope', {
        currentFile: filePath,
        workspacePath: workspacePath,
        scope: 'workspace-level (all supported files in directory)',
      });
      scanTelemetry.recordEvent('orl.scan.started', {
        'scan.language': language,
        'scan.file_type': filetype,
        'scan.scope': 'workspace',
      });
      scanTelemetry.setAttributes({
        'scan.language': language,
        'scan.file_type': filetype,
        'scan.scope': 'workspace',
      });

      // Create ORL client and execute remediation
      // Pass extension path so we know exactly where hooks are
      const orlClient = await createOrlClient({
        extensionPath: context.extensionPath,
        storagePath: context.globalStorageUri.fsPath,
      });
      const result = await orlClient.remediate(workspacePath, language);
      scanTelemetry.recordEvent('orl.remediate.completed', {
        'scan.language': language,
        'scan.success': result.success,
        'scan.exit_code': result.exitCode ?? -1,
        'scan.modified_files_count': Object.keys(result.modifiedFiles || {})
          .length,
      });
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
      const rawOrlReport =
        typeof result.report === 'string' ? result.report : '';
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
      const totalChunks = Math.max(
        1,
        Math.ceil(rawOrlReport.length / chunkSize),
      );
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(rawOrlReport.length, start + chunkSize);
        const chunk = rawOrlReport.slice(start, end);
        logger.debug(
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
        scanTelemetry.recordEvent('orl.scan.failed', {
          'scan.error_context': 'ORL execution',
          'error.code': 'orl_execution_failed',
          'scan.language': language,
          'scan.exit_code': result.exitCode ?? -1,
        });
        scanTelemetry.setAttributes({
          'scan.outcome': 'orl_execution_failed',
        });
        vscode.window.showErrorMessage(
          `ORL remediation failed: ${errorMessage}`,
        );

        // Report ORL execution error to integrations service (non-blocking)
        vsCodeIntegrationsService
          .sendError(
            workspacePath,
            language,
            errorMessage,
            500,
            'ORL execution',
          )
          .catch(() => {
            // Error already logged in sendError
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
              evidenceByCheckId: extracted.evidenceByCheckId,
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
        scanTelemetry.recordEvent('orl.scan.conversion_failed', {
          'scan.error_context': 'Result conversion',
          'error.code': 'conversion_failed',
          'scan.language': language,
          'scan.file_type': filetype,
        });
        scanTelemetry.setAttributes({ 'scan.outcome': 'conversion_failed' });
        vscode.window.showErrorMessage(
          `Failed to process ORL results: ${errorMessage}`,
        );

        // Report conversion error to integrations service (non-blocking)
        vsCodeIntegrationsService
          .sendError(
            workspacePath,
            language,
            errorMessage,
            500,
            'Result conversion',
          )
          .catch(() => {
            // Error already logged in sendError
          });
        return;
      }

      logger.info('ORL scan response converted', {
        individualFixesCount: scanResponse.individualFixes.length,
        groupedFixesCount: scanResponse.groupedFixes.length,
        modifiedFiles: Object.keys(result.modifiedFiles),
      });
      scanTelemetry.recordEvent('orl.scan.converted', {
        'scan.language': language,
        'scan.file_type': filetype,
        'scan.individual_fixes_count': scanResponse.individualFixes.length,
        'scan.grouped_fixes_count': scanResponse.groupedFixes.length,
        'scan.modified_files_count': Object.keys(result.modifiedFiles || {})
          .length,
      });
      scanTelemetry.setAttributes({
        'scan.outcome': 'success',
        'scan.individual_fixes_count': scanResponse.individualFixes.length,
        'scan.grouped_fixes_count': scanResponse.groupedFixes.length,
        'scan.modified_files_count': Object.keys(result.modifiedFiles || {})
          .length,
      });
      scanResultsProvider.generateComments(scanResponse);
      prof.mark('scanResultsProvider.generateComments');
      scanResultsProvider.createDiagnostic();
      prof.mark('scanResultsProvider.createDiagnostic');
      scanTelemetry.recordEvent('orl.scan.diagnostics_created', {
        'scan.language': language,
        'scan.individual_fixes_count': scanResponse.individualFixes.length,
        'scan.grouped_fixes_count': scanResponse.groupedFixes.length,
      });

      // Send ORL report to integrations service (non-blocking)
      // This runs asynchronously and won't break the remediation workflow if it fails
      vsCodeIntegrationsService
        .sendOrlReport(result, workspacePath, language)
        .catch(error => {
          // Error is already logged in sendOrlReport
          // Just ensure it doesn't propagate
          logger.debug('ORL report submission error handled', { error });
        });
      scanTelemetry.recordEvent('orl.report_submission.scheduled', {
        'scan.language': language,
      });
      prof.end({ success: true });
    } catch (error) {
      // General catch-all for unexpected errors (500)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('ORL scan failed', { error: errorMessage });
      scanTelemetry.recordEvent('orl.scan.failed', {
        'scan.error_context': 'Unexpected error',
        'error.code': 'unexpected_error',
        'scan.language': language ?? 'unknown',
      });
      scanTelemetry.setAttributes({ 'scan.outcome': 'unexpected_error' });
      vscode.window.showErrorMessage(`ORL scan failed: ${errorMessage}`);

      // Report unexpected error to integrations service (non-blocking)
      // Use workspacePath if we have it, otherwise try to get it from editor
      const errorWorkspacePath =
        workspacePath ||
        (vscode.window.activeTextEditor
          ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
          : undefined);

      if (errorWorkspacePath) {
        vsCodeIntegrationsService
          .sendError(
            errorWorkspacePath,
            language,
            errorMessage,
            500,
            'Unexpected error',
          )
          .catch(() => {
            // Error already logged in sendError
          });
      }
    }
  };

  if (commandTelemetry) {
    return commandTelemetry.withChildSpan('orl.scan', undefined, runScan);
  }

  return telemetryService.withSpan('orl.scan', undefined, runScan);
}

/**
 * Picks a file in the scan directory that matches the intended ORL language.
 */
export async function pickRepresentativeFileInDirectory(args: {
  workspacePath: string;
  language: string;
}): Promise<string | undefined> {
  const workspacePath = (args.workspacePath || '').trim();
  const targetOrlLanguage = (args.language || '').trim().toLowerCase();
  if (!workspacePath || !targetOrlLanguage) {
    return undefined;
  }

  const entries: [string, vscode.FileType][] =
    await vscode.workspace.fs.readDirectory(vscode.Uri.file(workspacePath));
  const files = entries
    .filter(([_, t]) => t === vscode.FileType.File)
    .map(([name]) => path.join(workspacePath, name));

  for (const filePath of files) {
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(filePath),
      );
      const content = new TextDecoder().decode(bytes);
      const languageId = detectLanguageId({ filePath, content });
      if (!languageId) {
        continue;
      }
      const orlLanguage = mapLanguageIdToOrlLanguage({ languageId, filePath });
      if (orlLanguage === targetOrlLanguage) {
        return filePath;
      }
    } catch {
      // Ignore unreadable files and continue to next candidate.
    }
  }

  return files.length ? files[0] : undefined;
}
