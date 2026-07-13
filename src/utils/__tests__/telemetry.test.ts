import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { trace } from '@opentelemetry/api';

type MockSpan = {
  name: string;
  options: unknown;
  parentSpanId: string | undefined;
  end: jest.Mock;
  setAttributes: jest.Mock;
  setStatus: jest.Mock;
  addEvent: jest.Mock;
  spanContext: jest.Mock;
};

let mockSpanSeq = 0;
const mockSpans: MockSpan[] = [];
const mockTracer = {
  startSpan: jest.fn((name: string, options: unknown, parentContext) => {
    const parentSpan = parentContext ? trace.getSpan(parentContext) : undefined;
    const spanId = `span${++mockSpanSeq}`.padEnd(16, '0').slice(0, 16);
    const span: MockSpan = {
      name,
      options,
      parentSpanId: parentSpan?.spanContext().spanId,
      end: jest.fn(),
      setAttributes: jest.fn(),
      setStatus: jest.fn(),
      addEvent: jest.fn(),
      spanContext: jest.fn(() => ({
        traceId: 'trace000000000000000000000000000',
        spanId,
        traceFlags: 1,
      })),
    };
    mockSpans.push(span);
    return span;
  }),
};
const mockProviderShutdown = jest.fn().mockResolvedValue(undefined);

jest.mock('@opentelemetry/sdk-trace-node', () => ({
  BatchSpanProcessor: jest.fn(),
  NodeTracerProvider: jest.fn().mockImplementation(() => ({
    getTracer: jest.fn(() => mockTracer),
    shutdown: mockProviderShutdown,
  })),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn(),
}));

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';
import {
  TelemetryService,
  getTelemetryConfig,
  sanitizeTelemetryAttributes,
} from '../telemetry';

const configValues: Record<string, unknown> = {};

function setConfig(values: Record<string, unknown>): void {
  for (const key of Object.keys(configValues)) {
    delete configValues[key];
  }
  Object.assign(configValues, values);
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((key: string) => configValues[key]),
  });
}

function makeOutputChannel() {
  return {
    appendLine: jest.fn(),
    dispose: jest.fn(),
  };
}

const commonTelemetryProperties = [
  'extension.name',
  'extension.version',
  'vscode.version',
];

const expectedTelemetryProperties: Record<string, string[]> = {
  'extension.activate': commonTelemetryProperties,
  'extension.deactivate': commonTelemetryProperties,
  'telemetry.configured': [
    ...commonTelemetryProperties,
    'telemetry.extension.enabled',
    'telemetry.vscode.enabled',
    'telemetry.export.enabled',
    'telemetry.export.collector_count',
    'telemetry.output.enabled',
  ],
  'command.execute': [
    ...commonTelemetryProperties,
    'command.id',
    'telemetry.duration_ms',
    'telemetry.outcome',
    'error.type',
    'error.code',
  ],
  'command.scan_file': [
    ...commonTelemetryProperties,
    'command.id',
    'telemetry.duration_ms',
    'telemetry.outcome',
    'error.type',
    'error.code',
  ],
  'orl.scan': [
    ...commonTelemetryProperties,
    'scan.language',
    'scan.file_type',
    'scan.scope',
    'scan.outcome',
    'scan.exit_code',
    'scan.individual_fixes_count',
    'scan.grouped_fixes_count',
    'scan.modified_files_count',
    'telemetry.duration_ms',
    'telemetry.outcome',
    'error.type',
    'error.code',
  ],
  'orl.scan.started': [
    ...commonTelemetryProperties,
    'scan.language',
    'scan.file_type',
    'scan.scope',
  ],
  'orl.remediate.completed': [
    ...commonTelemetryProperties,
    'scan.language',
    'scan.success',
    'scan.exit_code',
    'scan.modified_files_count',
  ],
  'orl.scan.validation_failed': [
    ...commonTelemetryProperties,
    'scan.error_context',
    'scan.language',
    'error.code',
  ],
  'orl.scan.skipped': [
    ...commonTelemetryProperties,
    'scan.skip_reason',
    'scan.language',
    'scan.file_type',
  ],
  'orl.scan.failed': [
    ...commonTelemetryProperties,
    'scan.error_context',
    'scan.language',
    'scan.exit_code',
    'error.code',
  ],
  'orl.scan.conversion_failed': [
    ...commonTelemetryProperties,
    'scan.error_context',
    'scan.language',
    'scan.file_type',
    'error.code',
  ],
  'orl.scan.converted': [
    ...commonTelemetryProperties,
    'scan.language',
    'scan.file_type',
    'scan.individual_fixes_count',
    'scan.grouped_fixes_count',
    'scan.modified_files_count',
  ],
  'orl.scan.diagnostics_created': [
    ...commonTelemetryProperties,
    'scan.language',
    'scan.individual_fixes_count',
    'scan.grouped_fixes_count',
  ],
  'orl.report_submission.scheduled': [
    ...commonTelemetryProperties,
    'scan.language',
  ],
  'orl_fix_applied.queued': [
    ...commonTelemetryProperties,
    'fix.kind',
    'fix.rule_count',
    'fix.file_count',
    'queue.size',
  ],
  'orl_fix_applied.flush_completed': [
    ...commonTelemetryProperties,
    'queue.before_count',
    'queue.after_count',
    'queue.sent_count',
    'queue.dropped_count',
  ],
};

function sorted(values: string[]): string[] {
  return [...values].sort();
}

describe('telemetry service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpans.length = 0;
    mockSpanSeq = 0;
    mockProviderShutdown.mockResolvedValue(undefined);
    (
      vscode.env as unknown as { isTelemetryEnabled: boolean }
    ).isTelemetryEnabled = true;
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      makeOutputChannel(),
    );
    setConfig({});
  });

  it('reads defaults and filters non-string telemetry headers', () => {
    setConfig({
      telemetryHeaders: {
        Authorization: 'Bearer abc',
        'x-number': 1,
        '': 'ignored',
      },
    });

    const config = getTelemetryConfig();

    expect(config.telemetryEnabled).toBe(true);
    expect(config.integrationsServiceUrl).toBe('http://localhost:3010');
    expect(config.apiKey).toBeUndefined();
    expect(config.telemetryOtlpTracesEndpoint).toBe(
      'http://localhost:3010/telemetry/v1/traces',
    );
    expect(config.telemetryOtlpTracesEndpoints).toEqual([
      'http://localhost:3010/telemetry/v1/traces',
    ]);
    expect(config.telemetryOutputChannelEnabled).toBe(true);
    expect(config.telemetryHeaders).toEqual({ Authorization: 'Bearer abc' });
  });

  it('prefers configured multiple endpoints over the legacy single endpoint', () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://legacy.example/v1/traces',
      telemetryOtlpTracesEndpoints: [
        'http://collector-a.example/v1/traces',
        ' ',
        'http://collector-b.example/v1/traces',
        'http://collector-a.example/v1/traces',
      ],
    });

    const config = getTelemetryConfig();

    expect(config.telemetryOtlpTracesEndpoint).toBe(
      'http://legacy.example/v1/traces',
    );
    expect(config.telemetryOtlpTracesEndpoints).toEqual([
      'http://collector-a.example/v1/traces',
      'http://collector-b.example/v1/traces',
    ]);
  });

  it('does not create an exporter when VS Code telemetry is disabled', async () => {
    (
      vscode.env as unknown as { isTelemetryEnabled: boolean }
    ).isTelemetryEnabled = false;
    setConfig({ apiKey: 'frontegg-token' });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(NodeTracerProvider).not.toHaveBeenCalled();
    expect(OTLPTraceExporter).not.toHaveBeenCalled();
  });

  it('does not create an exporter for the default integrations endpoint without an API key', async () => {
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(NodeTracerProvider).not.toHaveBeenCalled();
    expect(OTLPTraceExporter).not.toHaveBeenCalled();
  });

  it('exports to the default integrations telemetry endpoint with Gomboc auth headers', async () => {
    setConfig({
      apiKey: 'frontegg-token',
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://localhost:3010/telemetry/v1/traces',
      headers: {
        Authorization: 'Bearer frontegg-token',
        'x-gomboc-telemetry-source': 'IDE_EXTENSION',
        'x-gomboc-client-id': 'gomboc-vscode-extension',
        'x-gomboc-client-version': '1.2.3',
        'x-gomboc-session-id': expect.any(String),
      },
    });
    expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
  });

  it('uses integrationsServiceUrl to derive the default telemetry endpoint', async () => {
    setConfig({
      apiKey: 'frontegg-token',
      integrationsServiceUrl: 'http://localhost:3010/',
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:3010/telemetry/v1/traces',
      }),
    );
  });

  it('creates an OTLP exporter when extension and VS Code telemetry are enabled', async () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: { Authorization: 'Bearer secret' },
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://collector.example/v1/traces',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
  });

  it('does not send the Gomboc API key to custom collector endpoints', async () => {
    setConfig({
      apiKey: 'frontegg-token',
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: { Authorization: 'Bearer collector-token' },
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://collector.example/v1/traces',
      headers: { Authorization: 'Bearer collector-token' },
    });
  });

  it('creates one OTLP exporter per configured collector endpoint', async () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://legacy.example/v1/traces',
      telemetryOtlpTracesEndpoints: [
        'http://collector-a.example/v1/traces',
        'http://collector-b.example/v1/traces',
      ],
      telemetryHeaders: { Authorization: 'Bearer secret' },
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(1, {
      url: 'http://collector-a.example/v1/traces',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(2, {
      url: 'http://collector-b.example/v1/traces',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(BatchSpanProcessor).toHaveBeenCalledTimes(2);
    expect(
      (NodeTracerProvider as unknown as jest.Mock).mock.calls[0][0]
        .spanProcessors,
    ).toHaveLength(2);
  });

  it('uses per-endpoint headers for integrations and custom telemetry endpoints', async () => {
    setConfig({
      apiKey: 'frontegg-token',
      integrationsServiceUrl: 'https://integrations.app.gomboc.ai',
      telemetryOtlpTracesEndpoints: [
        'https://integrations.app.gomboc.ai/telemetry/v1/traces',
        'http://collector.example/v1/traces',
      ],
      telemetryHeaders: {
        Authorization: 'Bearer collector-token',
        'x-custom-header': 'custom',
      },
    });
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(OTLPTraceExporter).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(1, {
      url: 'https://integrations.app.gomboc.ai/telemetry/v1/traces',
      headers: {
        Authorization: 'Bearer frontegg-token',
        'x-custom-header': 'custom',
        'x-gomboc-telemetry-source': 'IDE_EXTENSION',
        'x-gomboc-client-id': 'gomboc-vscode-extension',
        'x-gomboc-client-version': '1.2.3',
        'x-gomboc-session-id': expect.any(String),
      },
    });
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(2, {
      url: 'http://collector.example/v1/traces',
      headers: {
        Authorization: 'Bearer collector-token',
        'x-custom-header': 'custom',
      },
    });
  });

  it('rebuilds the exporter when telemetry header values change', async () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: { Authorization: 'Bearer old' },
    });
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: { Authorization: 'Bearer new' },
    });
    service.configure();

    expect(mockProviderShutdown).toHaveBeenCalledTimes(1);
    expect(NodeTracerProvider).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(2, {
      url: 'http://collector.example/v1/traces',
      headers: { Authorization: 'Bearer new' },
    });
    await service.shutdown();
  });

  it('rebuilds the exporter when telemetry headers are removed', async () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: { Authorization: 'Bearer old' },
    });
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
      telemetryHeaders: {},
    });
    service.configure();

    expect(mockProviderShutdown).toHaveBeenCalledTimes(1);
    expect(NodeTracerProvider).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenCalledTimes(2);
    expect(OTLPTraceExporter).toHaveBeenNthCalledWith(2, {
      url: 'http://collector.example/v1/traces',
      headers: {},
    });
    await service.shutdown();
  });

  it('mirrors sanitized telemetry events to the output channel', async () => {
    (
      vscode.env as unknown as { isTelemetryEnabled: boolean }
    ).isTelemetryEnabled = false;
    const outputChannel = makeOutputChannel();
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      outputChannel,
    );
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    service.recordEvent('test.event', {
      workspacePath: '/Users/gary/project/main.tf',
      message: 'Bearer super-secret-token',
      count: 2,
      ignored: { nested: true },
    });
    await service.shutdown();

    const line = outputChannel.appendLine.mock.calls.find(([value]) =>
      String(value).includes('test.event'),
    )?.[0] as string;
    const payload = JSON.parse(line);
    expect(payload.attributes.workspacePath).toBe('main.tf');
    expect(payload.attributes.message).toBe('Bearer [redacted]');
    expect(payload.attributes.count).toBe(2);
    expect(payload.attributes.ignored).toBeUndefined();
    expect(line).not.toContain('/Users/gary');
    expect(line).not.toContain('super-secret-token');
  });

  it('is a no-op when extension telemetry is disabled', async () => {
    setConfig({ telemetryEnabled: false });
    const outputChannel = makeOutputChannel();
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      outputChannel,
    );
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    service.recordEvent('test.event', { count: 1 });
    await service.shutdown();

    expect(outputChannel.appendLine).not.toHaveBeenCalled();
    expect(NodeTracerProvider).not.toHaveBeenCalled();
  });

  it('does not throw when output mirroring fails', async () => {
    (
      vscode.env as unknown as { isTelemetryEnabled: boolean }
    ).isTelemetryEnabled = false;
    const outputChannel = makeOutputChannel();
    outputChannel.appendLine.mockImplementation(() => {
      throw new Error('output failed');
    });
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      outputChannel,
    );
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    expect(() => service.recordEvent('test.event', { count: 1 })).not.toThrow();
    await service.shutdown();
  });

  it('does not export raw exception messages from spans', async () => {
    (
      vscode.env as unknown as { isTelemetryEnabled: boolean }
    ).isTelemetryEnabled = false;
    const outputChannel = makeOutputChannel();
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      outputChannel,
    );
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });

    await expect(
      service.withSpan('test.span', undefined, async () => {
        throw new Error(
          'Failed for /Users/gary/private/repo/main.tf with token abc123',
        );
      }),
    ).rejects.toThrow('Failed for');
    await service.shutdown();

    const line = outputChannel.appendLine.mock.calls.find(([value]) =>
      String(value).includes('test.span.end'),
    )?.[0] as string;
    const payload = JSON.parse(line);
    expect(payload.attributes['error.type']).toBe('Error');
    expect(payload.attributes['error.code']).toBe('operation_failed');
    expect(payload.attributes['error.message']).toBeUndefined();
    expect(line).not.toContain('/Users/gary');
    expect(line).not.toContain('abc123');
    expect(line).not.toContain('main.tf');
  });

  it('correlates scan-file and ORL spans under the command root trace', async () => {
    setConfig({
      telemetryOtlpTracesEndpoint: 'http://collector.example/v1/traces',
    });
    const outputChannel = makeOutputChannel();
    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(
      outputChannel,
    );
    const service = new TelemetryService();
    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    mockTracer.startSpan.mockClear();
    mockSpans.length = 0;

    await service.withSpan(
      'command.execute',
      { 'command.id': 'gomboc-vscode-extension.scanFile' },
      async commandTelemetry => {
        await commandTelemetry.withChildSpan(
          'command.scan_file',
          { 'command.id': 'gomboc-vscode-extension.scanFile' },
          async scanFileTelemetry => {
            await scanFileTelemetry.withChildSpan(
              'orl.scan',
              { 'scan.language': 'terraform' },
              async scanTelemetry => {
                scanTelemetry.recordEvent('orl.scan.started', {
                  'scan.language': 'terraform',
                });
              },
            );
          },
        );
      },
    );
    await service.shutdown();

    expect(mockTracer.startSpan).toHaveBeenCalledTimes(3);
    expect(mockSpans.map(span => span.name)).toEqual([
      'command.execute',
      'command.scan_file',
      'orl.scan',
    ]);
    expect(mockSpans[1].parentSpanId).toBe(mockSpans[0].spanContext().spanId);
    expect(mockSpans[2].parentSpanId).toBe(mockSpans[1].spanContext().spanId);
    expect(mockSpans[2].spanContext().traceId).toBe(
      mockSpans[0].spanContext().traceId,
    );
    expect(mockSpans[2].addEvent).toHaveBeenCalledWith(
      'orl.scan.started',
      expect.objectContaining({
        'extension.name': 'gomboc-vscode-extension',
        'scan.language': 'terraform',
      }),
    );

    const eventLine = outputChannel.appendLine.mock.calls.find(([value]) =>
      String(value).includes('orl.scan.started'),
    )?.[0] as string;
    const payload = JSON.parse(eventLine);
    expect(payload.trace_id).toBe(mockSpans[2].spanContext().traceId);
    expect(payload.span_id).toBe(mockSpans[2].spanContext().spanId);
    expect(payload.parent_span_id).toBe(mockSpans[1].spanContext().spanId);
  });

  it('sanitizes path-like and sensitive primitive attributes', () => {
    expect(
      sanitizeTelemetryAttributes({
        filePath: '/home/user/repo/app.yaml',
        errorMessage: 'api_key=abc123 failed in /tmp/private/file.txt',
        ok: true,
        n: 3,
      }),
    ).toEqual({
      filePath: 'app.yaml',
      errorMessage: 'apiKey=[redacted] failed in [path]',
      ok: true,
      n: 3,
    });
  });

  it('keeps telemetry.json aligned with emitted telemetry attributes', () => {
    const telemetryJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'telemetry.json'), 'utf8'),
    ) as { events: { name: string; properties: string[] }[] };

    const actualByEvent = Object.fromEntries(
      telemetryJson.events.map(event => [event.name, sorted(event.properties)]),
    );
    const expectedByEvent = Object.fromEntries(
      Object.entries(expectedTelemetryProperties).map(([name, properties]) => [
        name,
        sorted(properties),
      ]),
    );

    expect(actualByEvent).toEqual(expectedByEvent);
  });
});
