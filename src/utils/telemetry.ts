import * as path from 'path';
import { createHash } from 'crypto';
import * as vscode from 'vscode';
import {
  Span,
  SpanStatusCode,
  Tracer,
  context as otelContext,
  trace,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from './configDefaults';
import logger from './logger';

const EXTENSION_CONFIG_SECTION = 'gomboc-vscode-extension';
const TELEMETRY_OUTPUT_CHANNEL = 'Gomboc Telemetry';
const TRACER_NAME = 'gomboc-vscode-extension';
const MAX_ATTRIBUTE_STRING_LENGTH = 512;

export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Record<string, unknown>;

export type TelemetryRuntimeConfig = {
  telemetryEnabled: boolean;
  telemetryOtlpTracesEndpoint: string;
  telemetryOtlpTracesEndpoints: string[];
  telemetryHeaders: Record<string, string>;
  telemetryOutputChannelEnabled: boolean;
  vscodeTelemetryEnabled: boolean;
};

type TelemetryServiceOptions = {
  extensionVersion: string;
  vscodeVersion: string;
};

type ActiveProvider = {
  provider: NodeTracerProvider;
  tracer: Tracer;
  cacheKey: string;
};

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

export function getTelemetryConfig(): TelemetryRuntimeConfig {
  const config = vscode.workspace.getConfiguration(EXTENSION_CONFIG_SECTION);
  const telemetryOtlpTracesEndpoint = getStringSetting(
    config,
    'telemetryOtlpTracesEndpoint',
    DEFAULTS.telemetryOtlpTracesEndpoint,
  );
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

function normalizeErrorType(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'UnknownError';
  }

  const name = error.name || 'Error';
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : 'Error';
}

function telemetryHeaderFingerprint(headers: Record<string, string>): string {
  const sortedHeaders = Object.entries(headers).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash('sha256')
    .update(JSON.stringify(sortedHeaders))
    .digest('hex');
}

export class TelemetryService {
  private activeProvider: ActiveProvider | undefined;
  private outputChannel: vscode.OutputChannel | undefined;
  private extensionVersion = 'unknown';
  private vscodeVersion = vscode.version;
  private lastConfig: TelemetryRuntimeConfig | undefined;

  public initialize(options: TelemetryServiceOptions): void {
    this.extensionVersion = options.extensionVersion || 'unknown';
    this.vscodeVersion = options.vscodeVersion || vscode.version;
    this.configure();
  }

  public configure(): void {
    try {
      const config = getTelemetryConfig();
      this.lastConfig = config;
      this.configureOutput(config);
      this.configureProvider(config);
      this.recordEvent('telemetry.configured', {
        'telemetry.extension.enabled': config.telemetryEnabled,
        'telemetry.vscode.enabled': config.vscodeTelemetryEnabled,
        'telemetry.export.enabled': this.shouldExport(config),
        'telemetry.export.collector_count':
          config.telemetryOtlpTracesEndpoints.length,
        'telemetry.output.enabled': config.telemetryOutputChannelEnabled,
      });
    } catch (error) {
      logger.debug('Failed to configure telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public recordEvent(name: string, attributes?: TelemetryAttributes): void {
    try {
      const config = this.lastConfig ?? getTelemetryConfig();
      if (!config.telemetryEnabled) {
        return;
      }

      const sanitized = this.withCommonAttributes(
        sanitizeTelemetryAttributes(attributes),
      );
      this.writeOutput(name, sanitized, config);

      const span = this.activeProvider?.tracer.startSpan(name, {
        attributes: sanitized,
      });
      span?.end();
    } catch (error) {
      logger.debug('Failed to record telemetry event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async withSpan<T>(
    name: string,
    attributes: TelemetryAttributes | undefined,
    fn: (span: Span | undefined) => Promise<T>,
  ): Promise<T> {
    const config = this.lastConfig ?? getTelemetryConfig();
    if (!config.telemetryEnabled) {
      return fn(undefined);
    }

    const startAttributes = this.withCommonAttributes(
      sanitizeTelemetryAttributes(attributes),
    );
    const span = this.activeProvider?.tracer.startSpan(name, {
      attributes: startAttributes,
    });
    const startedAt = Date.now();
    this.writeOutput(`${name}.start`, startAttributes, config);

    try {
      const run = () => fn(span);
      const result = span
        ? await otelContext.with(trace.setSpan(otelContext.active(), span), run)
        : await run();
      const endAttributes = this.withCommonAttributes({
        ...startAttributes,
        'telemetry.duration_ms': Date.now() - startedAt,
        'telemetry.outcome': 'success',
      });
      span?.setAttributes(endAttributes);
      span?.setStatus({ code: SpanStatusCode.OK });
      this.writeOutput(`${name}.end`, endAttributes, config);
      return result;
    } catch (error) {
      const failureAttributes = this.withCommonAttributes({
        ...startAttributes,
        'telemetry.duration_ms': Date.now() - startedAt,
        'telemetry.outcome': 'error',
        ...this.errorAttributes(error),
      });
      span?.setAttributes(failureAttributes);
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: failureAttributes['error.code'] as string | undefined,
      });
      this.writeOutput(`${name}.end`, failureAttributes, config);
      throw error;
    } finally {
      span?.end();
    }
  }

  public async shutdown(): Promise<void> {
    const provider = this.activeProvider;
    this.activeProvider = undefined;
    if (provider) {
      await provider.provider.shutdown();
    }
    this.outputChannel?.dispose();
    this.outputChannel = undefined;
  }

  private configureOutput(config: TelemetryRuntimeConfig): void {
    if (!config.telemetryOutputChannelEnabled) {
      this.outputChannel?.dispose();
      this.outputChannel = undefined;
      return;
    }

    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel(
        TELEMETRY_OUTPUT_CHANNEL,
      );
    }
  }

  private configureProvider(config: TelemetryRuntimeConfig): void {
    if (!this.shouldExport(config)) {
      this.shutdownProvider();
      return;
    }

    const cacheKey = JSON.stringify({
      endpoints: config.telemetryOtlpTracesEndpoints,
      headerFingerprint: telemetryHeaderFingerprint(config.telemetryHeaders),
      extensionVersion: this.extensionVersion,
      vscodeVersion: this.vscodeVersion,
    });

    if (this.activeProvider?.cacheKey === cacheKey) {
      return;
    }

    this.shutdownProvider();

    const spanProcessors = config.telemetryOtlpTracesEndpoints.map(
      endpoint =>
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: endpoint,
            headers: config.telemetryHeaders,
          }),
          {
            maxQueueSize: 128,
            maxExportBatchSize: 32,
            scheduledDelayMillis: 5_000,
            exportTimeoutMillis: 10_000,
          },
        ),
    );
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'gomboc-vscode-extension',
        [ATTR_SERVICE_NAMESPACE]: 'gomboc',
        [ATTR_SERVICE_VERSION]: this.extensionVersion,
      }),
      spanProcessors,
    });

    this.activeProvider = {
      provider,
      tracer: provider.getTracer(TRACER_NAME, this.extensionVersion),
      cacheKey,
    };
  }

  private shutdownProvider(): void {
    const provider = this.activeProvider;
    this.activeProvider = undefined;
    if (provider) {
      provider.provider.shutdown().catch(error => {
        logger.debug('Failed to shut down telemetry provider', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private shouldExport(config: TelemetryRuntimeConfig): boolean {
    return config.telemetryEnabled && config.vscodeTelemetryEnabled;
  }

  private withCommonAttributes(
    attributes: Record<string, TelemetryAttributeValue>,
  ): Record<string, TelemetryAttributeValue> {
    return {
      'extension.name': 'gomboc-vscode-extension',
      'extension.version': this.extensionVersion,
      'vscode.version': this.vscodeVersion,
      ...attributes,
    };
  }

  private writeOutput(
    name: string,
    attributes: Record<string, TelemetryAttributeValue>,
    config: TelemetryRuntimeConfig,
  ): void {
    if (!config.telemetryOutputChannelEnabled || !this.outputChannel) {
      return;
    }

    this.outputChannel.appendLine(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event: name,
        attributes,
      }),
    );
  }

  private errorAttributes(error: unknown): Record<string, string> {
    return {
      'error.type': normalizeErrorType(error),
      'error.code': 'operation_failed',
    };
  }
}

export const telemetryService = new TelemetryService();
