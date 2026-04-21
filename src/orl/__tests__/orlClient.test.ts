import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  OrlClient,
  clearOrlRulesCache,
  createOrlClient,
  getOrlRulesCacheRoot,
} from '../orlClient';
import * as vscode from 'vscode';

jest.mock('../../utils/channelResolver', () => ({
  ChannelResolver: {
    resolveChannel: jest.fn().mockResolvedValue('resolved-channel'),
  },
}));

// Mock the logger to avoid setImmediate issues in test environment
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('OrlClient', () => {
  let orlClient: OrlClient;

  beforeEach(() => {
    orlClient = new OrlClient({
      containerImage: 'gomboc/orl:latest',
      rulesServiceUrl: 'https://rules.app.gomboc.ai',
      rulesServiceToken: 'test-token',
      channel: 'default',
    });
  });

  describe('parseOrlOutput', () => {
    it('should parse ORL dry-run output correctly', () => {
      const mockOutput = `---
main.tf
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  acl    = "private"
}
---
variables.tf
variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}`;

      const result = orlClient.parseOrlOutputForTests(mockOutput);

      expect(result).toEqual({
        '/workspace/main.tf':
          'resource "aws_s3_bucket" "example" {\n  bucket = "my-bucket"\n  acl    = "private"\n}',
        '/workspace/variables.tf':
          'variable "bucket_name" {\n  description = "Name of the S3 bucket"\n  type        = string\n}',
      });
    });

    it('should handle unchanged files', () => {
      const mockOutput = `---
main.tf is unchanged.
---
variables.tf
variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}`;

      const result = orlClient.parseOrlOutputForTests(mockOutput);

      expect(result).toEqual({
        '/workspace/variables.tf':
          'variable "bucket_name" {\n  description = "Name of the S3 bucket"\n  type        = string\n}',
      });
    });

    it('should handle empty output', () => {
      const result = orlClient.parseOrlOutputForTests('');
      expect(result).toEqual({});
    });
  });

  describe('custom rules only', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('reads custom rules settings in createOrlClient', async () => {
      const get = jest.fn((key: string) => {
        if (key === 'orlCustomRulesOnly') {
          return true;
        }
        if (key === 'orlCustomRulesPath') {
          return ' ${workspaceFolder}/my-rules ';
        }
        if (key === 'orlRulesServiceToken') {
          return 'rules-token';
        }
        if (key === 'apiKey') {
          return '';
        }
        return undefined;
      });
      const getConfigurationMock = jest.mocked(
        vscode.workspace.getConfiguration,
      );
      getConfigurationMock.mockReturnValue({
        get,
      } as unknown as vscode.WorkspaceConfiguration);

      const client = await createOrlClient({
        extensionPath: '/ext',
        storagePath: '/storage',
      });
      const config = (client as unknown as { config: Record<string, unknown> })
        .config;

      expect(config.customRulesOnly).toBe(true);
      expect(config.customRulesPath).toBe('${workspaceFolder}/my-rules');
    });

    it('throws when custom-rules-only is enabled and path is empty', async () => {
      const client = new OrlClient({
        containerImage: 'img',
        rulesServiceUrl: 'url',
        rulesServiceToken: 'token',
        channel: 'default',
        customRulesOnly: true,
        customRulesPath: '  ',
      });

      await expect(
        (
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          }
        ).resolveCustomRulesOnlyHostDir('/repo'),
      ).rejects.toThrow('no custom rules folder path is configured');
    });

    it('throws when ${workspaceFolder} is used without workspace folders', async () => {
      const client = new OrlClient({
        containerImage: 'img',
        rulesServiceUrl: 'url',
        rulesServiceToken: 'token',
        channel: 'default',
        customRulesOnly: true,
        customRulesPath: '${workspaceFolder}/rules',
      });
      (
        vscode.workspace as unknown as {
          workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
        }
      ).workspaceFolders = [];

      await expect(
        (
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          }
        ).resolveCustomRulesOnlyHostDir('/repo'),
      ).rejects.toThrow('requires a workspace folder');
    });

    it('throws when custom rules path is missing/not directory/no rules', async () => {
      const client = new OrlClient({
        containerImage: 'img',
        rulesServiceUrl: 'url',
        rulesServiceToken: 'token',
        channel: 'default',
        customRulesOnly: true,
        customRulesPath: '/rules',
      });

      const storageClient = (
        client as unknown as {
          storageClient: {
            stat: (path: string) => Promise<{ type: string }>;
          };
        }
      ).storageClient;
      const statSpy = jest.spyOn(storageClient, 'stat');
      const hasRulesSpy = jest
        .spyOn(
          client as unknown as {
            hasAnyRulesInDir: (dir: string) => Promise<boolean>;
          },
          'hasAnyRulesInDir',
        )
        .mockResolvedValue(true);

      statSpy.mockRejectedValueOnce(new Error('missing'));
      await expect(
        (
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          }
        ).resolveCustomRulesOnlyHostDir('/repo'),
      ).rejects.toThrow('No custom rules folder found');

      statSpy.mockResolvedValueOnce({ type: 'file' });
      await expect(
        (
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          }
        ).resolveCustomRulesOnlyHostDir('/repo'),
      ).rejects.toThrow('is not a directory');

      statSpy.mockResolvedValueOnce({ type: 'directory' });
      hasRulesSpy.mockResolvedValueOnce(false);
      await expect(
        (
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          }
        ).resolveCustomRulesOnlyHostDir('/repo'),
      ).rejects.toThrow('No ORL rules were found');
    });

    it('uses custom rules subset and returns explicit error when rule is missing', async () => {
      const client = new OrlClient({
        containerImage: 'img',
        rulesServiceUrl: 'url',
        rulesServiceToken: 'token',
        channel: 'default',
        customRulesOnly: true,
        customRulesPath: '/rules',
      });

      const storageClient = (
        client as unknown as {
          storageClient: {
            mkdtemp: (args: { prefix: string }) => Promise<string>;
            mkdir: (args: {
              path: string;
              opts?: { recursive?: boolean };
            }) => Promise<void>;
          };
        }
      ).storageClient;
      jest
        .spyOn(storageClient, 'mkdtemp')
        .mockResolvedValue('/tmp/orl-single-rule-test');
      jest.spyOn(storageClient, 'mkdir').mockResolvedValue(undefined);
      jest
        .spyOn(
          client as unknown as {
            copySingleWorkspaceFile: (args: unknown) => Promise<void>;
          },
          'copySingleWorkspaceFile',
        )
        .mockResolvedValue(undefined);
      jest
        .spyOn(
          client as unknown as {
            writeHooksToTempWorkspace: (workspacePath: string) => Promise<void>;
          },
          'writeHooksToTempWorkspace',
        )
        .mockResolvedValue(undefined);
      jest
        .spyOn(
          client as unknown as {
            resolveCustomRulesOnlyHostDir: (
              workspacePath: string,
            ) => Promise<string>;
          },
          'resolveCustomRulesOnlyHostDir',
        )
        .mockResolvedValue('/my-custom-rules');
      const copySubsetSpy = jest
        .spyOn(
          client as unknown as {
            copyRulesSubsetFromCache: (args: {
              sourceRulesDir: string;
              destRulesDir: string;
              ruleNames: string[];
            }) => Promise<{
              copiedFiles: number;
              copiedRuleNames: string[];
              missingRules: string[];
            }>;
          },
          'copyRulesSubsetFromCache',
        )
        .mockResolvedValue({
          copiedFiles: 0,
          copiedRuleNames: [],
          missingRules: ['rule_a'],
        });
      const pullSpy = jest
        .spyOn(
          client as unknown as {
            pullRulesUsingOrl: (
              rulesDir: string,
              opts?: unknown,
            ) => Promise<void>;
          },
          'pullRulesUsingOrl',
        )
        .mockResolvedValue(undefined);

      const result = await client.remediateSingleRule({
        workspacePath: '/repo',
        language: 'terraform',
        ruleName: 'rule_a',
        targetFilePath: '/repo/main.tf',
      });

      expect(copySubsetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceRulesDir: '/my-custom-rules',
          ruleNames: ['rule_a'],
        }),
      );
      expect(pullSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain('was not found in custom rules folder');
    });
  });
});

describe('clearOrlRulesCache', () => {
  it('removes orl-rules-cache under the given storage path', async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gomboc-orl-cache-test-'),
    );
    const nested = path.join(getOrlRulesCacheRoot(base), 'rules-aaaaaaaaaaaa');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'rule.orl'), 'x', 'utf8');

    await clearOrlRulesCache(base);

    await expect(fs.stat(getOrlRulesCacheRoot(base))).rejects.toThrow();
  });

  it('does not throw when the cache is already missing', async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gomboc-orl-cache-test-'),
    );
    await expect(clearOrlRulesCache(base)).resolves.toBeUndefined();
    await expect(clearOrlRulesCache(base)).resolves.toBeUndefined();
  });

  it('uses the same cache root as OrlClient getRulesCacheDir', () => {
    const storagePath = '/fake/global-storage';
    const client = new OrlClient({
      containerImage: 'gomboc/orl:latest',
      rulesServiceUrl: 'https://rules.example',
      rulesServiceToken: 't',
      channel: 'ch',
      storagePath,
    });
    const rulesDir = (
      client as unknown as { getRulesCacheDir: () => string }
    ).getRulesCacheDir();
    expect(rulesDir.startsWith(`${getOrlRulesCacheRoot(storagePath)}${path.sep}`));
  });
});
