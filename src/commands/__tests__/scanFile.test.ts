import * as vscode from 'vscode';
import {
  OrlScanSerializer,
  pickRepresentativeFileInDirectory,
} from '../scanFile';

jest.mock('@gomboc-ai/gomboc-node-sdk', () => ({
  detectLanguageId: jest.fn(),
  mapLanguageIdToOrlLanguage: jest.fn(),
}));

import {
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from '@gomboc-ai/gomboc-node-sdk';

describe('scanFile helpers', () => {
  afterEach(() => {
    jest.clearAllMocks();
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
});
