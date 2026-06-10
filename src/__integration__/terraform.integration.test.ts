import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { OrlResultConverter } from '../orl/orlResultConverter';
import {
  CODE_DIR,
  ensureDockerAvailable,
  makeClient,
  setupWorkspace,
  teardownWorkspace,
} from './helpers/testClient';

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const RULE_NAME =
  'gomboc-ai/ensure-dax-cluster-server-side-encryption-is-enabled';
const IAC_FILE = path.join(CODE_DIR, 'tf/dax-no-sse.tf');
const WORKSPACE_FILE_KEY = '/workspace/dax-no-sse.tf';

describe('Terraform integration — DAX SSE rule', () => {
  let tempDir = '';
  let storageDir = '';

  beforeAll(async () => {
    await ensureDockerAvailable();
    const workspaceWithFs = vscode.workspace as unknown as {
      fs: typeof vscode.workspace.fs;
    };
    workspaceWithFs.fs = {
      readFile: async (uri: vscode.Uri) => fs.readFile(uri.fsPath),
      readDirectory: async (uri: vscode.Uri) => {
        const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
        return entries.map(entry => [
          entry.name,
          entry.isDirectory()
            ? vscode.FileType.Directory
            : vscode.FileType.File,
        ]);
      },
    } as unknown as typeof vscode.workspace.fs;
  });

  beforeEach(async () => {
    tempDir = await setupWorkspace({ iacFixturePath: IAC_FILE });
    storageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gomboc-int-storage-'),
    );
  });

  afterEach(async () => {
    await teardownWorkspace({ tempDir });
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  const runSingleRuleFix = async () => {
    const client = await makeClient({ storagePath: storageDir });
    const result = await client.remediateSingleRule({
      workspacePath: tempDir,
      language: 'terraform',
      ruleName: RULE_NAME,
    });
    if (!result.success) {
      throw new Error(
        `ORL remediation failed for ${RULE_NAME}. exit=${result.exitCode ?? 'unknown'} error=${result.error ?? 'unknown'}`,
      );
    }
    return result;
  };

  it('Tier 1: inserts server_side_encryption.enabled=true block', async () => {
    const result = await runSingleRuleFix();

    expect(result.success).toBe(true);
    expect(result.exitCode).not.toBe(1);

    const modified = result.modifiedFiles[WORKSPACE_FILE_KEY];
    expect(modified).toBeDefined();
    expect(modified).toContain('server_side_encryption');
    expect(modified).toContain('enabled = true');
    expect(modified).toContain('resource "aws_dax_cluster"');
  });

  it('Tier 2: produces a parseable ORL report containing the rule name', async () => {
    const result = await runSingleRuleFix();

    expect(result.success).toBe(true);
    expect(result.report).toBeTruthy();
    expect(result.report).toContain('type: Report');
    expect(result.report).toContain(RULE_NAME);
  });

  it('Tier 3: converts to ScanResponse with correct diagnostic structure', async () => {
    const result = await runSingleRuleFix();
    expect(result.success).toBe(true);

    const scanResponse = await OrlResultConverter.convertToScanResponse(
      result,
      'tf',
      path.join(tempDir, 'dax-no-sse.tf'),
    );

    expect(scanResponse.individualFixes.length).toBeGreaterThan(0);
    const firstFix = scanResponse.individualFixes[0];
    const orlRuleNames = firstFix.rule.orlRuleNames ?? [];
    expect(
      orlRuleNames.some((ruleName: string) => ruleName.startsWith(RULE_NAME)),
    ).toBe(true);
    expect(firstFix.codeObservation.codeResourceInstance.filepath).toContain(
      'dax-no-sse.tf',
    );
    expect(firstFix.codeObservation.disposition).toBe('NonCompliant');
    expect(firstFix.codeObservation.codeResourceInstance.type).toBe(
      'terraform',
    );
    expect(firstFix.codeObservation.codeResourceInstance.line).toBeGreaterThan(
      0,
    );
    expect(firstFix.rule.id).toContain('orl-rule:');
    expect(firstFix.rule.name.toLowerCase()).toMatch(/dax|encryption/);
    expect(firstFix.fixes.length).toBeGreaterThan(0);
    expect(firstFix.fixes[0].filepath).toContain('dax-no-sse.tf');
    expect(firstFix.fixes[0].newLine.join('\n')).toContain(
      'server_side_encryption',
    );

    expect(scanResponse.groupedFixes.length).toBeGreaterThan(0);
    const firstGrouped = scanResponse.groupedFixes[0];
    expect(firstGrouped.path).toContain('dax-no-sse.tf');
    expect(firstGrouped.comments.length).toBeGreaterThan(0);
    expect(firstGrouped.comments[0].position.line).toBeGreaterThan(0);
    expect(firstGrouped.comments[0].rule.id).toContain('orl-rule:');
  });
});
