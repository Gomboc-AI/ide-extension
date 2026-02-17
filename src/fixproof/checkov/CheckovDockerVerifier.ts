import { spawn } from 'child_process';

export type CheckovVerifyResult = {
  allPassed: boolean;
  failingCheckIds: string[];
  failedByCheckId: Record<string, number>;
  // Raw counts if we can infer them from output (best-effort).
  summary?: {
    failed?: number;
    passed?: number;
  };
  // For debugging if needed (kept small by truncation).
  stdoutPreview?: string;
  stderrPreview?: string;
  stdoutLength?: number;
  stderrLength?: number;
};

type SpawnResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

async function runProcess(args: {
  command: string;
  commandArgs: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}): Promise<SpawnResult> {
  const {
    command,
    commandArgs,
    cwd,
    timeoutMs,
    maxOutputBytes = 10 * 1024 * 1024,
  } = args;

  return await new Promise<SpawnResult>((resolve, reject) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutState = { len: 0, truncated: false, label: 'stdout' };
    const stderrState = { len: 0, truncated: false, label: 'stderr' };
    let timedOut = false;

    const child = spawn(command, commandArgs, {
      cwd,
      shell: false,
      windowsHide: true,
    });

    const pushChunk = (
      chunks: string[],
      chunk: Buffer | string,
      state: { len: number; truncated: boolean; label: string },
    ) => {
      if (state.truncated) {
        return;
      }
      const s = chunk.toString();
      if (!s) {
        return;
      }
      const remaining = maxOutputBytes - state.len;
      if (remaining <= 0) {
        state.truncated = true;
        chunks.push(
          `\n...[truncated ${state.label}: maxOutputBytes exceeded]...\n`,
        );
        return;
      }
      if (s.length <= remaining) {
        chunks.push(s);
        state.len += s.length;
        return;
      }
      chunks.push(s.slice(0, remaining));
      state.len += remaining;
      state.truncated = true;
      chunks.push(
        `\n...[truncated ${state.label}: maxOutputBytes exceeded]...\n`,
      );
    };

    child.stdout?.on('data', (d: Buffer) => {
      pushChunk(stdoutChunks, d, stdoutState);
    });
    child.stderr?.on('data', (d: Buffer) => {
      pushChunk(stderrChunks, d, stderrState);
    });

    let t: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      t = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, timeoutMs);
    }

    child.on('error', err => {
      if (t) {
        clearTimeout(t);
      }
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (t) {
        clearTimeout(t);
      }
      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');
      resolve({
        stdout: stdout,
        stderr: stderr,
        exitCode: code,
        signal: signal as NodeJS.Signals | null,
        timedOut,
      });
    });
  });
}

const CKV_RE = /^(CKV|BC)_[A-Z0-9_]+$/;

function normalizeIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      (ids || [])
        .map(s => (s || '').trim().toUpperCase())
        .filter(Boolean)
        .filter(s => CKV_RE.test(s)),
    ),
  ).sort();
}

function extractFailedCheckIdCounts(parsed: any): {
  failedByCheckId: Record<string, number>;
  failingCheckIds: string[];
} {
  // Checkov JSON can be:
  // - an object with `results.failed_checks[]`
  // - an array of such objects (multiple frameworks)
  const roots: any[] = Array.isArray(parsed) ? parsed : [parsed];
  const failedByCheckId: Record<string, number> = {};
  for (const root of roots) {
    const failed = root?.results?.failed_checks;
    if (!Array.isArray(failed)) {
      continue;
    }
    for (const f of failed) {
      const raw = typeof f?.check_id === 'string' ? f.check_id : '';
      const id = (raw || '').trim().toUpperCase();
      if (!id || !CKV_RE.test(id)) {
        continue;
      }
      failedByCheckId[id] = (failedByCheckId[id] ?? 0) + 1;
    }
  }
  const failingCheckIds = Object.keys(failedByCheckId).sort();
  return { failedByCheckId, failingCheckIds };
}

function extractSummary(parsed: any): { failed?: number; passed?: number } {
  const roots: any[] = Array.isArray(parsed) ? parsed : [parsed];
  let failed: number | undefined;
  let passed: number | undefined;
  for (const root of roots) {
    const s = root?.summary;
    if (!s || typeof s !== 'object') {
      continue;
    }
    if (typeof s?.failed === 'number' && Number.isFinite(s.failed)) {
      failed = (failed ?? 0) + s.failed;
    }
    if (typeof s?.passed === 'number' && Number.isFinite(s.passed)) {
      passed = (passed ?? 0) + s.passed;
    }
  }
  return { failed, passed };
}

function truncateForDebug(s: string, max = 50_000): string {
  if (!s) {
    return s;
  }
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max) + '\n...[truncated for debug preview]...\n';
}

function parseJsonBestEffort(text: string): any {
  const raw = text || '';
  try {
    return JSON.parse(raw);
  } catch {
    // Sometimes tools print banners/warnings before JSON. Try to salvage by locating a JSON root.
    const firstObj = raw.indexOf('{');
    const firstArr = raw.indexOf('[');
    const start =
      firstObj === -1
        ? firstArr
        : firstArr === -1
          ? firstObj
          : Math.min(firstObj, firstArr);
    if (start === -1) {
      throw new Error('No JSON object/array found in output');
    }
    const candidate = raw.slice(start).trim();
    return JSON.parse(candidate);
  }
}

export class CheckovDockerVerifier {
  constructor(
    private readonly opts?: {
      image?: string;
      timeoutMs?: number;
      maxOutputBytes?: number;
      /**
       * Optional list of frameworks to scan (e.g. ["terraform"]).
       * When provided, passed as `--framework <csv>`.
       */
      frameworks?: string[];
      /**
       * Optional list of paths to skip (relative to /workspace). Passed as `--skip-path <csv>`.
       */
      skipPaths?: string[];
    },
  ) {}

  async verify(args: {
    workspacePath: string;
    checkIds: string[];
  }): Promise<CheckovVerifyResult> {
    const image = this.opts?.image || 'bridgecrew/checkov:latest';
    const timeoutMs = this.opts?.timeoutMs ?? 120_000;
    const maxOutputBytes = this.opts?.maxOutputBytes ?? 10 * 1024 * 1024;

    const checkIds = normalizeIds(args.checkIds);
    if (checkIds.length === 0) {
      return {
        allPassed: true,
        failingCheckIds: [],
        failedByCheckId: {},
        summary: { failed: 0, passed: 0 },
      };
    }

    // Note: we intentionally scan the same directory scope ORL used (`workspacePath`).
    // Mount as /workspace in-container.
    const containerName = `gomboc-checkov-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}`;
    const dockerArgs: string[] = [
      'run',
      '--rm',
      '--name',
      containerName,
      '-v',
      `${args.workspacePath}:/workspace:ro`,
      image,
      '-d',
      '/workspace',
      '--output',
      'json',
      '--compact',
      '--check',
      checkIds.join(','),
    ];

    if (this.opts?.frameworks?.length) {
      dockerArgs.push('--framework', this.opts.frameworks.join(','));
    }
    if (this.opts?.skipPaths?.length) {
      dockerArgs.push('--skip-path', this.opts.skipPaths.join(','));
    }

    const exec = await runProcess({
      command: 'docker',
      commandArgs: dockerArgs,
      cwd: args.workspacePath,
      timeoutMs,
      maxOutputBytes,
    });

    // Checkov exit code semantics:
    // - 0: no failing checks
    // - 1: failing checks found
    // - other: tool/runtime error
    if (exec.timedOut) {
      // Best-effort cleanup: killing `docker run` can leave a container running in the background.
      await runProcess({
        command: 'docker',
        commandArgs: ['rm', '-f', containerName],
        cwd: args.workspacePath,
        timeoutMs: 10_000,
        maxOutputBytes: 1024 * 1024,
      }).catch(() => {});
      throw new Error('Checkov verification timed out');
    }
    if (exec.exitCode !== 0 && exec.exitCode !== 1) {
      throw new Error(
        `Checkov docker run failed (exit=${exec.exitCode ?? 'unknown'}): ${exec.stderr || exec.stdout || 'no output'}`,
      );
    }

    let parsed: any;
    try {
      parsed = parseJsonBestEffort(exec.stdout);
    } catch (e) {
      throw new Error(
        `Checkov output was not valid JSON: ${exec.stderr || String(e)}`,
      );
    }

    const { failedByCheckId, failingCheckIds } =
      extractFailedCheckIdCounts(parsed);
    const summary = extractSummary(parsed);

    return {
      allPassed: failingCheckIds.length === 0,
      failingCheckIds,
      failedByCheckId,
      summary,
      stdoutPreview: truncateForDebug(exec.stdout),
      stderrPreview: truncateForDebug(exec.stderr),
      stdoutLength: exec.stdout.length,
      stderrLength: exec.stderr.length,
    };
  }

  /**
   * Run a full (unfiltered) Checkov scan over the workspace directory.
   * This does not use `--check` filtering.
   */
  async scanAll(args: { workspacePath: string }): Promise<CheckovVerifyResult> {
    const image = this.opts?.image || 'bridgecrew/checkov:latest';
    const timeoutMs = this.opts?.timeoutMs ?? 180_000;
    const maxOutputBytes = this.opts?.maxOutputBytes ?? 20 * 1024 * 1024;

    const containerName = `gomboc-checkov-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 10)}`;
    const dockerArgs: string[] = [
      'run',
      '--rm',
      '--name',
      containerName,
      '-v',
      `${args.workspacePath}:/workspace:ro`,
      image,
      '-d',
      '/workspace',
      '--output',
      'json',
      '--compact',
    ];

    if (this.opts?.frameworks?.length) {
      dockerArgs.push('--framework', this.opts.frameworks.join(','));
    }
    if (this.opts?.skipPaths?.length) {
      dockerArgs.push('--skip-path', this.opts.skipPaths.join(','));
    }

    const exec = await runProcess({
      command: 'docker',
      commandArgs: dockerArgs,
      cwd: args.workspacePath,
      timeoutMs,
      maxOutputBytes,
    });

    if (exec.timedOut) {
      await runProcess({
        command: 'docker',
        commandArgs: ['rm', '-f', containerName],
        cwd: args.workspacePath,
        timeoutMs: 10_000,
        maxOutputBytes: 1024 * 1024,
      }).catch(() => {});
      throw new Error('Checkov scan timed out');
    }
    if (exec.exitCode !== 0 && exec.exitCode !== 1) {
      throw new Error(
        `Checkov docker run failed (exit=${exec.exitCode ?? 'unknown'}): ${exec.stderr || exec.stdout || 'no output'}`,
      );
    }

    let parsed: any;
    try {
      parsed = parseJsonBestEffort(exec.stdout);
    } catch (e) {
      throw new Error(
        `Checkov output was not valid JSON: ${exec.stderr || String(e)}`,
      );
    }

    const { failedByCheckId, failingCheckIds } =
      extractFailedCheckIdCounts(parsed);
    const summary = extractSummary(parsed);

    return {
      allPassed: failingCheckIds.length === 0,
      failingCheckIds,
      failedByCheckId,
      summary,
      stdoutPreview: truncateForDebug(exec.stdout),
      stderrPreview: truncateForDebug(exec.stderr),
      stdoutLength: exec.stdout.length,
      stderrLength: exec.stderr.length,
    };
  }
}
