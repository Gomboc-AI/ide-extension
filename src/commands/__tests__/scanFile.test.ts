import * as vscode from 'vscode';
import {
  OrlScanSerializer,
  pickRepresentativeFileInDirectory,
  scanFileCommand,
} from '../scanFile';

jest.mock('@gomboc-ai/gomboc-node-sdk', () => ({
  detectLanguageId: jest.fn(),
  mapLanguageIdToOrlLanguage: jest.fn(),
}));

jest.mock('../../utils/integrationsService', () => ({
  vsCodeIntegrationsService: {
    sendError: jest.fn().mockResolvedValue(undefined),
    sendOrlReport: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from '@gomboc-ai/gomboc-node-sdk';
import { ScanValidator } from '../../utils/scanValidator';
import logger from '../../utils/logger';

describe('scanFile helpers', () => {
  beforeEach(() => {
    (
      globalThis as unknown as {
        setImmediate?: (callback: () => void) => ReturnType<typeof setTimeout>;
      }
    ).setImmediate =
      (
        globalThis as unknown as {
          setImmediate?: (
            callback: () => void,
          ) => ReturnType<typeof setTimeout>;
        }
      ).setImmediate ?? ((callback: () => void) => setTimeout(callback, 0));
  });

  afterEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: undefined,
    });
  });

  it('OrlScanSerializer runs one queued rerun', async () => {
    const serializer = new OrlScanSerializer();
    const order: string[] = [];
    let firstPass = true;

    let releaseFirst: (() => void) | undefined;
    const first = serializer.run({
      task: async () => {
        order.push('first-start');
        if (firstPass) {
          firstPass = false;
          await new Promise<void>(resolve => {
            releaseFirst = resolve;
          });
        }
        order.push('first-end');
      },
    });

    await serializer.run({
      task: async () => {
        order.push('second-call');
      },
    });

    releaseFirst?.();
    await first;

    expect(order).toEqual([
      'first-start',
      'first-end',
      'first-start',
      'first-end',
    ]);
    expect(order).not.toContain('second-call');
  });

  it('releases lock after task error so next run executes', async () => {
    const serializer = new OrlScanSerializer();
    await expect(
      serializer.run({
        task: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const called = jest.fn();
    await serializer.run({
      task: async () => {
        called();
      },
    });
    expect(called).toHaveBeenCalledTimes(1);
  });

  it('executes sequential runs without queueing when not overlapping', async () => {
    const serializer = new OrlScanSerializer();
    const calls: string[] = [];
    await serializer.run({
      task: async () => {
        calls.push('one');
      },
    });
    await serializer.run({
      task: async () => {
        calls.push('two');
      },
    });
    expect(calls).toEqual(['one', 'two']);
  });

  it('pickRepresentativeFileInDirectory returns matching language file', async () => {
    (
      vscode.workspace as unknown as {
        fs: { readDirectory: jest.Mock; readFile: jest.Mock };
      }
    ).fs = {
      readDirectory: jest.fn(),
      readFile: jest.fn(),
    };
    (
      vscode.workspace.fs.readDirectory as unknown as jest.Mock
    ).mockResolvedValue([
      ['main.tf', 1],
      ['notes.txt', 1],
    ]);
    (vscode.workspace.fs.readFile as unknown as jest.Mock).mockResolvedValue(
      Buffer.from('resource "x" "y" {}', 'utf8'),
    );
    (detectLanguageId as jest.Mock).mockReturnValue('terraform');
    (mapLanguageIdToOrlLanguage as jest.Mock).mockReturnValue('terraform');

    const file = await pickRepresentativeFileInDirectory({
      workspacePath: '/repo',
      language: 'terraform',
    });

    expect(file).toBe('/repo/main.tf');
  });

  it('falls back to first file when no matching language file exists', async () => {
    (
      vscode.workspace.fs.readDirectory as unknown as jest.Mock
    ).mockResolvedValue([['notes.txt', 1]]);
    (vscode.workspace.fs.readFile as unknown as jest.Mock).mockResolvedValue(
      Buffer.from('hello', 'utf8'),
    );
    (detectLanguageId as jest.Mock).mockReturnValue('plaintext');
    (mapLanguageIdToOrlLanguage as jest.Mock).mockReturnValue('text');

    const file = await pickRepresentativeFileInDirectory({
      workspacePath: '/repo',
      language: 'terraform',
    });
    expect(file).toBe('/repo/notes.txt');
  });

  it('returns undefined for empty directory', async () => {
    (
      vscode.workspace.fs.readDirectory as unknown as jest.Mock
    ).mockResolvedValue([]);
    const file = await pickRepresentativeFileInDirectory({
      workspacePath: '/repo',
      language: 'terraform',
    });
    expect(file).toBeUndefined();
  });

  it('records validation failures through the scan telemetry context', async () => {
    jest
      .spyOn(ScanValidator, 'validateAndPrepareScan')
      .mockImplementationOnce(() => {
        throw new Error('unsupported file');
      });
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn(),
    });
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      get: () => ({
        document: {
          uri: vscode.Uri.file('/repo/unsupported.txt'),
          getText: () => 'not supported',
        },
      }),
    });
    const scanTelemetry = {
      recordEvent: jest.fn(),
      setAttributes: jest.fn(),
    };
    const commandTelemetry = {
      withChildSpan: jest.fn(
        async (
          _name: string,
          _attributes: unknown,
          fn: (telemetry: typeof scanTelemetry) => Promise<void>,
        ) => fn(scanTelemetry),
      ),
    };
    jest.spyOn(logger, 'error').mockReturnValue(logger);

    await scanFileCommand(
      {
        extensionPath: '/extension',
        globalStorageUri: vscode.Uri.file('/storage'),
      } as vscode.ExtensionContext,
      { getLastOrlScanContext: jest.fn() } as never,
      commandTelemetry as never,
    );

    expect(commandTelemetry.withChildSpan).toHaveBeenCalledWith(
      'orl.scan',
      undefined,
      expect.any(Function),
    );
    expect(scanTelemetry.recordEvent).toHaveBeenCalledWith(
      'orl.scan.validation_failed',
      expect.objectContaining({
        'scan.error_context': 'Scan validation',
        'error.code': 'validation_failed',
      }),
    );
    expect(scanTelemetry.setAttributes).toHaveBeenCalledWith({
      'scan.outcome': 'validation_failed',
    });
  });
});
