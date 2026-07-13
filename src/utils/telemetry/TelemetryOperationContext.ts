import type { Context, Span } from '@opentelemetry/api';
import type { TelemetryService } from './TelemetryService';
import type {
  TelemetryAttributes,
  TelemetryOutputCorrelation,
  TelemetryRuntimeConfig,
} from './types';
import { sanitizeTelemetryAttributes } from './utils';

/**
 * Explicit scoped telemetry context for one operation span.
 *
 * This avoids relying on a global OpenTelemetry context manager in the shared VS Code
 * extension host and makes parent/child relationships visible at call sites.
 */
export class TelemetryOperationContext {
  public readonly spanName: string;
  private readonly service: TelemetryService;
  private readonly config: TelemetryRuntimeConfig;
  private readonly span: Span | undefined;
  private readonly parentSpanId: string | undefined;
  private readonly spanContext: Context;

  constructor(args: {
    service: TelemetryService;
    config: TelemetryRuntimeConfig;
    spanName: string;
    span?: Span;
    parentSpanId?: string;
    spanContext: Context;
  }) {
    this.service = args.service;
    this.config = args.config;
    this.spanName = args.spanName;
    this.span = args.span;
    this.parentSpanId = args.parentSpanId;
    this.spanContext = args.spanContext;
  }

  /**
   * Records a lifecycle point as a span event and mirrors it locally.
   */
  public recordEvent(name: string, attributes?: TelemetryAttributes): void {
    this.service.recordSpanEvent(this, name, attributes);
  }

  /**
   * Applies sanitized attributes to the current span.
   */
  public setAttributes(attributes: TelemetryAttributes): void {
    const sanitized = this.service.withCommonAttributes(
      sanitizeTelemetryAttributes(attributes),
    );
    this.span?.setAttributes(sanitized);
  }

  /**
   * Runs a child operation with this context as its explicit parent.
   */
  public async withChildSpan<T>(
    name: string,
    attributes: TelemetryAttributes | undefined,
    fn: (operation: TelemetryOperationContext) => Promise<T>,
  ): Promise<T> {
    return this.service.withSpan(name, attributes, fn, this);
  }

  public getSpan(): Span | undefined {
    return this.span;
  }

  public getConfig(): TelemetryRuntimeConfig {
    return this.config;
  }

  public getContext(): Context {
    return this.spanContext;
  }

  public getCorrelation(): TelemetryOutputCorrelation {
    const currentSpanContext = this.span?.spanContext();
    return {
      traceId: currentSpanContext?.traceId,
      spanId: currentSpanContext?.spanId,
      parentSpanId: this.parentSpanId,
    };
  }
}
