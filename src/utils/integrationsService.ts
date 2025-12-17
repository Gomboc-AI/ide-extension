import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
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
  const metadata =
    report.metadata && typeof report.metadata === 'object'
      ? report.metadata
      : {};

  const rules = ensureArray(report.rules).map((r: any) => {
    const rMeta =
      r && typeof r === 'object' && typeof r.metadata === 'object'
        ? r.metadata
        : {};
    const files = ensureArray(r.files)
      .map((f: any) =>
        f && typeof f === 'object' && typeof f.path === 'string'
          ? { path: f.path }
          : null,
      )
      .filter(Boolean) as Array<{ path: string }>;

    return {
      metadata: {
        name: rMeta.name || r.name || 'unknown',
        description: rMeta.description,
        priority:
          rMeta.priority !== undefined
            ? toNumber(rMeta.priority, undefined as any)
            : undefined,
        skip: rMeta.skip !== undefined ? toBoolean(rMeta.skip) : undefined,
        required_contexts: ensureArray(rMeta.required_contexts),
        annotations: rMeta.annotations,
        classifications: ensureArray(rMeta.classifications),
      },
      name: r.name || rMeta.name || 'unknown',
      findings: toNumber(r.findings),
      fixes: toNumber(r.fixes),
      changes: toNumber(r.changes),
      errors: ensureArray(r.errors),
      files,
    };
  });

  return {
    type: 'Report',
    version: 'v1',
    metadata: {
      name: metadata.name || 'unknown',
      description: metadata.description,
      priority:
        metadata.priority !== undefined
          ? toNumber(metadata.priority, undefined as any)
          : undefined,
      skip: metadata.skip !== undefined ? toBoolean(metadata.skip) : undefined,
      required_contexts: ensureArray(metadata.required_contexts),
      annotations: metadata.annotations,
    },
    workspace: report.workspace || workspacePath || '',
    language: report.language || language || '',
    rules_applied: toNumber(report.rules_applied),
    findings: toNumber(report.findings),
    fixes: toNumber(report.fixes),
    changes: toNumber(report.changes),
    errors: ensureArray(report.errors),
    rules,
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
