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

const RULE_NAME = 'gomboc-ai/java/log4shell_upgrade_log4j_gradle_groovy';
const IAC_FILE = path.join(CODE_DIR, 'groovy/build.gradle');
const WORKSPACE_FILE_KEY = '/workspace/build.gradle';

describe('Groovy integration — log4j upgrade rule', () => {
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
      language: 'groovy',
      ruleName: RULE_NAME,
    });
    if (!result.success) {
      throw new Error(
        `ORL remediation failed for ${RULE_NAME}. exit=${result.exitCode ?? 'unknown'} error=${result.error ?? 'unknown'}`,
      );
    }
    return result;
  };

  it('Tier 1: upgrades log4j version in build.gradle', async () => {
    const result = await runSingleRuleFix();
    const modified = result.modifiedFiles[WORKSPACE_FILE_KEY];
    expect(modified).toContain('org.apache.logging.log4j:log4j-core:2.17.1');
  });

  it('Tier 2: report contains type and rule name', async () => {
    const result = await runSingleRuleFix();
    expect(result.report).toContain('type: Report');
    expect(result.report).toContain(RULE_NAME);
  });

  it('Tier 3: converter emits diagnostic payload for Groovy file', async () => {
    const result = await runSingleRuleFix();
    const scanResponse = await OrlResultConverter.convertToScanResponse(
      result,
      'groovy',
      path.join(tempDir, 'build.gradle'),
    );
    expect(scanResponse.individualFixes.length).toBeGreaterThan(0);
    expect(
      scanResponse.individualFixes[0].codeObservation.codeResourceInstance
        .filepath,
    ).toContain('build.gradle');
  });
});
