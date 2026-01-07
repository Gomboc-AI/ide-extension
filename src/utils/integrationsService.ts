import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import logger from './logger';
import { parseOrlReport } from './orlReportParser';
import { OrlResult } from '../orl/orlResultConverter';

const execAsync = promisify(exec);

/**
 * Get git repository root path
 */
async function getGitRoot(workspacePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', {
      cwd: workspacePath,
    });
    return stdout.trim();
  } catch (error) {
    // Silently handle errors - not in a git repo or git command failed
    logger.debug('Failed to get git root', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get current git branch
 */
async function getGitBranch(workspacePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspacePath,
    });
    return stdout.trim() || null;
  } catch (error) {
    // Silently handle errors - not in a git repo or git command failed
    logger.debug('Failed to get git branch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get relative path from git root to the directory being scanned by ORL
 * This is the path to the directory in the repository that gets scanned by the ORL tool
 * Returns the path relative to repo root, or null if not in a git repo
 *
 * @param workspacePath - The directory path that ORL scans (from path.dirname(filePath))
 * @returns Relative path from git root to scanned directory (e.g., "subfolder" or "." for root)
 */
async function getRepoRelativePath(
  workspacePath: string,
): Promise<string | null> {
  try {
    const gitRoot = await getGitRoot(workspacePath);
    if (!gitRoot) {
      return null;
    }

    // Calculate relative path from git root to the scanned directory
    // workspacePath is the directory that ORL scans (the directory containing the scanned file)
    const relativePath = path.relative(gitRoot, workspacePath);
    // Return "." if workspacePath is the git root, otherwise return the relative path
    return relativePath || '.';
  } catch (error) {
    logger.warn('Failed to get repo relative path', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get configuration values for integrations service
 */
function getIntegrationsConfig(): {
  integrationsServiceUrl: string | undefined;
  apiKey: string | undefined;
} {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  return {
    integrationsServiceUrl: config.get('integrationsServiceUrl') as
      | string
      | undefined,
    apiKey: config.get('apiKey') as string | undefined,
  };
}

function getFixAppliedAnalyticsConfig(): {
  enabled: boolean;
  endpointPath: string;
} {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  return {
    enabled: (config.get('orlFixAppliedAnalyticsEnabled') as boolean) || false,
    endpointPath:
      (config.get('integrationsFixAppliedEndpointPath') as string) ||
      '/reporting/orl-fix-applied',
  };
}

type OrlFixAppliedEventV1 = {
  type: 'orl_fix_applied';
  idempotencyKey: string;
  occurredAt: string;
  fixKind: 'individual' | 'grouped';
  ruleNames: string[];
  ruleIdentifiers: string[];
  filePaths: string[];
  repoPath?: string;
  branch?: string;
  repoRelativeDir?: string;
  reportGeneratedAt?: string;
};

type OrlFixAppliedEventQueueItemV1 = {
  event: OrlFixAppliedEventV1;
  attempts: number;
  nextAttemptAt: number;
};

const FIX_APPLIED_QUEUE_KEY = 'gomboc.orlFixAppliedQueueV1';
const FIX_APPLIED_SENT_KEY = 'gomboc.orlFixAppliedSentV1';
const MAX_QUEUE_SIZE = 200;
const MAX_ATTEMPTS = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function backoffMs(attempts: number): number {
  // 1s, 2s, 4s ... capped at 60s
  const ms = Math.min(60_000, 1_000 * Math.pow(2, Math.max(0, attempts)));
  // small jitter
  return ms + Math.floor(Math.random() * 250);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function pruneSentMap(sent: Record<string, number>, ttlMs: number): void {
  const cutoff = Date.now() - ttlMs;
  for (const [k, ts] of Object.entries(sent)) {
    if (typeof ts !== 'number' || ts < cutoff) {
      delete sent[k];
    }
  }
}

async function loadQueue(
  context: vscode.ExtensionContext,
): Promise<OrlFixAppliedEventQueueItemV1[]> {
  const v = context.globalState.get(FIX_APPLIED_QUEUE_KEY) as
    | OrlFixAppliedEventQueueItemV1[]
    | undefined;
  return Array.isArray(v) ? v : [];
}

async function saveQueue(
  context: vscode.ExtensionContext,
  items: OrlFixAppliedEventQueueItemV1[],
): Promise<void> {
  await context.globalState.update(FIX_APPLIED_QUEUE_KEY, items);
}

async function loadSentMap(
  context: vscode.ExtensionContext,
): Promise<Record<string, number>> {
  const v = context.globalState.get(FIX_APPLIED_SENT_KEY) as
    | Record<string, number>
    | undefined;
  return v && typeof v === 'object' ? v : {};
}

async function saveSentMap(
  context: vscode.ExtensionContext,
  sent: Record<string, number>,
): Promise<void> {
  await context.globalState.update(FIX_APPLIED_SENT_KEY, sent);
}

async function postFixAppliedEvent(
  url: string,
  apiKey: string,
  endpointPath: string,
  event: OrlFixAppliedEventV1,
): Promise<void> {
  const body = {
    version: 1.0,
    requestOrigin: 'ide-extension',
    events: [event],
  };
  await axios.post(`${url}${endpointPath}`, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': event.idempotencyKey,
      'X-Idempotency-Key': event.idempotencyKey,
    },
    timeout: 10_000,
  });
}

export async function flushOrlFixAppliedEvents(
  context: vscode.ExtensionContext,
): Promise<void> {
  const { integrationsServiceUrl, apiKey } = getIntegrationsConfig();
  const { enabled, endpointPath } = getFixAppliedAnalyticsConfig();

  if (!enabled) {
    return;
  }
  if (!integrationsServiceUrl || !apiKey) {
    return;
  }

  const queue = await loadQueue(context);
  if (queue.length === 0) {
    return;
  }

  const sent = await loadSentMap(context);
  pruneSentMap(sent, 7 * 24 * 60 * 60 * 1000); // 7 days

  const now = Date.now();
  const remaining: OrlFixAppliedEventQueueItemV1[] = [];
  let sentCount = 0;
  let droppedCount = 0;

  for (const item of queue) {
    if (!item?.event?.idempotencyKey) {
      droppedCount++;
      continue;
    }

    if (sent[item.event.idempotencyKey]) {
      // Already sent (client-side dedupe)
      droppedCount++;
      continue;
    }

    if ((item.nextAttemptAt || 0) > now) {
      remaining.push(item);
      continue;
    }

    try {
      await postFixAppliedEvent(
        integrationsServiceUrl,
        apiKey,
        endpointPath,
        item.event,
      );
      sent[item.event.idempotencyKey] = Date.now();
      sentCount++;
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;

      // If endpoint doesn't exist or request is invalid, drop to avoid infinite growth.
      if (status && status >= 400 && status < 500 && status !== 429) {
        logger.warn('Dropping ORL fix applied event (non-retryable)', {
          status,
          endpointPath,
        });
        droppedCount++;
        continue;
      }

      // Network error or retryable status => keep with backoff, up to MAX_ATTEMPTS.
      const attempts = (item.attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        logger.warn('Dropping ORL fix applied event (max attempts reached)', {
          attempts,
          endpointPath,
          status,
        });
        droppedCount++;
        continue;
      }

      const retryable = status ? isRetryableStatus(status) : true;
      if (!retryable) {
        droppedCount++;
        continue;
      }

      remaining.push({
        event: item.event,
        attempts,
        nextAttemptAt: Date.now() + backoffMs(attempts),
      });
    }
  }

  // Cap queue size to prevent unbounded growth
  const capped = remaining.slice(-MAX_QUEUE_SIZE);
  await Promise.all([saveQueue(context, capped), saveSentMap(context, sent)]);

  if (sentCount || droppedCount) {
    logger.info('ORL fix applied events flush result', {
      queuedBefore: queue.length,
      queuedAfter: capped.length,
      sentCount,
      droppedCount,
    });
  }
}

export async function queueOrlFixAppliedEvent(
  context: vscode.ExtensionContext,
  workspacePath: string,
  input: Omit<OrlFixAppliedEventV1, 'idempotencyKey' | 'occurredAt' | 'type'>,
): Promise<void> {
  const { enabled } = getFixAppliedAnalyticsConfig();
  if (!enabled) {
    return;
  }

  const [repoPath, branch, gitRoot] = await Promise.all([
    getRepoRelativePath(workspacePath),
    getGitBranch(workspacePath),
    getGitRoot(workspacePath),
  ]);

  // Never send absolute on-disk paths from the user's machine.
  // Prefer repo-relative paths when inside a git repo; otherwise fall back to basenames.
  const sanitizeFilePath = (p: string): string => {
    if (!p || typeof p !== 'string') {
      return '';
    }
    // If it's not absolute already, keep as-is (but normalize slashes).
    if (!path.isAbsolute(p)) {
      return p.replace(/\\/g, '/');
    }
    if (gitRoot) {
      const rel = path.relative(gitRoot, p).replace(/\\/g, '/');
      // If the file isn't within the repo, don't leak parent traversal.
      if (!rel || rel.startsWith('..')) {
        return path.basename(p);
      }
      return rel;
    }
    return path.basename(p);
  };

  const sanitizedFilePaths = (input.filePaths || [])
    .map(sanitizeFilePath)
    .filter(p => !!p);

  const event: OrlFixAppliedEventV1 = {
    type: 'orl_fix_applied',
    idempotencyKey: randomUUID(),
    occurredAt: nowIso(),
    repoPath: repoPath ?? undefined,
    branch: branch ?? undefined,
    ...input,
    filePaths: sanitizedFilePaths,
  };

  const queue = await loadQueue(context);
  queue.push({ event, attempts: 0, nextAttemptAt: 0 });
  const capped = queue.slice(-MAX_QUEUE_SIZE);
  await saveQueue(context, capped);

  // Fire-and-forget flush
  flushOrlFixAppliedEvents(context).catch(() => {});
}

/**
 * Prepare request body for ORL report submission
 */
function prepareRequestBody(
  orlReport: unknown,
  repoPath: string | null,
  branch: string | null,
  result: OrlResult,
): {
  version: number;
  requestOrigin: string;
  reports: Array<{
    path?: string;
    branch?: string;
    orlReport: unknown;
  }>;
  errors: Array<{ status: number; message: string }>;
} {
  const errors = result.error ? [{ status: 500, message: result.error }] : [];

  return {
    version: 1.0,
    requestOrigin: 'ide-extension',
    reports: [
      {
        ...(repoPath && { path: repoPath }),
        ...(branch && { branch }),
        orlReport,
      },
    ],
    errors,
  };
}

/**
 * Normalize ORL report to the shape expected by integrations (coerce numbers/booleans,
 * ensure required fields/arrays exist, and fill workspace/language).
 */
function normalizeOrlReport(
  raw: unknown,
  workspacePath: string,
  language: string,
): any {
  const filterAnnotations = (
    annotations: Record<string, any> | undefined,
  ): Record<string, string> => {
    const filtered: Record<string, string> = {};
    if (!annotations || typeof annotations !== 'object') {
      return filtered;
    }
    for (const key in annotations) {
      if (
        key.includes('example') ||
        key.includes('graph') ||
        key.includes('code-fix-id') ||
        key.includes('resource-key') ||
        key.includes('risk/statement') ||
        key.includes('impact/statement')
      ) {
        continue;
      }
      const value = annotations[key];
      if (typeof value === 'string') {
        filtered[key] = value;
      }
    }
    return filtered;
  };

  const toNumber = (val: any, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const toBoolean = (val: any, fallback = false): boolean => {
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'string') {
      const v = val.trim().toLowerCase();
      if (v === 'true') {
        return true;
      }
      if (v === 'false') {
        return false;
      }
    }
    return fallback;
  };

  const ensureArray = <T>(val: any, fallback: T[] = []): T[] =>
    Array.isArray(val) ? val : fallback;

  const report = (raw && typeof raw === 'object' ? raw : {}) as any;
  // Support spec.* (preferred) and fall back to top-level
  const spec =
    report.spec && typeof report.spec === 'object' ? report.spec : report;
  const metadata =
    spec.metadata && typeof spec.metadata === 'object' ? spec.metadata : {};

  const filteredTopAnnotations = filterAnnotations(metadata.annotations);

  const rulesSource = ensureArray(spec.rules || report.rules);
  const sumField = (field: 'findings' | 'fixes' | 'changes') =>
    rulesSource.reduce((acc: number, r: any) => acc + toNumber(r?.[field]), 0);

  return {
    type: 'Report',
    version: 'v1',
    metadata: {
      name: metadata.name || 'unknown',
      // Drop large descriptions/annotations to reduce payload size
      description:
        typeof metadata.description === 'string'
          ? metadata.description.slice(0, 500)
          : undefined,
      priority:
        metadata.priority !== undefined
          ? toNumber(metadata.priority, undefined as any)
          : undefined,
      skip: metadata.skip !== undefined ? toBoolean(metadata.skip) : undefined,
      required_contexts: ensureArray(metadata.required_contexts),
      annotations: filteredTopAnnotations,
    },
    workspace: spec.workspace || report.workspace || workspacePath || '',
    language: spec.language || report.language || language || '',
    rules_applied: toNumber(
      spec.rules_applied ?? report.rules_applied ?? rulesSource.length,
    ),
    findings: toNumber(
      spec.findings ?? report.findings ?? sumField('findings'),
    ),
    fixes: toNumber(spec.fixes ?? report.fixes ?? sumField('fixes')),
    changes: toNumber(spec.changes ?? report.changes ?? sumField('changes')),
    errors: ensureArray(spec.errors ?? report.errors)
      .map((e: any) =>
        typeof e === 'string'
          ? e
          : e && typeof e === 'object' && typeof e.message === 'string'
            ? e.message
            : undefined,
      )
      .filter((e: any) => typeof e === 'string'),
    // Drop the per-rule payload to avoid large request sizes; counts above remain accurate
    rules: [],
  };
}

/**
 * Extract error details from axios error response
 */
function extractErrorDetails(error: unknown): unknown {
  if (
    error instanceof Error &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response
  ) {
    return (error.response as { data: unknown }).data;
  }
  return undefined;
}

/**
 * Prepare error-only request body for integrations service
 */
function prepareErrorRequestBody(
  repoPath: string | null,
  branch: string | null,
  errorMessage: string,
  statusCode: number,
  errorContext?: string,
): {
  version: number;
  requestOrigin: string;
  reports: Array<{
    path?: string;
    branch?: string;
  }>;
  errors: Array<{ status: number; message: string }>;
} {
  const errorMessageWithContext = errorContext
    ? `${errorContext}: ${errorMessage}`
    : errorMessage;

  return {
    version: 1.0,
    requestOrigin: 'ide-extension',
    reports: [
      {
        ...(repoPath && { path: repoPath }),
        ...(branch && { branch }),
      },
    ],
    errors: [{ status: statusCode, message: errorMessageWithContext }],
  };
}

/**
 * Send error to integrations service (when no ORL report is available)
 * Non-blocking and will not throw errors
 *
 * @param workspacePath - The directory path that was being scanned
 * @param language - The language being scanned (optional)
 * @param errorMessage - The error message to report
 * @param statusCode - HTTP status code (400 for validation errors, 500 for execution errors)
 * @param errorContext - Optional context about where the error occurred
 */
export async function sendErrorToIntegrations(
  workspacePath: string,
  language: string | undefined,
  errorMessage: string,
  statusCode: number,
  errorContext?: string,
): Promise<void> {
  try {
    const { integrationsServiceUrl, apiKey } = getIntegrationsConfig();

    // Skip if integrations service URL is not configured
    if (!integrationsServiceUrl) {
      logger.debug(
        'Integrations service URL not configured, skipping error submission',
      );
      return;
    }

    // Skip if API key is not configured
    if (!apiKey) {
      logger.debug('API key not configured, skipping error submission');
      return;
    }

    // Get git repository information
    const [repoPath, branch] = await Promise.all([
      getRepoRelativePath(workspacePath),
      getGitBranch(workspacePath),
    ]);

    // Prepare request body with error only
    const requestBody = prepareErrorRequestBody(
      repoPath,
      branch,
      errorMessage,
      statusCode,
      errorContext,
    );

    logger.info('Sending error to integrations service', {
      integrationsServiceUrl,
      repoPath: repoPath ?? 'unknown',
      branch: branch ?? 'unknown',
      language: language ?? 'unknown',
      statusCode,
      errorContext: errorContext ?? 'none',
    });

    // Send request (non-blocking, errors are caught and logged)
    await axios.post(
      `${integrationsServiceUrl}/reporting/orl-external`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      },
    );

    logger.info('Successfully sent error to integrations service');
  } catch (error) {
    // Log error but don't throw - this should not break the remediation workflow
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = extractErrorDetails(error);

    logger.error('Failed to send error to integrations service', {
      error: errorMessage,
      errorDetails,
    });
  }
}

/**
 * Send ORL report to integrations service
 * \non-blocking and will not throw errors
 */
export async function sendOrlReportToIntegrations(
  result: OrlResult,
  workspacePath: string,
  language: string,
): Promise<void> {
  try {
    const { integrationsServiceUrl, apiKey } = getIntegrationsConfig();

    // Skip if integrations service URL is not configured
    if (!integrationsServiceUrl) {
      logger.debug(
        'Integrations service URL not configured, skipping report submission',
      );
      return;
    }

    // Skip if API key is not configured
    if (!apiKey) {
      logger.debug('API key not configured, skipping report submission');
      return;
    }

    // Parse ORL report from YAML
    const orlReport = parseOrlReport(result.report);
    if (!orlReport) {
      logger.warn('Failed to parse ORL report, skipping submission');
      return;
    }

    // Get git repository information
    const [repoPath, branch] = await Promise.all([
      getRepoRelativePath(workspacePath),
      getGitBranch(workspacePath),
    ]);

    // Normalize report to expected schema
    const normalizedReport = normalizeOrlReport(
      orlReport,
      workspacePath,
      language,
    );

    // Prepare request body with new v1.0 schema
    const requestBody = prepareRequestBody(
      normalizedReport,
      repoPath,
      branch,
      result,
    );

    logger.info('Sending ORL report to integrations service', {
      integrationsServiceUrl,
      repoPath: repoPath ?? 'unknown',
      branch: branch ?? 'unknown',
      language,
      reportsCount: 1,
      errorsCount: requestBody.errors.length,
    });

    // Send request (non-blocking, errors are caught and logged)
    await axios.post(
      `${integrationsServiceUrl}/reporting/orl-external`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      },
    );

    logger.info('Successfully sent ORL report to integrations service');
  } catch (error) {
    // Log error but don't throw - this should not break the remediation workflow
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = extractErrorDetails(error);

    logger.error('Failed to send ORL report to integrations service', {
      error: errorMessage,
      errorDetails,
    });
  }
}
