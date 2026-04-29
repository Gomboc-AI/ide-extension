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

const RULE_NAME = 'gomboc-ai/ensure-that-the--audit-log-path-argument-is-set';
const IAC_FILE = path.join(
  CODE_DIR,
  'kubernetes/kube-apiserver-missing-audit-log.yaml',
);
const WORKSPACE_FILE_KEY = '/workspace/kube-apiserver-missing-audit-log.yaml';

describe('Kubernetes integration — kube-apiserver audit-log-path rule', () => {
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
      language: 'kubernetes',
      ruleName: RULE_NAME,
    });
    if (!result.success) {
      throw new Error(
        `ORL remediation failed for ${RULE_NAME}. exit=${result.exitCode ?? 'unknown'} error=${result.error ?? 'unknown'}`,
      );
    }
    return result;
  };

  it('Tier 1: inserts --audit-log-path argument for kube-apiserver', async () => {
    const result = await runSingleRuleFix();
    const modified = result.modifiedFiles[WORKSPACE_FILE_KEY];
    expect(modified).toContain(
      '--audit-log-path=/var/log/kubernetes/apiserver/audit.log',
    );
  });

  it('Tier 2: report contains type and rule name', async () => {
    const result = await runSingleRuleFix();
    expect(result.report).toContain('type: Report');
    expect(result.report).toContain(RULE_NAME);
  });

  it('Tier 3: converter emits diagnostic payload for Kubernetes file', async () => {
    const result = await runSingleRuleFix();
    const scanResponse = await OrlResultConverter.convertToScanResponse(
      result,
      'yaml',
      path.join(tempDir, 'kube-apiserver-missing-audit-log.yaml'),
    );
    expect(scanResponse.individualFixes.length).toBeGreaterThan(0);
    expect(
      scanResponse.individualFixes[0].codeObservation.codeResourceInstance
        .filepath,
    ).toContain('kube-apiserver-missing-audit-log.yaml');
  });
});
