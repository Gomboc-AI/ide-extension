import axios from 'axios';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import logger from '../logger';
import { parseOrlReport } from '../orlReportParser';
import {
  IntegrationsServiceConfig,
  IntegrationsRuntimeConfig,
  IntegrationsErrorRequestBody,
  IntegrationsRequestBody,
  NormalizedOrlReport,
  OrlReport,
  OrlResult,
  OrlFixAppliedEventQueueItemV1,
  OrlFixAppliedEventV1,
  QueueOrlFixAppliedEventInput,
} from './types';

const ORL_FIX_APPLIED_ENDPOINT_PATH = '/reporting/orl-fix-applied';

export class IntegrationsService {
  private readonly execAsync = promisify(exec);
  private readonly integrationsConfigProvider: () => IntegrationsRuntimeConfig;
  private readonly eventStore: IntegrationsServiceConfig<OrlFixAppliedEventQueueItemV1>['eventStore'];

  private static readonly MAX_QUEUE_SIZE = 200;
  private static readonly MAX_ATTEMPTS = 10;

  constructor(
    config: IntegrationsServiceConfig<OrlFixAppliedEventQueueItemV1>,
  ) {
    this.integrationsConfigProvider = config.getIntegrationsConfig;
    this.eventStore = config.eventStore;
  }

  /**
   * Get git repository root path
   */
  private async getGitRoot(workspacePath: string): Promise<string | null> {
    try {
      const { stdout } = await this.execAsync('git rev-parse --show-toplevel', {
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
  private async getGitBranch(workspacePath: string): Promise<string | null> {
    try {
      const { stdout } = await this.execAsync(
        'git rev-parse --abbrev-ref HEAD',
        {
          cwd: workspacePath,
        },
      );
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
  private async getRepoRelativePath(
    workspacePath: string,
  ): Promise<string | null> {
    try {
      const gitRoot = await this.getGitRoot(workspacePath);
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

  private nowIso(): string {
    return new Date().toISOString();
  }

  private backoffMs(attempts: number): number {
    // 1s, 2s, 4s ... capped at 60s
    const ms = Math.min(60_000, 1_000 * Math.pow(2, Math.max(0, attempts)));
    // small jitter
    return ms + Math.floor(Math.random() * 250);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private pruneSentMap(args: {
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

  private async postFixAppliedEvent(args: {
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

  public async flushOrlFixAppliedEvents(): Promise<void> {
    const { integrationsServiceUrl, apiKey, orlFixAppliedAnalyticsEnabled } =
      this.integrationsConfigProvider();

    if (!orlFixAppliedAnalyticsEnabled) {
      return;
    }
    if (!integrationsServiceUrl || !apiKey) {
      return;
    }

    const queue = await this.eventStore.loadQueue();
    if (queue.length === 0) {
      return;
    }

    const sent = await this.eventStore.loadSentMap();
    this.pruneSentMap({ sent, ttlMs: 7 * 24 * 60 * 60 * 1000 }); // 7 days

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
        await this.postFixAppliedEvent({
          url: integrationsServiceUrl,
          apiKey,
          endpointPath: ORL_FIX_APPLIED_ENDPOINT_PATH,
          event: item.event,
        });
        sent[item.event.idempotencyKey] = Date.now();
        sentCount++;
      } catch (err) {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;

        // If endpoint doesn't exist or request is invalid, drop to avoid infinite growth.
        if (status && status >= 400 && status < 500 && status !== 429) {
          logger.warn('Dropping ORL fix applied event (non-retryable)', {
            status,
            endpointPath: ORL_FIX_APPLIED_ENDPOINT_PATH,
          });
          droppedCount++;
          continue;
        }

        // Network error or retryable status => keep with backoff, up to MAX_ATTEMPTS.
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= IntegrationsService.MAX_ATTEMPTS) {
          logger.warn('Dropping ORL fix applied event (max attempts reached)', {
            attempts,
            endpointPath: ORL_FIX_APPLIED_ENDPOINT_PATH,
            status,
          });
          droppedCount++;
          continue;
        }

        const retryable = status ? this.isRetryableStatus(status) : true;
        if (!retryable) {
          droppedCount++;
          continue;
        }

        remaining.push({
          event: item.event,
          attempts,
          nextAttemptAt: Date.now() + this.backoffMs(attempts),
        });
      }
    }

    // Cap queue size to prevent unbounded growth
    const capped = remaining.slice(-IntegrationsService.MAX_QUEUE_SIZE);
    await Promise.all([
      this.eventStore.saveQueue(capped),
      this.eventStore.saveSentMap(sent),
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

  public async queueOrlFixAppliedEvent(
    workspacePath: string,
    input: QueueOrlFixAppliedEventInput,
  ): Promise<void> {
    const { orlFixAppliedAnalyticsEnabled } = this.integrationsConfigProvider();
    if (!orlFixAppliedAnalyticsEnabled) {
      return;
    }

    const [repoPath, branch, gitRoot] = await Promise.all([
      this.getRepoRelativePath(workspacePath),
      this.getGitBranch(workspacePath),
      this.getGitRoot(workspacePath),
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
      occurredAt: this.nowIso(),
      repoPath: repoPath ?? undefined,
      branch: branch ?? undefined,
      ...input,
      ruleNames: sanitizedRuleNames,
      filePaths: sanitizedFilePaths,
    };

    const queue = await this.eventStore.loadQueue();
    queue.push({ event, attempts: 0, nextAttemptAt: 0 });
    const capped = queue.slice(-IntegrationsService.MAX_QUEUE_SIZE);
    await this.eventStore.saveQueue(capped);

    // Fire-and-forget flush
    this.flushOrlFixAppliedEvents().catch(() => {});
  }

  /**
   * Prepare request body for ORL report submission
   */
  private prepareRequestBody(
    orlReport: NormalizedOrlReport,
    repoPath: string | null,
    branch: string | null,
    result: OrlResult,
  ): IntegrationsRequestBody {
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
  private normalizeOrlReport(
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

    const toNumber = (
      val: string | number | undefined,
      fallback = 0,
    ): number => {
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
        skip:
          metadata.skip !== undefined ? toBoolean(metadata.skip) : undefined,
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
  private prepareErrorRequestBody(
    repoPath: string | null,
    branch: string | null,
    errorMessage: string,
    statusCode: number,
    errorContext?: string,
  ): IntegrationsErrorRequestBody {
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
  public async sendError(
    workspacePath: string,
    language: string | undefined,
    errorMessage: string,
    statusCode: number,
    errorContext?: string,
  ): Promise<void> {
    try {
      const { integrationsServiceUrl, apiKey } =
        this.integrationsConfigProvider();

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
        this.getRepoRelativePath(workspacePath),
        this.getGitBranch(workspacePath),
      ]);

      // Prepare request body with error only
      const requestBody = this.prepareErrorRequestBody(
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
      const logErrorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = axios.isAxiosError(error)
        ? error.response?.data
        : undefined;

      logger.error('Failed to send error to integrations service', {
        error: logErrorMessage,
        errorDetails,
      });
    }
  }

  /**
   * Send ORL report to integrations service
   * \non-blocking and will not throw errors
   */
  public async sendOrlReport(
    result: OrlResult,
    workspacePath: string,
    language: string,
  ): Promise<void> {
    try {
      const { integrationsServiceUrl, apiKey } =
        this.integrationsConfigProvider();

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
        this.getRepoRelativePath(workspacePath),
        this.getGitBranch(workspacePath),
      ]);

      // Normalize report to expected schema
      const normalizedReport = this.normalizeOrlReport(
        orlReport,
        workspacePath,
        language,
      );

      // Prepare request body with new v1.0 schema
      const requestBody = this.prepareRequestBody(
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
      const logErrorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = axios.isAxiosError(error)
        ? error.response?.data
        : undefined;

      logger.error('Failed to send ORL report to integrations service', {
        error: logErrorMessage,
        errorDetails,
      });
    }
  }
}
