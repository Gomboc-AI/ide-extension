import { createHash } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from '../configDefaults';
import type {
  TelemetryAttributes,
  TelemetryAttributeValue,
  TelemetryRuntimeConfig,
} from './types';

const EXTENSION_CONFIG_SECTION = 'gomboc-vscode-extension';
const MAX_ATTRIBUTE_STRING_LENGTH = 512;

function readHeaders(
  config: vscode.WorkspaceConfiguration,
): Record<string, string> {
  const raw = config.get('telemetryHeaders') as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const trimmedKey = key.trim();
    if (!trimmedKey || typeof value !== 'string') {
      continue;
    }
    headers[trimmedKey] = value;
  }
  return headers;
}

function readStringArray(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string[],
): string[] {
  const raw = config.get(key) as unknown;
  if (!Array.isArray(raw)) {
    return fallback;
  }

  return Array.from(
    new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean),
    ),
  );
}

function readOptionalString(
  config: vscode.WorkspaceConfiguration,
  key: string,
): string | undefined {
  const raw = config.get(key) as unknown;
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed || undefined;
}

function buildIntegrationsTelemetryEndpoint(
  integrationsServiceUrl: string,
): string {
  return `${integrationsServiceUrl.replace(/\/+$/, '')}/telemetry/v1/traces`;
}

function canonicalTelemetryEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isIntegrationsTelemetryEndpoint(
  endpoint: string,
  integrationsServiceUrl: string,
): boolean {
  const canonicalEndpoint = canonicalTelemetryEndpoint(endpoint);
  const canonicalIntegrationsEndpoint = canonicalTelemetryEndpoint(
    buildIntegrationsTelemetryEndpoint(integrationsServiceUrl),
  );

  return (
    canonicalEndpoint !== undefined &&
    canonicalEndpoint === canonicalIntegrationsEndpoint
  );
}

/**
 * Reads and normalizes telemetry settings from VS Code configuration.
 */
export function getTelemetryConfig(): TelemetryRuntimeConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION);
  const integrationsServiceUrl = getStringSetting(
    config,
    'integrationsServiceUrl',
    DEFAULTS.integrationsServiceUrl,
  );
  const configuredTelemetryOtlpTracesEndpoint = getStringSetting(
    config,
    'telemetryOtlpTracesEndpoint',
    DEFAULTS.telemetryOtlpTracesEndpoint,
  );
  const telemetryOtlpTracesEndpoint =
    configuredTelemetryOtlpTracesEndpoint ||
    buildIntegrationsTelemetryEndpoint(integrationsServiceUrl);
  const configuredEndpoints = readStringArray(
    config,
    'telemetryOtlpTracesEndpoints',
    DEFAULTS.telemetryOtlpTracesEndpoints,
  );
  return {
    telemetryEnabled: getBooleanSetting(
      config,
      'telemetryEnabled',
      DEFAULTS.telemetryEnabled,
    ),
    integrationsServiceUrl,
    apiKey: readOptionalString(config, 'apiKey'),
    telemetryOtlpTracesEndpoint,
    telemetryOtlpTracesEndpoints: configuredEndpoints.length
      ? configuredEndpoints
      : [telemetryOtlpTracesEndpoint],
    telemetryHeaders: readHeaders(config),
    telemetryOutputChannelEnabled: getBooleanSetting(
      config,
      'telemetryOutputChannelEnabled',
      DEFAULTS.telemetryOutputChannelEnabled,
    ),
    vscodeTelemetryEnabled: vscode.env.isTelemetryEnabled,
  };
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/api[-_ ]?key\s*[:=]\s*[A-Za-z0-9._~+/=-]+/gi, 'apiKey=[redacted]')
    .replace(/([A-Za-z]:\\)[^\s'"]+/g, '[path]')
    .replace(
      /\/(?:Users|home|private|tmp|var|workspace|repo)\/[^\s'"]+/g,
      '[path]',
    );
}

function sanitizePathLikeValue(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    return path.basename(normalized);
  }
  if (normalized.includes('/')) {
    return path.basename(normalized);
  }
  return normalized;
}

function sanitizeStringAttribute(key: string, value: string): string {
  const lowerKey = key.toLowerCase();
  let sanitized = value;

  if (
    lowerKey.includes('path') ||
    lowerKey.includes('file') ||
    lowerKey.includes('workspace') ||
    lowerKey.includes('directory')
  ) {
    sanitized = sanitizePathLikeValue(sanitized);
  }

  sanitized = redactSensitiveText(sanitized);

  return sanitized.length > MAX_ATTRIBUTE_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_ATTRIBUTE_STRING_LENGTH)}...`
    : sanitized;
}

/**
 * Redacts and normalizes telemetry attributes before logging or export.
 */
export function sanitizeTelemetryAttributes(
  attributes?: TelemetryAttributes,
): Record<string, TelemetryAttributeValue> {
  const sanitized: Record<string, TelemetryAttributeValue> = {};
  if (!attributes) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(attributes)) {
    if (!key || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeStringAttribute(key, value);
      continue;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        sanitized[key] = value;
      }
      continue;
    }

    if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function normalizeErrorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'UnknownError';
  }

  const name = error.name || 'Error';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : 'Error';
}

export function telemetryHeaderFingerprint(
  headers: Record<string, string>,
): string {
  const sortedHeaders = Object.entries(headers).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash('sha256')
    .update(JSON.stringify(sortedHeaders))
    .digest('hex');
}

export function sortedHeaderKeys(
  headers: Record<string, string>,
): string[] {
  return Object.keys(headers).sort();
}
