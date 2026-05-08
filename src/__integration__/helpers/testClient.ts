import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { OrlClient } from '../../orl/orlClient';

const ORL_IMAGE = 'gombocai/orl:v1.3.6';
const RULES_SERVICE_URL = 'https://rules.app.gomboc.ai';
const REPO_ROOT = path.join(__dirname, '../../..');

// Integration tests use fixture-pinned rules so behavior stays stable as top-level rules evolve.
export const RULES_DIR = path.join(__dirname, '../fixtures/rules');
export const CODE_DIR = path.join(__dirname, '../fixtures/code');

export const setupWorkspace = async (args: {
  iacFixturePath: string;
}): Promise<string> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gomboc-int-'));
  const destination = path.join(tempDir, path.basename(args.iacFixturePath));
  await fs.copyFile(args.iacFixturePath, destination);
  return tempDir;
};

export const teardownWorkspace = async (args: {
  tempDir: string;
}): Promise<void> => {
  await fs.rm(args.tempDir, { recursive: true, force: true });
};

export const makeClient = async (args: {
  storagePath: string;
}): Promise<OrlClient> => {
  return new OrlClient({
    containerImage: ORL_IMAGE,
    rulesServiceUrl: RULES_SERVICE_URL,
    rulesServiceToken: '',
    channel: 'default',
    extensionPath: REPO_ROOT,
    storagePath: args.storagePath,
    customRulesOnly: true,
    customRulesPath: RULES_DIR,
  });
};

export const dockerAvailable = async (): Promise<boolean> => {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    await promisify(execFile)('docker', ['info']);
    return true;
  } catch {
    return false;
  }
};

export const ensureDockerAvailable = async (): Promise<void> => {
  const available = await dockerAvailable();
  if (!available) {
    throw new Error(
      'Docker is required for integration tests. Start Docker Desktop and rerun.',
    );
  }
};
