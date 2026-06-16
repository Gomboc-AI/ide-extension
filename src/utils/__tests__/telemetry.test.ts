import * as vscode from 'vscode';

const mockSpan = {
  end: jest.fn(),
  setAttributes: jest.fn(),
  setStatus: jest.fn(),
};
const mockTracer = {
  startSpan: jest.fn(() => mockSpan),
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

describe('telemetry service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(config.telemetryOtlpTracesEndpoint).toBe(
      'https://telemetry.gomboc.ai/v1/traces',
    );
    expect(config.telemetryOtlpTracesEndpoints).toEqual([
      'https://telemetry.gomboc.ai/v1/traces',
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
    const service = new TelemetryService();

    service.initialize({ extensionVersion: '1.2.3', vscodeVersion: '1.99.0' });
    await service.shutdown();

    expect(NodeTracerProvider).not.toHaveBeenCalled();
    expect(OTLPTraceExporter).not.toHaveBeenCalled();
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
});
