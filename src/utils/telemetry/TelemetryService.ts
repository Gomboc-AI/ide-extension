import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { ROOT_CONTEXT, Span, SpanStatusCode, trace } from '@opentelemetry/api';
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
import logger from '../logger';
import { TelemetryOperationContext } from './TelemetryOperationContext';
import type {
  ActiveProvider,
  TelemetryAttributes,
  TelemetryAttributeValue,
  TelemetryRuntimeConfig,
  TelemetryServiceOptions,
  TraceEndpointDebugInfo,
  TraceExporterConfig,
} from './types';
import {
  getTelemetryConfig,
  isIntegrationsTelemetryEndpoint,
  normalizeErrorType,
  sanitizeTelemetryAttributes,
  sortedHeaderKeys,
  telemetryHeaderFingerprint,
} from './utils';

const TELEMETRY_OUTPUT_CHANNEL = 'Gomboc Telemetry';
const TRACER_NAME = 'gomboc-vscode-extension';
const GOMBOC_TELEMETRY_SOURCE = 'IDE_EXTENSION';
const GOMBOC_TELEMETRY_CLIENT_ID = 'gomboc-vscode-extension';

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
      const span = this.activeProvider?.tracer.startSpan(name, {
        attributes: sanitized,
      });
      this.writeOutput(name, sanitized, config, span?.spanContext());
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
    fn: (operation: TelemetryOperationContext) => Promise<T>,
    parent?: TelemetryOperationContext,
  ): Promise<T> {
    const config = this.lastConfig ?? getTelemetryConfig();
    if (!config.telemetryEnabled) {
      return fn(this.createOperationContext(name, config, undefined, parent));
    }
    logger.debug('Starting telemetry span', {
      span: name,
      attributes: sanitizeTelemetryAttributes(attributes),
    });

    const startAttributes = this.withCommonAttributes(
      sanitizeTelemetryAttributes(attributes),
    );
    const span = this.activeProvider?.tracer.startSpan(
      name,
      {
        attributes: startAttributes,
      },
      parent?.getContext() ?? ROOT_CONTEXT,
    );
    const operation = this.createOperationContext(name, config, span, parent);
    const startedAt = Date.now();
    this.writeOutput(
      `${name}.start`,
      startAttributes,
      config,
      span?.spanContext(),
      parent?.getCorrelation().spanId,
    );

    try {
      const result = await fn(operation);
      const endAttributes = this.withCommonAttributes({
        ...startAttributes,
        'telemetry.duration_ms': Date.now() - startedAt,
        'telemetry.outcome': 'success',
      });
      span?.setAttributes(endAttributes);
      span?.setStatus({ code: SpanStatusCode.OK });
      this.writeOutput(
        `${name}.end`,
        endAttributes,
        config,
        span?.spanContext(),
        parent?.getCorrelation().spanId,
      );
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
      this.writeOutput(
        `${name}.end`,
        failureAttributes,
        config,
        span?.spanContext(),
        parent?.getCorrelation().spanId,
      );
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

  public recordSpanEvent(
    operation: TelemetryOperationContext,
    name: string,
    attributes?: TelemetryAttributes,
  ): void {
    try {
      const config = operation.getConfig();
      if (!config.telemetryEnabled) {
        return;
      }

      const sanitized = this.withCommonAttributes(
        sanitizeTelemetryAttributes(attributes),
      );
      operation.getSpan()?.addEvent(name, sanitized);
      const correlation = operation.getCorrelation();
      this.writeOutput(
        name,
        sanitized,
        config,
        correlation.traceId && correlation.spanId
          ? {
              traceId: correlation.traceId,
              spanId: correlation.spanId,
            }
          : undefined,
        correlation.parentSpanId,
      );
    } catch (error) {
      logger.debug('Failed to record telemetry span event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public withCommonAttributes(
    attributes: Record<string, TelemetryAttributeValue>,
  ): Record<string, TelemetryAttributeValue> {
    return {
      'extension.name': 'gomboc-vscode-extension',
      'extension.version': this.extensionVersion,
      'vscode.version': this.vscodeVersion,
      ...attributes,
    };
  }

  private createOperationContext(
    name: string,
    config: TelemetryRuntimeConfig,
    span: Span | undefined,
    parent?: TelemetryOperationContext,
  ): TelemetryOperationContext {
    return new TelemetryOperationContext({
      service: this,
      config,
      spanName: name,
      span,
      parentSpanId: parent?.getCorrelation().spanId,
      spanContext: span ? trace.setSpan(ROOT_CONTEXT, span) : ROOT_CONTEXT,
    });
  }

  private writeOutput(
    name: string,
    attributes: Record<string, TelemetryAttributeValue>,
    config: TelemetryRuntimeConfig,
    spanContext?: { traceId: string; spanId: string },
    parentSpanId?: string,
  ): void {
    if (!config.telemetryOutputChannelEnabled || !this.outputChannel) {
      return;
    }

    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      event: name,
      attributes,
    };
    if (spanContext) {
      payload.trace_id = spanContext.traceId;
      payload.span_id = spanContext.spanId;
    }
    if (parentSpanId) {
      payload.parent_span_id = parentSpanId;
    }

    this.outputChannel.appendLine(JSON.stringify(payload));
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
