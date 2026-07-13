import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
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
const GOMBOC_TELEMETRY_SOURCE = 'IDE_EXTENSION';
const GOMBOC_TELEMETRY_CLIENT_ID = 'gomboc-vscode-extension';

/**
 * Primitive attribute values accepted by OpenTelemetry spans and events.
 */
export type TelemetryAttributeValue = string | number | boolean;

/**
 * Raw telemetry attributes before sanitization.
 */
export type TelemetryAttributes = Record<string, unknown>;

/**
 * Resolved telemetry settings for exporter, output-channel, and VS Code consent behavior.
 */
export type TelemetryRuntimeConfig = {
  telemetryEnabled: boolean;
  integrationsServiceUrl: string;
  apiKey: string | undefined;
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

type TraceExporterConfig = {
  url: string;
  headers: Record<string, string>;
};

type TraceEndpointDebugInfo = {
  url: string;
  isIntegrationsEndpoint: boolean;
  configuredHeaderKeys: string[];
  effectiveHeaderKeys: string[];
  hasApiKey: boolean;
  skippedReason?: string;
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

function isIntegrationsTelemetryEndpoint(
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

function sortedHeaderKeys(headers: Record<string, string>): string[] {
  return Object.keys(headers).sort();
}

/**
 * Manages telemetry output, trace exporters, event recording, and span lifecycle.
 */
export class TelemetryService {
  private activeProvider: ActiveProvider | undefined;
  private outputChannel: vscode.OutputChannel | undefined;
  private extensionVersion = 'unknown';
  private vscodeVersion = vscode.version;
  private sessionId = randomUUID();
  private lastConfig: TelemetryRuntimeConfig | undefined;

  /**
   * Initializes runtime version attributes and configures telemetry once.
   */
  public initialize(options: TelemetryServiceOptions): void {
    this.extensionVersion = options.extensionVersion || 'unknown';
    this.vscodeVersion = options.vscodeVersion || vscode.version;
    this.configure();
  }

  /**
   * Re-reads configuration and updates output/exporter providers.
   */
  public configure(): void {
    try {
      const config = getTelemetryConfig();
      this.lastConfig = config;
      this.configureOutput(config);
      this.configureProvider(config);
      const exporterConfigs = this.getTraceExporterConfigs(config);
      logger.debug('Telemetry configuration resolved', {
        telemetryEnabled: config.telemetryEnabled,
        vscodeTelemetryEnabled: config.vscodeTelemetryEnabled,
        telemetryOutputChannelEnabled: config.telemetryOutputChannelEnabled,
        integrationsServiceUrl: config.integrationsServiceUrl,
        endpointCount: config.telemetryOtlpTracesEndpoints.length,
        exporterCount: exporterConfigs.length,
        hasApiKey: !!config.apiKey,
        configuredTelemetryHeaderKeys: sortedHeaderKeys(
          config.telemetryHeaders,
        ),
        endpoints: this.getTraceEndpointDebugInfo(config),
      });
      this.recordEvent('telemetry.configured', {
        'telemetry.extension.enabled': config.telemetryEnabled,
        'telemetry.vscode.enabled': config.vscodeTelemetryEnabled,
        'telemetry.export.enabled': this.shouldExport(config),
        'telemetry.export.collector_count': exporterConfigs.length,
        'telemetry.output.enabled': config.telemetryOutputChannelEnabled,
      });
    } catch (error) {
      logger.debug('Failed to configure telemetry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Records a one-shot telemetry event with common sanitized attributes.
   */
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

  /**
   * Runs an async operation inside a telemetry span when telemetry is enabled.
   */
  public async withSpan<T>(
    name: string,
    attributes: TelemetryAttributes | undefined,
    fn: (span: Span | undefined) => Promise<T>,
  ): Promise<T> {
    const config = this.lastConfig ?? getTelemetryConfig();
    if (!config.telemetryEnabled) {
      return fn(undefined);
    }
    logger.debug('Starting telemetry span', {
      span: name,
      attributes: sanitizeTelemetryAttributes(attributes),
    });

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

  /**
   * Shuts down the active trace provider and disposes local output resources.
   */
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
    const exporterConfigs = this.getTraceExporterConfigs(config);
    if (
      !config.telemetryEnabled ||
      !config.vscodeTelemetryEnabled ||
      !exporterConfigs.length
    ) {
      logger.debug('Telemetry provider not configured', {
        reasons: this.getProviderSkipReasons(config, exporterConfigs),
        endpointCount: config.telemetryOtlpTracesEndpoints.length,
        exporterCount: exporterConfigs.length,
        endpoints: this.getTraceEndpointDebugInfo(config),
      });
      this.shutdownProvider();
      return;
    }

    const cacheKey = JSON.stringify({
      exporters: exporterConfigs.map(exporterConfig => ({
        url: exporterConfig.url,
        headerFingerprint: telemetryHeaderFingerprint(exporterConfig.headers),
      })),
      extensionVersion: this.extensionVersion,
      vscodeVersion: this.vscodeVersion,
    });

    if (this.activeProvider?.cacheKey === cacheKey) {
      logger.debug('Telemetry provider configuration unchanged', {
        exporterCount: exporterConfigs.length,
        exporters: this.describeTraceExporterConfigs(exporterConfigs),
      });
      return;
    }

    this.shutdownProvider();

    logger.debug('Configuring telemetry provider', {
      exporterCount: exporterConfigs.length,
      exporters: this.describeTraceExporterConfigs(exporterConfigs),
    });

    const spanProcessors = exporterConfigs.map(
      exporterConfig =>
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: exporterConfig.url,
            headers: exporterConfig.headers,
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
      logger.debug('Shutting down telemetry provider');
      provider.provider.shutdown().catch(error => {
        logger.debug('Failed to shut down telemetry provider', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private shouldExport(config: TelemetryRuntimeConfig): boolean {
    return (
      config.telemetryEnabled &&
      config.vscodeTelemetryEnabled &&
      this.getTraceExporterConfigs(config).length > 0
    );
  }

  private getTraceExporterConfigs(
    config: TelemetryRuntimeConfig,
  ): TraceExporterConfig[] {
    return config.telemetryOtlpTracesEndpoints.flatMap(endpoint => {
      const headers = this.getTraceExporterHeaders(endpoint, config);
      if (!headers) {
        return [];
      }

      return [{ url: endpoint, headers }];
    });
  }

  private getTraceExporterHeaders(
    endpoint: string,
    config: TelemetryRuntimeConfig,
  ): Record<string, string> | undefined {
    if (
      !isIntegrationsTelemetryEndpoint(endpoint, config.integrationsServiceUrl)
    ) {
      return config.telemetryHeaders;
    }

    if (!config.apiKey) {
      return undefined;
    }

    return {
      ...config.telemetryHeaders,
      Authorization: `Bearer ${config.apiKey}`,
      'x-gomboc-telemetry-source': GOMBOC_TELEMETRY_SOURCE,
      'x-gomboc-client-id': GOMBOC_TELEMETRY_CLIENT_ID,
      'x-gomboc-client-version': this.extensionVersion,
      'x-gomboc-session-id': this.sessionId,
    };
  }

  private getProviderSkipReasons(
    config: TelemetryRuntimeConfig,
    exporterConfigs: TraceExporterConfig[],
  ): string[] {
    const reasons: string[] = [];

    if (!config.telemetryEnabled) {
      reasons.push('extension_telemetry_disabled');
    }
    if (!config.vscodeTelemetryEnabled) {
      reasons.push('vscode_telemetry_disabled');
    }
    if (!exporterConfigs.length) {
      reasons.push('no_exportable_endpoints');
    }

    return reasons;
  }

  private getTraceEndpointDebugInfo(
    config: TelemetryRuntimeConfig,
  ): TraceEndpointDebugInfo[] {
    return config.telemetryOtlpTracesEndpoints.map(endpoint => {
      const isIntegrationsEndpoint = isIntegrationsTelemetryEndpoint(
        endpoint,
        config.integrationsServiceUrl,
      );
      const effectiveHeaders = this.getTraceExporterHeaders(endpoint, config);

      return {
        url: endpoint,
        isIntegrationsEndpoint,
        configuredHeaderKeys: sortedHeaderKeys(config.telemetryHeaders),
        effectiveHeaderKeys: effectiveHeaders
          ? sortedHeaderKeys(effectiveHeaders)
          : [],
        hasApiKey: !!config.apiKey,
        skippedReason:
          isIntegrationsEndpoint && !config.apiKey
            ? 'missing_api_key'
            : undefined,
      };
    });
  }

  private describeTraceExporterConfigs(
    exporterConfigs: TraceExporterConfig[],
  ): Array<{ url: string; headerKeys: string[] }> {
    return exporterConfigs.map(exporterConfig => ({
      url: exporterConfig.url,
      headerKeys: sortedHeaderKeys(exporterConfig.headers),
    }));
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

/**
 * Shared telemetry service instance used by commands and providers.
 */
export const telemetryService = new TelemetryService();
