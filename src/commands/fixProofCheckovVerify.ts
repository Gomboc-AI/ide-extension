import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../utils/logger';
import { parseOrlReport } from '../utils/orlReportParser';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import { CheckovIdExtractor } from '../fixproof/checkov/CheckovIdExtractor';
import { CheckovDockerVerifier } from '../fixproof/checkov/CheckovDockerVerifier';
import { CheckovScanCoordinator } from '../fixproof/checkov/CheckovScanCoordinator';

export type FixProofCheckovVerifyPanelSummary =
  | {
      ok: true;
      allPassed: boolean;
      checkCount: number;
      failingCheckIds: string[];
    }
  | { ok: false; error: string };

export async function fixProofCheckovVerifyForPanel(
  scanResultsProvider: ScanResultsProvider,
): Promise<FixProofCheckovVerifyPanelSummary> {
  const last = scanResultsProvider.getLastOrlScanContext();
  const fallbackWorkspacePath = vscode.window.activeTextEditor?.document?.uri
    ?.fsPath
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const workspacePath = last?.workspacePath || fallbackWorkspacePath;
  if (!workspacePath) {
    return {
      ok: false,
      error:
        'Third Party Compare (Checkov) requires a scan scope. Run an ORL scan first or open a file in the target directory.',
    };
  }

  const cached = scanResultsProvider.getCachedFixProofCheckovTargets({
    workspacePath,
  });
  if (cached) {
    scanResultsProvider
      .touchFixProofCheckovTargets({ workspacePath })
      .catch(() => {});
  }
  let extracted: ReturnType<CheckovIdExtractor['extract']> | undefined =
    undefined;
  if (!cached) {
    const report = last?.report;
    if (!report || typeof report !== 'string' || !report.trim()) {
      return {
        ok: false,
        error:
          'Third Party Compare (Checkov) could not find cached Checkov targets, and the last ORL report was missing. Run an ORL scan first.',
      };
    }
    const parsed = parseOrlReport(report);
    const extractor = new CheckovIdExtractor();
    extracted = extractor.extract({
      parsedReport: parsed,
      onlyRulesThatChangedCode: true,
    });
    if (extracted.checkIds.length) {
      await scanResultsProvider.cacheFixProofCheckovTargets({
        workspacePath,
        checkIds: extracted.checkIds,
        checkIdsByRule: extracted.checkIdsByRule,
        evidenceByCheckId: extracted.evidenceByCheckId as any,
      });
    }
  }

  const checkIds = cached?.checkIds || extracted?.checkIds || [];
  if (!checkIds.length) {
    return {
      ok: false,
      error:
        'Third Party Compare: No Checkov IDs were found (or cached) for the last ORL scan scope.',
    };
  }

  const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const image =
    (cfg.get('checkovContainerImage') as string | undefined) ||
    'bridgecrew/checkov:latest';

  const defaultSkipPaths = [
    '.git',
    '.terraform',
    '.orl-temp',
    '.orl-debug',
    'node_modules',
  ];
  const frameworks =
    last?.language === 'terraform'
      ? ['terraform']
      : typeof last?.language === 'string' &&
          last.language.toLowerCase().startsWith('cloudformation')
        ? ['cloudformation']
        : undefined;

  const verifier = new CheckovDockerVerifier({
    image,
    frameworks,
    skipPaths: defaultSkipPaths,
  });

  const result = await CheckovScanCoordinator.runExclusive({
    title: 'Third Party Compare',
    task: async () => {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Third Party Compare: Running Checkov verification (${checkIds.length} checks)`,
          cancellable: false,
        },
        async () => {
          return await verifier.verify({
            workspacePath,
            checkIds,
          });
        },
      );
    },
  });

  if (!result) {
    return {
      ok: false,
      error: 'Third Party Compare did not run (possibly already running).',
    };
  }

  return {
    ok: true,
    allPassed: result.allPassed,
    checkCount: checkIds.length,
    failingCheckIds: result.failingCheckIds,
  };
}

export async function fixProofCheckovVerifyCommand(
  scanResultsProvider: ScanResultsProvider,
): Promise<void> {
  const last = scanResultsProvider.getLastOrlScanContext();
  const fallbackWorkspacePath = vscode.window.activeTextEditor?.document?.uri
    ?.fsPath
    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
    : undefined;
  const workspacePath = last?.workspacePath || fallbackWorkspacePath;
  if (!workspacePath) {
    vscode.window.showErrorMessage(
      'Third Party Compare (Checkov) requires a scan scope. Run an ORL scan first or open a file in the target directory.',
    );
    return;
  }

  // Prefer cached targets so the list survives post-fix rescans that produce 0 fixes/changes.
  const cached = scanResultsProvider.getCachedFixProofCheckovTargets({
    workspacePath,
  });
  if (cached) {
    // Sliding TTL: running verification counts as "activity".
    scanResultsProvider
      .touchFixProofCheckovTargets({ workspacePath })
      .catch(() => {});
  }
  let extracted: ReturnType<CheckovIdExtractor['extract']> | undefined =
    undefined;
  if (!cached) {
    const report = last?.report;
    if (!report || typeof report !== 'string' || !report.trim()) {
      vscode.window.showErrorMessage(
        'Third Party Compare (Checkov) could not find cached Checkov targets, and the last ORL report was missing. Run an ORL scan first.',
      );
      return;
    }
    const parsed = parseOrlReport(report);
    const extractor = new CheckovIdExtractor();
    extracted = extractor.extract({
      parsedReport: parsed,
      onlyRulesThatChangedCode: true,
    });
    if (extracted.checkIds.length) {
      // Cache for future runs within TTL.
      await scanResultsProvider.cacheFixProofCheckovTargets({
        workspacePath,
        checkIds: extracted.checkIds,
        checkIdsByRule: extracted.checkIdsByRule,
        evidenceByCheckId: extracted.evidenceByCheckId as any,
      });
    }
  }

  const checkIds = cached?.checkIds || extracted?.checkIds || [];

  if (!checkIds.length) {
    await vscode.window.showInformationMessage(
      'Third Party Compare: No Checkov IDs were found (or cached) for the last ORL scan scope.',
      { modal: true },
    );
    return;
  }

  const cfg = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const image =
    (cfg.get('checkovContainerImage') as string | undefined) ||
    'bridgecrew/checkov:latest';

  logger.info('Third Party Compare (Checkov) starting', {
    workspacePath,
    checkCount: checkIds.length,
    cached: Boolean(cached),
    image,
  });

  const defaultSkipPaths = [
    '.git',
    '.terraform',
    '.orl-temp',
    '.orl-debug',
    'node_modules',
  ];
  const frameworks =
    last?.language === 'terraform'
      ? ['terraform']
      : typeof last?.language === 'string' &&
          last.language.toLowerCase().startsWith('cloudformation')
        ? ['cloudformation']
        : undefined;

  const verifier = new CheckovDockerVerifier({
    image,
    frameworks,
    skipPaths: defaultSkipPaths,
  });

  const result = await CheckovScanCoordinator.runExclusive({
    title: 'Third Party Compare',
    task: async () => {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Third Party Compare: Running Checkov verification (${checkIds.length} checks)`,
          cancellable: false,
        },
        async () => {
          return await verifier.verify({
            workspacePath,
            checkIds,
          });
        },
      );
    },
  });

  if (!result) {
    return;
  }

  const openDetails = async () => {
    const details = {
      scope: {
        workspacePath,
        scannedAt: last?.scannedAt,
        language: last?.language,
        cache: cached
          ? {
              capturedAtMs: cached.capturedAtMs,
              expiresAtMs: cached.expiresAtMs,
              remainingMs: cached.remainingMs,
            }
          : undefined,
      },
      requestedCheckIds: checkIds,
      failingCheckIds: result.failingCheckIds,
      failedByCheckId: result.failedByCheckId,
      summary: result.summary,
      // Keep evidence slim but useful.
      evidenceByCheckId: result.failingCheckIds.reduce(
        (acc: Record<string, any>, id) => {
          acc[id] =
            cached?.evidenceByCheckId?.[id] ||
            extracted?.evidenceByCheckId?.[id] ||
            [];
          return acc;
        },
        {},
      ),
    };
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(details, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

  const copyFailing = async () => {
    const text = result.failingCheckIds.join('\n');
    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(
      'Copied failing Checkov IDs to clipboard.',
    );
  };

  if (result.allPassed) {
    const choice = await vscode.window.showInformationMessage(
      `Third Party Compare: Checkov verification passed for ${checkIds.length} checks.`,
      { modal: true },
      'Show details',
    );
    if (choice === 'Show details') {
      await openDetails();
    }
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Third Party Compare: Checkov still failing for ${result.failingCheckIds.length} / ${checkIds.length} targeted checks.`,
    { modal: true },
    'Show failing IDs',
    'Copy failing IDs',
    'Show details',
  );

  if (choice === 'Show failing IDs') {
    const doc = await vscode.workspace.openTextDocument({
      content: result.failingCheckIds.join('\n') + '\n',
      language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }
  if (choice === 'Copy failing IDs') {
    await copyFailing();
    return;
  }
  if (choice === 'Show details') {
    await openDetails();
    return;
  }
}
