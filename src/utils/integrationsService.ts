import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import logger from './logger';
import { parseOrlReport } from './orlReportParser';
import { OrlResult } from '../orl/orlResultConverter';
import { OrlReport } from '../schemas/orlReport';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from './configDefaults';

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
    integrationsServiceUrl: getStringSetting(
      config,
      'integrationsServiceUrl',
      DEFAULTS.integrationsServiceUrl,
    ),
    apiKey: config.get('apiKey') as string | undefined,
  };
}

function getFixAppliedAnalyticsConfig(): {
  enabled: boolean;
  endpointPath: string;
} {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  return {
    enabled: getBooleanSetting(config, 'orlFixAppliedAnalyticsEnabled', true),
    endpointPath: getStringSetting(
      config,
      'integrationsFixAppliedEndpointPath',
      DEFAULTS.integrationsFixAppliedEndpointPath,
    ),
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

function pruneSentMap(args: {
  sent: Record<string, number>;
  ttlMs: number;
}): void {
  const { sent, ttlMs } = args;
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

async function saveQueue(args: {
  context: vscode.ExtensionContext;
  items: OrlFixAppliedEventQueueItemV1[];
}): Promise<void> {
  const { context, items } = args;
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

async function saveSentMap(args: {
  context: vscode.ExtensionContext;
  sent: Record<string, number>;
}): Promise<void> {
  const { context, sent } = args;
  await context.globalState.update(FIX_APPLIED_SENT_KEY, sent);
}

async function postFixAppliedEvent(args: {
  url: string;
  apiKey: string;
  endpointPath: string;
  event: OrlFixAppliedEventV1;
}): Promise<void> {
  const { url, apiKey, endpointPath, event } = args;
  const body = {
    version: 1.0,
    requestOrigin: 'IDE',
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
  pruneSentMap({ sent, ttlMs: 7 * 24 * 60 * 60 * 1000 }); // 7 days

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
      await postFixAppliedEvent({
        url: integrationsServiceUrl,
        apiKey,
        endpointPath,
        event: item.event,
      });
      sent[item.event.idempotencyKey] = Date.now();
      sentCount++;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

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
  await Promise.all([
    saveQueue({ context, items: capped }),
    saveSentMap({ context, sent }),
  ]);

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

  // ORL may expand a base ruleset into multiple concrete instances and append a
  // zero-padded numeric suffix like "...000", "...001". For analytics aggregation
  // we strip ONLY a trailing 3-digit suffix when preceded by a non-digit.
  const stripOrlInstanceSuffix = (name: string): string => {
    if (!name || typeof name !== 'string') {
      return '';
    }
    const m = name.match(/^(.*?)(\d{3})$/);
    if (!m) {
      return name;
    }
    const base = m[1] ?? '';
    if (!base) {
      return name;
    }
    const prev = base[base.length - 1];
    // Don't strip if we're in the middle of a longer numeric suffix (e.g. "...2025").
    if (prev && /[0-9]/.test(prev)) {
      return name;
    }
    return base;
  };

  const sanitizedRuleNames = (input.ruleNames || [])
    .map(stripOrlInstanceSuffix)
    .filter(r => !!r);

  const event: OrlFixAppliedEventV1 = {
    type: 'orl_fix_applied',
    idempotencyKey: randomUUID(),
    occurredAt: nowIso(),
    repoPath: repoPath ?? undefined,
    branch: branch ?? undefined,
    ...input,
    ruleNames: sanitizedRuleNames,
    filePaths: sanitizedFilePaths,
  };

  const queue = await loadQueue(context);
  queue.push({ event, attempts: 0, nextAttemptAt: 0 });
  const capped = queue.slice(-MAX_QUEUE_SIZE);
  await saveQueue({ context, items: capped });

  // Fire-and-forget flush
  flushOrlFixAppliedEvents(context).catch(() => {});
}

type NormalizedOrlReport = {
  type: 'Report';
  version: 'v1';
  metadata: {
    name: string;
    description?: string;
    priority?: number;
    skip?: boolean;
    required_contexts: string[];
    annotations: Record<string, string>;
  };
  workspace: string;
  language: string;
  rules_applied: number;
  findings: number;
  fixes: number;
  changes: number;
  errors: string[];
  rules: [];
};

/**
 * Prepare request body for ORL report submission
 */
function prepareRequestBody(
  orlReport: NormalizedOrlReport,
  repoPath: string | null,
  branch: string | null,
  result: OrlResult,
): {
  version: number;
  requestOrigin: string;
  effect: string;
  reports: Array<{
    path?: string;
    branch?: string;
    orlReport: NormalizedOrlReport;
  }>;
  errors: Array<{ status: number; message: string }>;
} {
  const errors = result.error ? [{ status: 500, message: result.error }] : [];

  return {
    version: 1.0,
    requestOrigin: 'IDE',
    effect: 'SubmitForReview',
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
  raw: OrlReport,
  workspacePath: string,
  language: string,
): NormalizedOrlReport {
  const filterAnnotations = (
    annotations: Record<string, string | undefined> | undefined,
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

  const toNumber = (val: string | number | undefined, fallback = 0): number => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };
  const toOptionalNumber = (
    val: string | number | boolean | null | undefined,
  ): number | undefined => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  };

  const toBoolean = (
    val: string | boolean | undefined,
    fallback = false,
  ): boolean => {
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

  const ensureArray = <T>(val: T[] | undefined, fallback: T[] = []): T[] =>
    Array.isArray(val) ? val : fallback;

  // Support spec.* (preferred) and fall back to top-level
  const spec = raw.spec || raw;
  const metadata = spec.metadata || raw.metadata || {};

  const filteredTopAnnotations = filterAnnotations(
    metadata.annotations as Record<string, string | undefined> | undefined,
  );

  const rulesSource = ensureArray(spec.rules || raw.rules);
  const sumField = (field: 'findings' | 'fixes' | 'changes') =>
    rulesSource.reduce((acc: number, r) => acc + toNumber(r?.[field]), 0);

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
          ? toOptionalNumber(metadata.priority)
          : undefined,
      skip: metadata.skip !== undefined ? toBoolean(metadata.skip) : undefined,
      required_contexts: ensureArray(metadata.required_contexts as string[]),
      annotations: filteredTopAnnotations,
    },
    workspace: spec.workspace || raw.workspace || workspacePath || '',
    language: spec.language || raw.language || language || '',
    rules_applied: toNumber(
      spec.rules_applied ?? raw.rules_applied ?? rulesSource.length,
    ),
    findings: toNumber(spec.findings ?? raw.findings ?? sumField('findings')),
    fixes: toNumber(spec.fixes ?? raw.fixes ?? sumField('fixes')),
    changes: toNumber(spec.changes ?? raw.changes ?? sumField('changes')),
    errors: ensureArray(spec.errors ?? raw.errors)
      .map(e =>
        typeof e === 'string'
          ? e
          : e &&
              typeof e === 'object' &&
              'message' in e &&
              typeof e.message === 'string'
            ? e.message
            : undefined,
      )
      .filter((e): e is string => typeof e === 'string'),
    // Drop the per-rule payload to avoid large request sizes; counts above remain accurate
    rules: [],
  };
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
  effect: string;
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
    requestOrigin: 'IDE',
    effect: 'SubmitForReview',
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
    const errorDetails = axios.isAxiosError(error)
      ? error.response?.data
      : undefined;

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
    const errorDetails = axios.isAxiosError(error)
      ? error.response?.data
      : undefined;

    logger.error('Failed to send ORL report to integrations service', {
      error: errorMessage,
      errorDetails,
    });
  }
}
