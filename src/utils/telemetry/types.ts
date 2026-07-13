import type { Tracer } from '@opentelemetry/api';
import type { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

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

export type TelemetryServiceOptions = {
  extensionVersion: string;
  vscodeVersion: string;
};

export type ActiveProvider = {
  provider: NodeTracerProvider;
  tracer: Tracer;
  cacheKey: string;
};

export type TraceExporterConfig = {
  url: string;
  headers: Record<string, string>;
};

export type TraceEndpointDebugInfo = {
  url: string;
  isIntegrationsEndpoint: boolean;
  configuredHeaderKeys: string[];
  effectiveHeaderKeys: string[];
  hasApiKey: boolean;
  skippedReason?: string;
};

export type TelemetryOutputCorrelation = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};
