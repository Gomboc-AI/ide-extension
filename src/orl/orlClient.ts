import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import yaml from 'js-yaml';
import { z } from 'zod';
import logger from '../utils/logger';
import { parseOrlReport } from '../utils/orlReportParser';
import { parseOrlReportPayload } from '../schemas/orlReport';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from '../utils/configDefaults';
import { createProfiler } from '../utils/profiler';
import { ChannelResolver } from '../utils/channelResolver';
import {
  IStorage,
  FileSystemHandler,
  isOrlScannableLanguageFile,
} from '@gomboc-ai/gomboc-node-sdk';

type SpawnResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

type HookManifestEvent = {
  event: string;
  time?: string;
  ruleName?: string;
  priority?: number;
  rulesExecuted?: number;
};

const zRulesCacheMeta = z
  .object({
    pulledAtMs: z.number().optional(),
    rulesServiceUrl: z.string().optional(),
    channel: z.string().optional(),
    containerImage: z.string().optional(),
  })
  .passthrough();
type RulesCacheMeta = z.infer<typeof zRulesCacheMeta>;

const zRulesetDocument = z
  .object({
    name: z.string().optional(),
    metadata: z
      .object({
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function getErrorCode(error: unknown): number {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'number'
  ) {
    return error.code;
  }
  return 1;
}

/**
 * Run a command without going through a shell.
 * This avoids quoting/escaping pitfalls on Windows (PowerShell/cmd) and is safer cross-platform.
 */
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
    maxOutputBytes = 10 * 1024 * 1024, // 10MB
  } = args;

  return await new Promise<SpawnResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, commandArgs, {
      cwd,
      shell: false,
      windowsHide: true,
    });

    const append = (prev: string, chunk: Buffer | string) => {
      const next = prev + chunk.toString();
      if (next.length > maxOutputBytes) {
        return (
          next.slice(0, maxOutputBytes) +
          '\n...[truncated: maxOutputBytes exceeded]...\n'
        );
      }
      return next;
    };

    child.stdout?.on('data', (d: Buffer) => {
      stdout = append(stdout, d);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr = append(stderr, d);
    });

    let t: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      t = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
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
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal: signal as NodeJS.Signals | null,
        timedOut,
      });
    });
  });
}

export interface OrlConfig {
  containerImage: string;
  rulesServiceUrl: string;
  rulesServiceToken: string;
  channel: string;
  extensionPath?: string; // Path to extension directory (from context.extensionPath)
  /**
   * Base directory for persistent caches (ideally VS Code's context.globalStorageUri.fsPath).
   * Used to cache pulled ORL rules across scans to avoid repeated `rules pull` overhead.
   */
  storagePath?: string;
  debugKeepTemp?: boolean;
  debugPersistDiagnostics?: boolean;
  /**
   * Experimental: run a fast first pass with ORL hooks disabled to discover which rules
   * actually produce changes, then rerun ORL with only those rules + hooks enabled.
   */
  twoPassEnabled?: boolean;
  /**
   * DEV ONLY: when enabled, inject `.orl-dev-rules/` as an extra rulespace (if present).
   * Default OFF to avoid accidental production usage.
   */
  localDevRulesEnabled?: boolean;
  /**
   * When enabled, ORL remediation uses only `customRulesPath` and skips rules service pulls.
   */
  customRulesOnly?: boolean;
  /**
   * Custom ORL rules folder path used when `customRulesOnly` is enabled.
   * Supports `${workspaceFolder}`.
   */
  customRulesPath?: string;
}

// Pinned ORL container image. Intentionally not configurable via VS Code settings
// to ensure consistent behavior across environments and easier support/debugging.
// For local dev with XML/Gradle support, switch to 'orl-dev:local'
// (rebuild via: /path/to/orl/reload-dev-image.sh)
const ORL_CONTAINER_IMAGE = 'gombocai/orl:v1.3.6';

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
  /**
   * The ORL process exit code, when available.
   * ORL exit code semantics:
   * - 0: success
   * - 1: failure to execute (unrecoverable)
   * - 2: executed successfully but with errors in the report (fixes still valid)
   * - 3: executed successfully but fix count < finding count (fixes still valid)
   */
  exitCode?: number;
  error?: string;
}

export class OrlClient {
  private config: OrlConfig;
  private rulesetIndexCache:
    | { sourceRulesDir: string; index: Map<string, string[]> }
    | undefined;

  private storageClient: IStorage;

  constructor(config: OrlConfig) {
    this.config = config;
    this.storageClient = new FileSystemHandler();
  }

  private getRulesCacheDir(): string {
    const key = `${this.config.containerImage}::${this.config.rulesServiceUrl}::${this.config.channel}`;
    const hash = crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .slice(0, 12);
    return path.join(
      getOrlRulesCacheRoot(this.config.storagePath),
      `rules-${hash}`,
    );
  }

  /** Create a unique temp directory using storage-backed mkdtemp when available, otherwise fall back to a random mkdir path. */
  private async createTempDir(prefix: string): Promise<string> {
    if (this.storageClient.mkdtemp) {
      return await this.storageClient.mkdtemp({ prefix });
    }
    const fallback = `${prefix}${crypto.randomBytes(8).toString('hex')}`;
    await this.storageClient.mkdir({
      path: fallback,
      opts: { recursive: true },
    });
    return fallback;
  }

  private async isRulesCacheWarm(cacheDir: string): Promise<boolean> {
    const metaPath = path.join(cacheDir, 'meta.json');
    try {
      const raw = await this.storageClient.readText({ path: metaPath });
      const parsedMeta = zRulesCacheMeta.safeParse(JSON.parse(raw));
      if (!parsedMeta.success) {
        return false;
      }
      const meta: RulesCacheMeta = parsedMeta.data;
      const pulledAtMs =
        typeof meta?.pulledAtMs === 'number' ? meta.pulledAtMs : undefined;
      const rulesServiceUrl =
        typeof meta?.rulesServiceUrl === 'string'
          ? meta.rulesServiceUrl
          : undefined;
      const channel =
        typeof meta?.channel === 'string' ? meta.channel : undefined;
      const containerImage =
        typeof meta?.containerImage === 'string'
          ? meta.containerImage
          : undefined;

      // Keep TTL conservative so rules update in a reasonable timeframe without manual refresh.
      const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
      const fresh =
        typeof pulledAtMs === 'number' && Date.now() - pulledAtMs < TTL_MS;

      if (
        !fresh ||
        rulesServiceUrl !== this.config.rulesServiceUrl ||
        channel !== this.config.channel ||
        containerImage !== this.config.containerImage
      ) {
        return false;
      }

      return await this.hasAnyRulesInDir(cacheDir);
    } catch {
      return false;
    }
  }

  private async ensureRulesCached(): Promise<{
    rulesDir: string;
    usedCache: boolean;
    pulled: boolean;
  }> {
    const cacheDir = this.getRulesCacheDir();
    await this.storageClient
      .mkdir({ path: cacheDir, opts: { recursive: true } })
      .catch(() => {});

    const warm = await this.isRulesCacheWarm(cacheDir);
    if (warm) {
      logger.info('Using cached ORL rules (skipping pull)', { cacheDir });
      return { rulesDir: cacheDir, usedCache: true, pulled: false };
    }

    // Cache miss/stale: repull into cache dir.
    // Best-effort cleanup so we don't accumulate stale rule files.
    try {
      const entries = await this.storageClient.listDir(cacheDir);
      if (entries.length) {
        await this.storageClient.remove({
          path: cacheDir,
          opts: { recursive: true, force: true },
        });
        await this.storageClient.mkdir({
          path: cacheDir,
          opts: { recursive: true },
        });
      }
    } catch {
      // ignore
    }

    await this.pullRulesUsingOrl(cacheDir);
    try {
      const metaPath = path.join(cacheDir, 'meta.json');
      await this.storageClient.writeText({
        path: metaPath,
        content: JSON.stringify(
          {
            pulledAtMs: Date.now(),
            rulesServiceUrl: this.config.rulesServiceUrl,
            channel: this.config.channel,
            containerImage: this.config.containerImage,
          },
          null,
          2,
        ),
      });
    } catch {
      // ignore
    }

    return { rulesDir: cacheDir, usedCache: true, pulled: true };
  }

  /**
   * Write ORL hooks into the temp workspace so the container can execute them.
   * Hooks will emit aggregated diagnostics at /workspace/.orl/diagnostics/diagnostics.json
   */
  private async writeHooksToTempWorkspace(tempDir: string): Promise<void> {
    const hooksDir = path.join(tempDir, '.orl', 'hooks');
    await this.storageClient.mkdir({
      path: hooksDir,
      opts: { recursive: true },
    });

    // Read hook scripts from separate files for maintainability
    const hookFiles = [
      'pre_remediate',
      'pre_remediate_rule_finding',
      'post_remediate_rule_finding',
      'post_remediate_rule',
      'post_remediate',
    ];

    // Also include common.sh which is sourced by some hooks
    const supportFiles = ['common'];

    const scripts: Record<string, string> = {};

    // Determine the extension path - we know exactly where hooks are
    let extensionPath: string | undefined = this.config.extensionPath;

    // Fallback: try to get extension path from VS Code API
    if (!extensionPath) {
      try {
        const extension = vscode.extensions.getExtension(
          'gomboc.gomboc-vscode-extension',
        );
        if (extension) {
          extensionPath = extension.extensionPath;
        }
      } catch (e) {
        // Extension not available
      }
    }

    // Read hook files and support files (like common.sh) - we know exactly where they are
    const allFiles = [...hookFiles, ...supportFiles];
    for (const hookName of allFiles) {
      let hookPath: string | undefined;

      if (extensionPath) {
        // First try dist/orl/hooks (production - hooks are copied there during build)
        const distHookPath = path.join(
          extensionPath,
          'dist',
          'orl',
          'hooks',
          `${hookName}.sh`,
        );
        try {
          const exists = await this.storageClient.exists(distHookPath);
          if (!exists) {
            throw new Error('dist path not found');
          }
          hookPath = distHookPath;
        } catch (e) {
          // dist path doesn't exist, try src/orl/hooks (development)
          const srcHookPath = path.join(
            extensionPath,
            'src',
            'orl',
            'hooks',
            `${hookName}.sh`,
          );
          try {
            const exists = await this.storageClient.exists(srcHookPath);
            if (!exists) {
              throw new Error('src path not found');
            }
            hookPath = srcHookPath;
          } catch (e2) {
            // src path doesn't exist either
          }
        }
      }

      // If we found a path, read the file
      if (hookPath) {
        try {
          const content = await this.storageClient.readText({ path: hookPath });
          scripts[hookName] = content;
          logger.info(`Successfully read hook file: ${hookName}`, {
            path: hookPath,
            length: content.length,
          });
        } catch (error) {
          logger.warn(`Failed to read hook file: ${hookName}`, {
            path: hookPath,
            error,
          });
        }
      } else {
        logger.warn(`Hook file not found: ${hookName}`, {
          extensionPath,
          triedPaths: extensionPath
            ? [
                path.join(
                  extensionPath,
                  'dist',
                  'orl',
                  'hooks',
                  `${hookName}.sh`,
                ),
                path.join(
                  extensionPath,
                  'src',
                  'orl',
                  'hooks',
                  `${hookName}.sh`,
                ),
              ]
            : [],
        });
      }
    }

    // Verify all required hooks were found (support files like common.sh are optional)
    const missingHooks: string[] = [];
    for (const hookName of hookFiles) {
      if (!scripts[hookName] || scripts[hookName].trim() === '') {
        missingHooks.push(hookName);
      }
    }

    // Fail if common.sh is missing (required by pre_remediate_rule_finding and post_remediate_rule_finding)
    if (!scripts['common'] || scripts['common'].trim() === '') {
      const errorMessage =
        'Failed to load required support file: common.sh. ' +
        'Hooks that source it (pre_remediate_rule_finding, post_remediate_rule_finding) will fail. ' +
        `Expected location: ${extensionPath ? path.join(extensionPath, 'dist', 'orl', 'hooks') : 'unknown'}.`;
      logger.error(errorMessage, {
        extensionPath,
      });
      throw new Error(errorMessage);
    }

    if (missingHooks.length > 0) {
      const errorMessage =
        `Failed to load required hook files: ${missingHooks.join(', ')}. ` +
        `Expected location: ${extensionPath ? path.join(extensionPath, 'dist', 'orl', 'hooks') : 'unknown'}. ` +
        'Please ensure hooks are copied during build.';
      logger.error(errorMessage, {
        missingHooks,
        extensionPath,
        triedPaths: extensionPath
          ? [
              path.join(extensionPath, 'dist', 'orl', 'hooks'),
              path.join(extensionPath, 'src', 'orl', 'hooks'),
            ]
          : [],
      });
      throw new Error(errorMessage);
    }

    // All hooks loaded successfully - write them to temp workspace
    // Note: We fail fast if any hooks are missing (checked above), ensuring proper deployment
    for (const [name, content] of Object.entries(scripts)) {
      // Hook entry files are invoked without extension (e.g., pre_remediate),
      // but support file is sourced as common.sh by the hooks. Preserve that name.
      const fileName = name === 'common' ? 'common.sh' : name;
      const file = path.join(hooksDir, fileName);
      await this.storageClient.writeText({
        path: file,
        content,
        opts: {
          mode: 0o755,
        },
      });
      logger.debug(`Wrote hook file: ${name}`, {
        path: file,
        length: content.length,
      });
    }
  }

  /**
   * Read aggregated diagnostics emitted by hooks from the temp workspace.
   */
  private async readDiagnostics(tempDir: string): Promise<any | undefined> {
    try {
      const diagnosticsPath = path.join(
        tempDir,
        '.orl',
        'diagnostics',
        'diagnostics.json',
      );
      const exists = await this.storageClient.exists(diagnosticsPath);
      if (!exists) {
        return undefined;
      }
      const raw = await this.storageClient.readText({ path: diagnosticsPath });
      return JSON.parse(raw);
    } catch (err) {
      logger.warn('Failed to read diagnostics from hooks', { err });
      return undefined;
    }
  }

  private async readReportFile(tempDir: string): Promise<string | undefined> {
    const reportPath = path.join(tempDir, '.orl', 'report.yaml');
    try {
      const exists = await this.storageClient.exists(reportPath);
      if (!exists) {
        return undefined;
      }
      const raw = await this.storageClient.readText({ path: reportPath });
      return raw && raw.trim() ? raw : undefined;
    } catch {
      return undefined;
    }
  }

  private async readHookManifestEvents(
    tempDir: string,
  ): Promise<HookManifestEvent[]> {
    const manifestPath = path.join(
      tempDir,
      '.orl',
      'diagnostics',
      'manifest.jsonl',
    );
    try {
      const exists = await this.storageClient.exists(manifestPath);
      if (!exists) {
        return [];
      }
      const raw = await this.storageClient.readText({ path: manifestPath });
      const out: HookManifestEvent[] = [];
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t) {
          continue;
        }
        try {
          const parsed = JSON.parse(t) as HookManifestEvent;
          if (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.event === 'string'
          ) {
            out.push(parsed);
          }
        } catch {
          // ignore malformed lines
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  private summarizeHookTimings(events: HookManifestEvent[]): {
    overallHooksMs?: number;
    rulesExecuted?: number;
    slowestRules?: Array<{ ruleName: string; ms: number; priority?: number }>;
  } {
    if (!Array.isArray(events) || events.length === 0) {
      return {};
    }

    const parseTimeMs = (t?: string): number | undefined => {
      if (!t || typeof t !== 'string') {
        return undefined;
      }
      const ms = Date.parse(t);
      return Number.isFinite(ms) ? ms : undefined;
    };

    const pre = events.find(e => e.event === 'pre_remediate');
    const post = events.find(e => e.event === 'post_remediate');
    const preMs = parseTimeMs(pre?.time);
    const postMs = parseTimeMs(post?.time);

    // Per-rule durations using pre/post events.
    const starts = new Map<string, number[]>();
    const priorities = new Map<string, number>();
    const durations: Array<{
      ruleName: string;
      ms: number;
      priority?: number;
    }> = [];

    for (const e of events) {
      if (typeof e.ruleName === 'string' && typeof e.priority === 'number') {
        priorities.set(e.ruleName, e.priority);
      }
      if (e.event === 'pre_remediate_rule' && typeof e.ruleName === 'string') {
        const ms = parseTimeMs(e.time);
        if (ms !== undefined) {
          const arr = starts.get(e.ruleName) || [];
          arr.push(ms);
          starts.set(e.ruleName, arr);
        }
      }
      if (e.event === 'post_remediate_rule' && typeof e.ruleName === 'string') {
        const endMs = parseTimeMs(e.time);
        if (endMs !== undefined) {
          const arr = starts.get(e.ruleName) || [];
          const startMs = arr.shift();
          if (startMs !== undefined) {
            starts.set(e.ruleName, arr);
            const ms = Math.max(0, endMs - startMs);
            durations.push({
              ruleName: e.ruleName,
              ms,
              priority: priorities.get(e.ruleName),
            });
          }
        }
      }
    }

    durations.sort((a, b) => b.ms - a.ms);
    const slowestRules = durations.slice(0, 10);

    return {
      overallHooksMs:
        preMs !== undefined && postMs !== undefined
          ? postMs - preMs
          : undefined,
      rulesExecuted:
        typeof post?.rulesExecuted === 'number'
          ? post.rulesExecuted
          : undefined,
      slowestRules: slowestRules.length ? slowestRules : undefined,
    };
  }

  private async persistDiagnosticsArtifacts(
    workspacePath: string,
    tempDir: string,
    reportText?: string,
  ): Promise<void> {
    if (!this.config.debugPersistDiagnostics) {
      return;
    }
    try {
      const srcDir = path.join(tempDir, '.orl', 'diagnostics');
      const outDir = path.join(workspacePath, '.orl-debug', 'last-run');
      await this.storageClient.mkdir({
        path: outDir,
        opts: { recursive: true },
      });

      const copyIfExists = async (rel: string) => {
        const src = path.join(srcDir, rel);
        const dst = path.join(outDir, rel);
        try {
          const exists = await this.storageClient.exists(src);
          if (!exists) {
            return;
          }
          await this.storageClient.mkdir({
            path: path.dirname(dst),
            opts: { recursive: true },
          });
          await this.storageClient.copy({ srcPath: src, destPath: dst });
        } catch {
          // ignore
        }
      };

      await copyIfExists('diagnostics.json');
      await copyIfExists('manifest.jsonl');

      // Persist raw ORL report (best-effort) so we can inspect rule->file attribution after cleanup.
      if (reportText && reportText.trim()) {
        try {
          await this.storageClient.writeText({
            path: path.join(outDir, 'report.yaml'),
            content: reportText,
          });
        } catch {
          // ignore
        }
      }

      // Copy per-rule files list (best-effort; may be large)
      const rulesDir = path.join(srcDir, 'rules');
      try {
        const entries = await this.storageClient.listDir(rulesDir);
        const dstRulesDir = path.join(outDir, 'rules');
        await this.storageClient.mkdir({
          path: dstRulesDir,
          opts: { recursive: true },
        });
        for (const e of entries) {
          if (e.type !== 'file') {
            continue;
          }
          const src = path.join(rulesDir, e.name);
          const dst = path.join(dstRulesDir, e.name);
          await this.storageClient
            .copy({ srcPath: src, destPath: dst })
            .catch(() => {});
        }
      } catch {
        // ignore
      }

      logger.info('Persisted ORL diagnostics artifacts', { outDir });
    } catch (e) {
      logger.warn('Failed to persist ORL diagnostics artifacts (ignored)', {
        e,
      });
    }
  }
  /**
   * Execute ORL remediation on the current workspace
   */
  async remediate(
    workspacePath: string,
    language?: string,
  ): Promise<OrlResult> {
    try {
      const scanId = `orl-scan:${Date.now()}:${Math.random()
        .toString(16)
        .slice(2, 10)}`;
      const prof = createProfiler({
        scanId,
        component: 'orlClient.remediate',
        baseFields: { workspacePath, language: language ?? '' },
      });
      logger.info('Starting ORL remediation', { workspacePath });

      const twoPassEnabled =
        typeof this.config.twoPassEnabled === 'boolean'
          ? this.config.twoPassEnabled
          : false;

      // Create a temporary directory for ORL execution
      const tempDir = path.join(workspacePath, '.orl-temp');
      await this.storageClient.mkdir({
        path: tempDir,
        opts: { recursive: true },
      });
      prof.mark('mkdirTemp');

      try {
        const customRulesHostDir =
          await this.resolveCustomRulesOnlyHostDir(workspacePath);
        const customRulesOnlyEnabled = Boolean(customRulesHostDir);
        // Resolve local dev rules early so we can tolerate a remote pull failure.
        // In custom-rules-only mode, local dev rules injection is intentionally disabled.
        const injectedDevRulesHostDir = customRulesOnlyEnabled
          ? undefined
          : await this.tryResolveLocalDevRulesHostDir(workspacePath);

        // Step 1: Ensure rules are available (use a persistent cache to avoid repeated pulls)
        let cached:
          | { rulesDir: string; usedCache: boolean; pulled: boolean }
          | undefined;
        let mountedRulesDir = customRulesHostDir;
        if (!customRulesOnlyEnabled) {
          try {
            cached = await this.ensureRulesCached();
            mountedRulesDir = cached.rulesDir;
          } catch (pullError) {
            if (injectedDevRulesHostDir) {
              logger.warn(
                'Remote rules pull failed but local dev rules are available; continuing with dev rules only',
                { pullError },
              );
            } else {
              throw pullError;
            }
          }
        } else {
          logger.info('Using custom-rules-only mode for ORL remediation', {
            customRulesHostDir,
          });
        }
        prof.mark('pullRulesUsingOrl', {
          customRulesOnly: customRulesOnlyEnabled,
          usedCache: cached?.usedCache,
          pulled: cached?.pulled,
        });

        // Optional two-pass mode:
        // Pass 1 runs with hooks disabled to quickly discover which rules produced changes.
        // Pass 2 runs with hooks enabled but only with the subset of rules that changed files.
        //
        // NOTE: default off; gated by config.
        if (twoPassEnabled) {
          const tryTwoPass = async (): Promise<OrlResult | undefined> => {
            const discoveryDir = await this.createTempDir(
              path.join(os.tmpdir(), 'orl-discovery-'),
            );
            prof.mark('twoPass.mkdtempDiscovery');
            try {
              await this.copyWorkspaceFiles(workspacePath, discoveryDir);
              prof.mark('twoPass.copyWorkspaceFilesDiscovery');

              // ORL writes the report to /workspace/.orl/report.yaml; when hooks are disabled,
              // nothing creates the `.orl` directory for us. Ensure it exists so ORL can write.
              await this.storageClient.mkdir({
                path: path.join(discoveryDir, '.orl'),
                opts: {
                  recursive: true,
                },
              });

              // Pre-create the rules mount point so it is owned by the current user.
              // Docker's nested volume mount (-v cachedRules:/workspace/rules) can leave
              // behind a root-owned directory stub that fs.promises.rm cannot remove.
              await this.storageClient.mkdir({
                path: path.join(discoveryDir, 'rules'),
                opts: {
                  recursive: true,
                },
              });

              const dockerArgsDiscovery = this.buildDockerArgs({
                workspacePath: discoveryDir,
                language,
                mountedRulesDir,
                disableHooks: true,
                devRulesHostDir: injectedDevRulesHostDir,
              });
              logger.info(
                'Executing ORL via Docker (two-pass discovery, hooks disabled)',
                {
                  command: 'docker',
                  args: dockerArgsDiscovery,
                },
              );

              const execDiscovery = await runProcess({
                command: 'docker',
                commandArgs: dockerArgsDiscovery,
                timeoutMs: 90000,
                maxOutputBytes: 10 * 1024 * 1024,
                cwd: workspacePath,
              });
              prof.mark('twoPass.dockerRemediateDiscovery', {
                exitCode: execDiscovery.exitCode,
                timedOut: execDiscovery.timedOut,
              });

              const reportFileDiscovery =
                await this.readReportFile(discoveryDir);
              const reportTextDiscovery =
                reportFileDiscovery || execDiscovery.stdout;
              prof.mark('twoPass.readReportFileDiscovery', {
                usedReportFile: Boolean(reportFileDiscovery),
              });

              // If ORL failed to produce a report (common when --out path is missing), do NOT
              // treat that as "no changes" — fall back to the standard single-pass flow.
              const looksLikeReport =
                typeof reportTextDiscovery === 'string' &&
                reportTextDiscovery.includes('type: Report');
              if (!looksLikeReport) {
                logger.warn(
                  'Two-pass discovery did not produce a valid ORL report; falling back to single-pass remediation',
                  {
                    exitCode: execDiscovery.exitCode,
                    timedOut: execDiscovery.timedOut,
                    stdoutPreview: (execDiscovery.stdout || '').slice(0, 2000),
                    stderrPreview: (execDiscovery.stderr || '').slice(0, 2000),
                  },
                );
                return undefined;
              }

              const changedRuleNames =
                this.extractChangedRuleNamesFromReport(reportTextDiscovery);
              prof.mark('twoPass.discoveredChangedRules', {
                changedRuleCount: changedRuleNames.length,
                sampleRules: changedRuleNames.slice(0, 20),
              });

              if (changedRuleNames.length === 0) {
                // No changes: return early (no need for pass 2).
                prof.end({
                  success: true,
                  exitCode: execDiscovery.exitCode ?? 0,
                });
                return {
                  success: true,
                  modifiedFiles: {},
                  report: reportTextDiscovery,
                  exitCode:
                    typeof execDiscovery.exitCode === 'number'
                      ? execDiscovery.exitCode
                      : 0,
                };
              }

              // Pass 2: run ORL with hooks enabled but only the subset of changed rules.
              await this.copyWorkspaceFiles(workspacePath, tempDir);
              prof.mark('copyWorkspaceFiles');

              await this.writeHooksToTempWorkspace(tempDir);
              prof.mark('writeHooksToTempWorkspace');

              const rulesDir = path.join(tempDir, 'rules');
              await this.storageClient.mkdir({
                path: rulesDir,
                opts: { recursive: true },
              });

              const copied = await this.copyRulesSubsetFromCache({
                sourceRulesDir: mountedRulesDir ?? '',
                destRulesDir: rulesDir,
                ruleNames: changedRuleNames,
              });
              prof.mark('twoPass.copyRulesSubsetFromCache', copied);
              // Safety: If we fail to map any of the discovered rules back to concrete ruleset files,
              // do not proceed with a partial subset run (it could miss fixes). Fall back to single-pass.
              if (copied.missingRules.length || copied.copiedFiles === 0) {
                logger.warn(
                  'Two-pass: failed to build a complete subset rulespace; falling back to single-pass remediation',
                  {
                    copiedFiles: copied.copiedFiles,
                    missingRuleCount: copied.missingRules.length,
                    missingRules: copied.missingRules.slice(0, 25),
                  },
                );
                return undefined;
              }

              const dockerArgs = this.buildDockerArgs({
                workspacePath: tempDir,
                language,
                rulesDir,
                devRulesHostDir: injectedDevRulesHostDir,
              });
              logger.info(
                'Executing ORL via Docker (two-pass, subset rules + hooks enabled)',
                {
                  command: 'docker',
                  args: dockerArgs,
                },
              );

              const execResult = await runProcess({
                command: 'docker',
                commandArgs: dockerArgs,
                timeoutMs: 90000, // hooks add overhead but shouldn't take this long
                maxOutputBytes: 10 * 1024 * 1024,
                cwd: workspacePath,
              });
              prof.mark('dockerRemediate', {
                exitCode: execResult.exitCode,
                timedOut: execResult.timedOut,
              });

              if (prof.enabled) {
                const hookEvents = await this.readHookManifestEvents(tempDir);
                const hookSummary = this.summarizeHookTimings(hookEvents);
                prof.mark('hookTimingSummary', hookSummary);
              }

              const diagnostics = await this.readDiagnostics(tempDir);
              prof.mark('readDiagnostics');
              const reportFile = await this.readReportFile(tempDir);
              prof.mark('readReportFile', {
                usedReportFile: Boolean(reportFile),
              });
              const reportText = reportFile || execResult.stdout;

              const changedRelPaths = reportText
                ? this.extractChangedRelativePathsFromReport(reportText)
                : [];
              prof.mark('extractChangedRelativePaths', {
                changedPathCount: changedRelPaths.length,
              });
              const modifiedFiles = await this.readModifiedFilesFromTemp(
                tempDir,
                {
                  onlyRelativePaths: changedRelPaths.length
                    ? changedRelPaths
                    : undefined,
                },
              );
              prof.mark('readModifiedFilesFromTemp', {
                modifiedFileCount: Object.keys(modifiedFiles).length,
              });

              await this.persistDiagnosticsArtifacts(
                workspacePath,
                tempDir,
                reportText,
              );
              prof.mark('persistDiagnosticsArtifacts');

              prof.mark('cleanupTemp', {
                kept: Boolean(this.config.debugKeepTemp),
              });

              const exitCode =
                typeof execResult.exitCode === 'number'
                  ? execResult.exitCode
                  : undefined;
              const executedSuccessfully =
                exitCode === 0 || exitCode === 2 || exitCode === 3;

              if (!executedSuccessfully || execResult.timedOut) {
                prof.end({ success: false, exitCode: exitCode ?? 1 });
                return {
                  success: false,
                  modifiedFiles: {},
                  exitCode: exitCode ?? 1,
                  error: execResult.timedOut
                    ? 'ORL execution timed out'
                    : `ORL execution failed (exit code ${exitCode ?? 'unknown'})`,
                };
              }

              prof.end({
                success: true,
                exitCode: exitCode ?? 0,
                modifiedFileCount: Object.keys(modifiedFiles).length,
              });

              return {
                success: true,
                modifiedFiles,
                report: reportText,
                exitCode: exitCode ?? 0,
                error:
                  exitCode === 2
                    ? 'ORL executed with errors in the report. See logs for details.'
                    : exitCode === 3
                      ? 'ORL fix count is less than finding count.'
                      : undefined,
                // @ts-ignore add diagnostics for downstream usage
                diagnostics,
              };
            } finally {
              await this.storageClient
                .remove({
                  path: discoveryDir,
                  opts: { recursive: true, force: true },
                })
                .catch(err => {
                  logger.warn(
                    'Failed to clean up discovery directory; stale temp dir may remain',
                    {
                      discoveryDir,
                      error: err instanceof Error ? err.message : String(err),
                    },
                  );
                });
              prof.mark('twoPass.cleanupDiscovery');
            }
          };

          const twoPassResult = await tryTwoPass();
          if (twoPassResult) {
            return twoPassResult;
          }
        }

        // Default single-pass flow:
        // Copy workspace files to temp directory
        await this.copyWorkspaceFiles(workspacePath, tempDir);
        prof.mark('copyWorkspaceFiles');

        // Write ORL hook scripts into temp workspace so they are available inside the container
        await this.writeHooksToTempWorkspace(tempDir);
        prof.mark('writeHooksToTempWorkspace');

        const rulesDir = path.join(tempDir, 'rules');
        await this.storageClient.mkdir({
          path: rulesDir,
          opts: { recursive: true },
        });

        // Step 2: Execute ORL remediation with pulled rules
        const dockerArgs = this.buildDockerArgs({
          workspacePath: tempDir,
          language,
          rulesDir,
          mountedRulesDir,
          devRulesHostDir: injectedDevRulesHostDir,
        });
        logger.info('Executing ORL via Docker', {
          command: 'docker',
          args: dockerArgs,
        });

        const execResult = await runProcess({
          command: 'docker',
          commandArgs: dockerArgs,
          timeoutMs: 90000, // 90 second timeout - hooks add overhead but shouldn't take this long
          maxOutputBytes: 10 * 1024 * 1024,
          cwd: workspacePath,
        });
        prof.mark('dockerRemediate', {
          exitCode: execResult.exitCode,
          timedOut: execResult.timedOut,
        });

        if (prof.enabled) {
          const hookEvents = await this.readHookManifestEvents(tempDir);
          const hookSummary = this.summarizeHookTimings(hookEvents);
          prof.mark('hookTimingSummary', hookSummary);
        }

        const diagnostics = await this.readDiagnostics(tempDir);
        prof.mark('readDiagnostics');
        const reportFile = await this.readReportFile(tempDir);
        prof.mark('readReportFile', { usedReportFile: Boolean(reportFile) });
        const reportText = reportFile || execResult.stdout;

        const changedRelPaths = reportText
          ? this.extractChangedRelativePathsFromReport(reportText)
          : [];
        prof.mark('extractChangedRelativePaths', {
          changedPathCount: changedRelPaths.length,
        });
        const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir, {
          onlyRelativePaths: changedRelPaths.length
            ? changedRelPaths
            : undefined,
        });
        prof.mark('readModifiedFilesFromTemp', {
          modifiedFileCount: Object.keys(modifiedFiles).length,
        });

        await this.persistDiagnosticsArtifacts(
          workspacePath,
          tempDir,
          reportText,
        );
        prof.mark('persistDiagnosticsArtifacts');

        prof.mark('cleanupTemp', { kept: Boolean(this.config.debugKeepTemp) });

        const exitCode =
          typeof execResult.exitCode === 'number'
            ? execResult.exitCode
            : undefined;

        // ORL exit codes: 0=success, 1=failure to execute, 2=ok with errors, 3=ok but fixes<findings.
        // Codes 0/2/3 executed successfully and may contain fixes to deliver.
        const executedSuccessfully =
          exitCode === 0 || exitCode === 2 || exitCode === 3;

        if (execResult.timedOut) {
          logger.error('ORL docker process timed out', {
            timeoutMs: 90000,
            signal: execResult.signal,
          });
        } else if (exitCode === 2) {
          logger.warn(
            'ORL executed with errors in the report; delivering available fixes',
            { exitCode, stderrPreview: execResult.stderr.slice(0, 2000) },
          );
        } else if (exitCode === 3) {
          logger.warn(
            'ORL fix count is less than finding count; delivering available fixes',
            { exitCode },
          );
        } else if (exitCode && exitCode !== 0) {
          logger.error('ORL failed to execute', {
            exitCode,
            stderrPreview: execResult.stderr.slice(0, 2000),
          });
        }

        if (!executedSuccessfully || execResult.timedOut) {
          prof.end({ success: false, exitCode: exitCode ?? 1 });
          return {
            success: false,
            modifiedFiles: {},
            exitCode: exitCode ?? 1,
            error: execResult.timedOut
              ? 'ORL execution timed out'
              : `ORL execution failed (exit code ${exitCode ?? 'unknown'})`,
          };
        }

        prof.end({
          success: true,
          exitCode: exitCode ?? 0,
          modifiedFileCount: Object.keys(modifiedFiles).length,
        });
        return {
          success: true,
          modifiedFiles,
          report: reportText,
          exitCode: exitCode ?? 0,
          error:
            exitCode === 2
              ? 'ORL executed with errors in the report. See logs for details.'
              : exitCode === 3
                ? 'ORL fix count is less than finding count.'
                : undefined,
          // @ts-ignore add diagnostics for downstream usage
          diagnostics,
        };
      } finally {
        if (!this.config.debugKeepTemp) {
          await this.storageClient
            .remove({ path: tempDir, opts: { recursive: true, force: true } })
            .catch(() => {});
        } else {
          logger.warn('Debug: preserving .orl-temp after remediation', {
            tempDir,
          });
        }
      }
    } catch (error) {
      logger.error('ORL remediation failed', { error });
      return {
        success: false,
        modifiedFiles: {},
        exitCode: getErrorCode(error),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Copy workspace files to temporary directory for ORL processing
   */
  private async copyWorkspaceFiles(
    sourcePath: string,
    destPath: string,
  ): Promise<void> {
    const files = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(sourcePath),
    );

    const iacFiles: string[] = [];
    for (const [fileName, fileType] of files) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const fullPath = path.join(sourcePath, fileName);
      if (!isOrlScannableLanguageFile({ filePath: fullPath, content: '' })) {
        continue;
      }
      iacFiles.push(fileName);
    }

    // Copy in parallel with a small concurrency cap. This is particularly helpful on Windows,
    // where many small file operations can be slow when done strictly serially.
    const concurrency = 32;
    let idx = 0;
    const workers = Array.from({
      length: Math.min(concurrency, iacFiles.length),
    }).map(async () => {
      while (true) {
        const myIdx = idx++;
        if (myIdx >= iacFiles.length) {
          return;
        }
        const fileName = iacFiles[myIdx];
        const sourceFile = path.join(sourcePath, fileName);
        const destFile = path.join(destPath, fileName);
        await this.storageClient.copy({
          srcPath: sourceFile,
          destPath: destFile,
        });
      }
    });
    await Promise.all(workers);
  }

  /**
   * Copy a single IaC file into the temp workspace, preserving its basename.
   * We intentionally do not copy the whole directory so ORL only sees this file.
   */
  private async copySingleWorkspaceFile(args: {
    sourceDir: string;
    destDir: string;
    filePath: string;
  }): Promise<void> {
    const { sourceDir, destDir, filePath } = args;
    const abs = path.isAbsolute(filePath)
      ? filePath
      : path.join(sourceDir, filePath);
    const base = path.basename(abs);
    if (!isOrlScannableLanguageFile({ filePath: abs, content: '' })) {
      throw new Error(`Not an ORL-scannable file: ${base}`);
    }
    // Only support copying files within the scan directory (matches our scan scoping).
    const rel = path.relative(sourceDir, abs);
    if (!rel || rel.startsWith('..')) {
      throw new Error('Selected file is not within the scan directory');
    }

    await this.storageClient.mkdir({
      path: destDir,
      opts: { recursive: true },
    });
    const destFile = path.join(destDir, rel);
    await this.storageClient.mkdir({
      path: path.dirname(destFile),
      opts: { recursive: true },
    });
    const content = await this.storageClient.readBytes(abs);
    await this.storageClient.writeBytes({ path: destFile, content });
  }

  /**
   * Pull rules
   */
  private async pullRulesUsingOrl(
    rulesDir: string,
    opts?: { searchQuery?: string },
  ): Promise<void> {
    const { rulesServiceUrl, rulesServiceToken, channel } = this.config;

    // reuse ORL's rules pull command
    // Note: We don't force --platform to allow Docker to use native architecture
    const dockerArgs: string[] = ['run', '--rm'];

    if (process.getuid && process.getgid) {
      dockerArgs.push('--user', `${process.getuid()}:${process.getgid()}`);
    }

    dockerArgs.push(
      '-v',
      `${rulesDir}:/output`,
      '-e',
      `RULE_SERVICE_TOKEN=${rulesServiceToken}`,
      this.config.containerImage,
      'rules',
      'pull',
      `--url=${rulesServiceUrl}`,
      '--out=/output',
      opts?.searchQuery
        ? `--search=${opts.searchQuery}`
        : `--channel=${channel}`,
    );

    logger.info('Pulling rules using ORL', {
      command: 'docker',
      args: dockerArgs,
    });

    try {
      const result = await runProcess({
        command: 'docker',
        commandArgs: dockerArgs,
        maxOutputBytes: 10 * 1024 * 1024,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `docker exited with code ${result.exitCode ?? 'unknown'} (signal=${result.signal ?? 'none'}${result.timedOut ? ', timedOut' : ''})`,
        );
      }
      logger.info('Rules pulled successfully', {
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error) {
      logger.error('Failed to pull rules using ORL', { error });
      throw new Error(
        `Failed to pull rules: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async hasAnyRulesInDir(rulesDir: string): Promise<boolean> {
    try {
      const entries = await this.storageClient.listDir(rulesDir);
      // ORL rulespaces typically contain files + directories; we just need "non-empty"
      // to avoid the "search succeeded but returned zero rules" case.
      for (const e of entries) {
        if (e.type === 'file') {
          return true;
        }
        if (e.type === 'directory') {
          // If there is any file inside, consider it non-empty.
          const nested = await this.storageClient
            .listDir(path.join(rulesDir, e.name))
            .catch(() => []);
          if (nested.length > 0) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private stripOrlInstanceSuffix(ruleName: string): string {
    if (!ruleName || typeof ruleName !== 'string') {
      return ruleName;
    }
    const m = ruleName.match(/^(.*?)(\d{3})$/);
    if (!m) {
      return ruleName;
    }
    const base = m[1] ?? '';
    if (!base) {
      return ruleName;
    }
    const prev = base[base.length - 1];
    if (prev && /[0-9]/.test(prev)) {
      return ruleName;
    }
    return base;
  }

  /**
   * Build Docker command for ORL execution
   */
  private buildDockerArgs(opts: {
    workspacePath: string;
    language?: string;
    rulesDir?: string;
    mountedRulesDir?: string;
    disableHooks?: boolean;
    /**
     * DEV ONLY: additional host directory containing ORL rules to inject into scans.
     * If set, this directory is mounted read-only at `/dev-rules` and appended as an extra `--rulespace`.
     */
    devRulesHostDir?: string;
  }): string[] {
    const { containerImage } = this.config;
    const {
      workspacePath,
      language,
      rulesDir,
      mountedRulesDir,
      disableHooks,
      devRulesHostDir,
    } = opts;

    // Note: We don't force --platform to allow Docker to use native architecture
    // This avoids emulation overhead on ARM Macs if the image supports ARM64
    // Docker Desktop on Windows automatically handles path conversion (C:\Users\... -> /c/Users/...)
    const dockerArgs: string[] = ['run', '--rm'];

    // On POSIX (macOS/Linux), run the container as the current user so files
    // created on mounted volumes are owned by the host user, not root.
    // Without this, Docker leaves root-owned artifacts that fs.promises.rm
    // cannot remove, causing "access denied" errors during cleanup.
    if (process.getuid && process.getgid) {
      dockerArgs.push('--user', `${process.getuid()}:${process.getgid()}`);
    }

    dockerArgs.push('-v', `${workspacePath}:/workspace`);

    if (mountedRulesDir) {
      // Mount cached rules directly into the container so we don't have to pull/copy into the temp workspace.
      dockerArgs.push('-v', `${mountedRulesDir}:/workspace/rules`);
    }

    if (devRulesHostDir && devRulesHostDir.trim()) {
      dockerArgs.push('-v', `${devRulesHostDir}:/dev-rules:ro`);
    }

    dockerArgs.push(containerImage, 'remediate', '/workspace');

    if (disableHooks) {
      dockerArgs.push('--disable-hooks');
    } else {
      dockerArgs.push('--hooks-dir', '/workspace/.orl/hooks');
    }

    if (mountedRulesDir || rulesDir) {
      // rulesDir is within the mounted workspacePath, so we reference it at /workspace/rules in-container.
      dockerArgs.push('--rulespace', '/workspace/rules');
    }
    if (devRulesHostDir && devRulesHostDir.trim()) {
      dockerArgs.push('--rulespace', '/dev-rules');
    }
    if (language) {
      dockerArgs.push('--language', language);
    }

    // Always write the report to a file so we can read/persist it reliably (stdout may be empty/truncated).
    dockerArgs.push('--out', '/workspace/.orl/report.yaml');
    return dockerArgs;
  }

  private async tryResolveLocalDevRulesHostDir(
    workspacePath: string,
  ): Promise<string | undefined> {
    if (!this.config.localDevRulesEnabled) {
      return undefined;
    }
    let dir = workspacePath;
    const root = path.parse(dir).root;
    while (dir !== root) {
      const candidate = path.join(dir, '.orl-dev-rules');
      try {
        const exists = await this.storageClient.exists(candidate);
        if (!exists) {
          throw new Error('candidate does not exist');
        }
        return candidate;
      } catch {
        dir = path.dirname(dir);
      }
    }
    return undefined;
  }

  private resolveWorkspaceFolderPath(
    workspacePath: string,
  ): string | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) {
      return undefined;
    }
    const normalizedWorkspacePath = path.resolve(workspacePath);
    const containing = folders.find(folder => {
      const folderPath = path.resolve(folder.uri.fsPath);
      return (
        normalizedWorkspacePath === folderPath ||
        normalizedWorkspacePath.startsWith(`${folderPath}${path.sep}`)
      );
    });
    if (containing) {
      return containing.uri.fsPath;
    }
    return folders[0]?.uri.fsPath;
  }

  private async resolveCustomRulesOnlyHostDir(
    workspacePath: string,
  ): Promise<string | undefined> {
    if (!this.config.customRulesOnly) {
      return undefined;
    }

    const configured = (this.config.customRulesPath || '').trim();
    if (!configured) {
      throw new Error(
        'ORL custom-rules-only mode is enabled, but no custom rules folder path is configured.',
      );
    }

    const workspaceFolderPath = this.resolveWorkspaceFolderPath(workspacePath);
    if (configured.includes('${workspaceFolder}') && !workspaceFolderPath) {
      throw new Error(
        'ORL custom-rules-only mode requires a workspace folder to resolve ${workspaceFolder} in the custom rules path.',
      );
    }

    const expanded = workspaceFolderPath
      ? configured.replace(/\$\{workspaceFolder\}/g, workspaceFolderPath)
      : configured;
    const resolvedPath = path.resolve(expanded);

    let stat: { type: 'file' | 'directory' | 'symlink' | 'other' };
    try {
      stat = await this.storageClient.stat(resolvedPath);
    } catch {
      throw new Error(
        `No custom rules folder found at "${resolvedPath}". Update gomboc-vscode-extension.orlCustomRulesPath.`,
      );
    }
    if (stat.type !== 'directory') {
      throw new Error(
        `Custom rules path "${resolvedPath}" is not a directory. Update gomboc-vscode-extension.orlCustomRulesPath.`,
      );
    }

    const hasRules = await this.hasAnyRulesInDir(resolvedPath);
    if (!hasRules) {
      throw new Error(
        `No ORL rules were found in custom rules folder "${resolvedPath}".`,
      );
    }

    return resolvedPath;
  }

  private extractChangedRuleNamesFromReport(report?: string): string[] {
    const parsed = parseOrlReport(report);
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    const parsedReport = parseOrlReportPayload(parsed);
    const rules = parsedReport?.spec?.rules;
    if (!Array.isArray(rules)) {
      return [];
    }

    const toInt = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
      if (typeof v === 'string') {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };

    const out = new Set<string>();
    for (const r of rules) {
      const ruleName: string | undefined =
        (typeof r?.name === 'string' && r.name) ||
        (typeof r?.metadata?.name === 'string' && r.metadata.name) ||
        undefined;
      if (!ruleName) {
        continue;
      }

      const fixes = toInt(r?.fixes);
      const changes = toInt(r?.changes);
      const filesChanged =
        r?.files_changed && typeof r.files_changed === 'object'
          ? Object.keys(r.files_changed)
          : [];
      const hasFilesChanged = filesChanged.length > 0;

      if (hasFilesChanged || fixes > 0 || changes > 0) {
        // ORL report appends a 3-digit instance suffix in some cases; normalize so we
        // can map back to ruleset files on disk.
        out.add(this.stripOrlInstanceSuffix(ruleName));
      }
    }
    return Array.from(out);
  }

  private async getRulesetIndex(
    sourceRulesDir: string,
  ): Promise<Map<string, string[]>> {
    if (
      this.rulesetIndexCache &&
      this.rulesetIndexCache.sourceRulesDir === sourceRulesDir
    ) {
      return this.rulesetIndexCache.index;
    }

    const index = new Map<string, string[]>();

    const walk = async (dir: string): Promise<void> => {
      let entries: Array<{ name: string; type: string }> = [];
      try {
        entries = await this.storageClient.listDir(dir);
      } catch {
        return;
      }

      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.type === 'directory') {
          await walk(full);
          continue;
        }
        if (e.type !== 'file') {
          continue;
        }
        if (!full.toLowerCase().endsWith('.orl')) {
          continue;
        }

        try {
          const raw = await this.storageClient.readText({ path: full });
          const parsedDoc = zRulesetDocument.safeParse(
            yaml.load(raw, {
              schema: yaml.FAILSAFE_SCHEMA,
            }),
          );
          if (!parsedDoc.success) {
            continue;
          }
          const doc = parsedDoc.data;

          // Ruleset files have a top-level `name` in our rules repo; keep a few fallbacks
          // to be resilient to format changes.
          const name =
            (typeof doc.name === 'string' && doc.name.trim()) ||
            (typeof doc.metadata?.name === 'string' &&
              doc.metadata.name.trim()) ||
            undefined;
          if (!name) {
            continue;
          }

          const arr = index.get(name) ?? [];
          arr.push(full);
          index.set(name, arr);
        } catch {
          // ignore parse errors; index is best-effort
        }
      }
    };

    await walk(sourceRulesDir);
    this.rulesetIndexCache = { sourceRulesDir, index };
    return index;
  }

  private async copyRulesSubsetFromCache(args: {
    sourceRulesDir: string;
    destRulesDir: string;
    ruleNames: string[];
  }): Promise<{ copiedFiles: number; missingRules: string[] }> {
    const { sourceRulesDir, destRulesDir } = args;
    const ruleNames = Array.from(new Set(args.ruleNames.filter(Boolean)));

    const index = await this.getRulesetIndex(sourceRulesDir);

    let copiedFiles = 0;
    const missingRules: string[] = [];

    for (const ruleNameRaw of ruleNames) {
      const ruleName = this.stripOrlInstanceSuffix(ruleNameRaw);
      const files = index.get(ruleName) ?? index.get(ruleNameRaw) ?? [];
      if (!files.length) {
        missingRules.push(ruleNameRaw);
        continue;
      }

      for (const src of files) {
        const rel = path.relative(sourceRulesDir, src);
        const dst = path.join(destRulesDir, rel);
        await this.storageClient.mkdir({
          path: path.dirname(dst),
          opts: { recursive: true },
        });
        await this.storageClient.copy({ srcPath: src, destPath: dst });
        copiedFiles++;
      }
    }

    return { copiedFiles, missingRules };
  }

  /**
   * Read modified files directly from the temp directory (non-dry-run mode)
   */
  private async readModifiedFilesFromTemp(
    tempDir: string,
    opts?: { onlyRelativePaths?: string[] },
  ): Promise<{ [filePath: string]: string }> {
    const modifiedFiles: { [filePath: string]: string } = {};

    try {
      let files: string[] = [];
      if (opts?.onlyRelativePaths?.length) {
        // Only read the paths ORL reported as changed.
        files = opts.onlyRelativePaths
          .map(p => p.replace(/^[.][/]/, '').replace(/^\/+/, ''))
          .map(p => path.join(tempDir, p));
      } else {
        // Fallback: Read all IaC files from temp directory
        files = await this.getAllIacFiles(tempDir);
      }

      for (const filePath of files) {
        try {
          // Skip if file doesn't exist (can happen with report-derived paths)
          const exists = await this.storageClient.exists(filePath);
          if (!exists) {
            continue;
          }
          // Read the modified file content
          const content = await this.storageClient.readText({ path: filePath });

          // Convert temp directory path to ORL workspace path format
          // e.g., /path/to/.orl-temp/test-aws.tf -> /workspace/test-aws.tf
          const relativePath = path.relative(tempDir, filePath);
          const orlPath = `/workspace/${relativePath}`;

          modifiedFiles[orlPath] = content;

          logger.debug('Read modified file from temp directory', {
            filePath,
            orlPath,
            contentLength: content.length,
          });
        } catch (error) {
          logger.warn('Failed to read modified file', { filePath, error });
        }
      }

      logger.info('Read modified files from temp directory', {
        fileCount: Object.keys(modifiedFiles).length,
        // Avoid logging huge file lists at info level.
        sampleFiles: Object.keys(modifiedFiles).slice(0, 25),
      });
    } catch (error) {
      logger.error('Failed to read modified files from temp directory', {
        error,
      });
    }

    return modifiedFiles;
  }

  private extractChangedRelativePathsFromReport(report?: string): string[] {
    const parsed = parseOrlReport(report);
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    const parsedReport = parseOrlReportPayload(parsed);
    const rules = parsedReport?.spec?.rules;
    if (!Array.isArray(rules)) {
      return [];
    }
    const out = new Set<string>();
    const normalize = (p: string): string => {
      const s = (p || '').trim();
      if (!s) {
        return '';
      }
      if (s.startsWith('/workspace/')) {
        return s.replace(/^\/workspace\/+/, '');
      }
      if (s.startsWith('./')) {
        return s.replace(/^[.][/]/, '');
      }
      return s.replace(/^\/+/, '');
    };

    for (const r of rules) {
      // Prefer files_changed keys for true modifications.
      const fc = r?.files_changed;
      if (fc && typeof fc === 'object') {
        for (const k of Object.keys(fc)) {
          const n = normalize(k);
          if (n) {
            out.add(n);
          }
        }
      }
      // Fall back to files[].path if present.
      const files = r?.files;
      if (Array.isArray(files)) {
        for (const f of files) {
          const p = typeof f?.path === 'string' ? f.path : '';
          const n = normalize(p);
          if (n) {
            out.add(n);
          }
        }
      }
    }
    return Array.from(out);
  }

  /**
   * Recursively collect files recognized by language handlers for ORL staging.
   */
  private async getAllIacFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await this.storageClient.listDir(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip .orl directory and other hidden/system directories
        if (entry.name.startsWith('.') && entry.name !== '.') {
          continue;
        }

        if (entry.type === 'directory') {
          // Recursively search subdirectories
          const subFiles = await this.getAllIacFiles(fullPath);
          files.push(...subFiles);
        } else if (
          entry.type === 'file' &&
          isOrlScannableLanguageFile({ filePath: fullPath, content: '' })
        ) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn('Failed to read directory', { dir, error });
    }

    return files;
  }

  /**
   * Parse ORL dry-run output to extract modified files (legacy method, kept for fallback)
   */
  private parseOrlOutput(output: string): { [filePath: string]: string } {
    logger.info('Raw ORL output', { output });

    const modifiedFiles: { [filePath: string]: string } = {};
    const lines = output.split('\n');

    let currentFile = '';
    let currentContent: string[] = [];
    let inFileContent = false;

    for (const line of lines) {
      logger.debug('Processing ORL line', { line, currentFile, inFileContent });

      if (line.startsWith('---')) {
        // Save previous file if we have content
        if (currentFile && currentContent.length > 0) {
          modifiedFiles[currentFile] = currentContent.join('\n');
          logger.info('Saved file content', {
            file: currentFile,
            contentLength: currentContent.length,
          });
        }

        // Reset for next file
        currentFile = '';
        currentContent = [];
        inFileContent = false;
        continue;
      }

      if (!inFileContent && line.trim() && !line.includes('is unchanged')) {
        // This should be a file path - but only if it looks like a real file path
        const trimmedLine = line.trim();

        // Skip YAML report lines and other non-file content
        if (
          trimmedLine.startsWith('- ') ||
          trimmedLine.startsWith('type:') ||
          trimmedLine.startsWith('version:') ||
          trimmedLine.startsWith('metadata:') ||
          trimmedLine.startsWith('spec:') ||
          trimmedLine.startsWith('rules:')
        ) {
          continue;
        }

        // Skip lines with colons that look like YAML key:value pairs
        // But allow paths that might contain colons in certain contexts
        const hasColon = trimmedLine.includes(':');
        const looksLikeYamlKey =
          hasColon &&
          !trimmedLine.startsWith('/') &&
          !trimmedLine.startsWith('./');

        const normalizedPath = trimmedLine.startsWith('/workspace/')
          ? trimmedLine
          : trimmedLine.startsWith('./')
            ? `/workspace/${trimmedLine.slice(2)}`
            : `/workspace/${trimmedLine}`;

        if (
          !looksLikeYamlKey &&
          isOrlScannableLanguageFile({
            filePath: normalizedPath,
            content: '',
          })
        ) {
          currentFile = normalizedPath;
          inFileContent = true;
          logger.info('Found file path', {
            file: currentFile,
            original: trimmedLine,
          });
          continue;
        }
      }

      if (inFileContent && currentFile) {
        currentContent.push(line);
      }
    }

    // Don't forget the last file
    if (currentFile && currentContent.length > 0) {
      modifiedFiles[currentFile] = currentContent.join('\n');
      logger.info('Saved final file content', {
        file: currentFile,
        contentLength: currentContent.length,
      });
    }

    logger.info('Parsed ORL output', {
      modifiedFiles: Object.keys(modifiedFiles),
    });
    return modifiedFiles;
  }

  public parseOrlOutputForTests(output: string): {
    [filePath: string]: string;
  } {
    return this.parseOrlOutput(output);
  }

  /**
   * Test ORL connectivity and configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      // Note: We don't force --platform to allow Docker to use native architecture
      const dockerArgs: string[] = [
        'run',
        '--rm',
        '-e',
        `RULE_SERVICE_URL=${this.config.rulesServiceUrl}`,
        '-e',
        `RULE_SERVICE_TOKEN=${this.config.rulesServiceToken}`,
        this.config.containerImage,
        'rules',
        'list',
        '--help',
      ];

      const result = await runProcess({
        command: 'docker',
        commandArgs: dockerArgs,
        timeoutMs: 30000,
        maxOutputBytes: 2 * 1024 * 1024,
      });
      if (result.exitCode !== 0) {
        logger.warn('ORL connection test returned non-zero exit', {
          exitCode: result.exitCode,
          stderr: result.stderr,
        });
        return false;
      }
      return true;
    } catch (error) {
      logger.error('ORL connection test failed', { error });
      return false;
    }
  }

  /**
   * Execute ORL remediation scoped to a single ORL rule. This is intended for
   * robust per-rule fixes: we rerun ORL with only the selected rule present in
   * the rulespace, then apply the resulting modified files as full replacements.
   *
   * Note: We keep the same directory-level scan scope as our normal ORL scan
   * (workspacePath is the directory containing the file).
   */
  async remediateSingleRule(args: {
    workspacePath: string;
    language?: string;
    ruleName: string;
    targetFilePath?: string;
    devRulesSearchPath?: string;
  }): Promise<OrlResult> {
    const {
      workspacePath,
      language,
      ruleName,
      targetFilePath,
      devRulesSearchPath,
    } = args;
    try {
      const scanId = `orl-single:${Date.now()}:${Math.random()
        .toString(16)
        .slice(2, 10)}`;
      const prof = createProfiler({
        scanId,
        component: 'orlClient.remediateSingleRule',
        baseFields: {
          workspacePath,
          language: language ?? '',
          ruleName,
          targetFilePath: targetFilePath ?? '',
        },
      });
      logger.info('Starting ORL single-rule remediation', {
        workspacePath,
        ruleName,
        targetFilePath,
      });

      // Use an OS temp directory to avoid contending with .orl-temp from scans.
      const tempDir = await this.createTempDir(
        path.join(os.tmpdir(), 'orl-single-rule-'),
      );
      prof.mark('mkdtemp');

      // Copy only the selected file when provided; otherwise keep directory-level behavior.
      if (targetFilePath) {
        await this.copySingleWorkspaceFile({
          sourceDir: workspacePath,
          destDir: tempDir,
          filePath: targetFilePath,
        });
      } else {
        await this.copyWorkspaceFiles(workspacePath, tempDir);
      }
      prof.mark('copyWorkspaceInputs');

      // Write ORL hook scripts into temp workspace so they are available inside the container.
      await this.writeHooksToTempWorkspace(tempDir);
      prof.mark('writeHooksToTempWorkspace');

      // Pull only this rule into a temp rulespace.
      const rulesDir = path.join(tempDir, 'rules');
      await this.storageClient.mkdir({
        path: rulesDir,
        opts: { recursive: true },
      });

      // Prefer an exact name match. If this fails (e.g., rules service mismatch),
      // fall back to pulling the channel (heavier but robust).
      const escapeForQuery = (s: string): string =>
        s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const baseRuleName = this.stripOrlInstanceSuffix(ruleName);
      const exact = escapeForQuery(ruleName);
      const base = escapeForQuery(baseRuleName);
      const query =
        baseRuleName && baseRuleName !== ruleName
          ? `(or (eq $.name "${exact}") (eq $.name "${base}"))`
          : `(eq $.name "${exact}")`;

      const customRulesHostDir =
        await this.resolveCustomRulesOnlyHostDir(workspacePath);
      const customRulesOnlyEnabled = Boolean(customRulesHostDir);
      const injectedDevRulesHostDir = customRulesOnlyEnabled
        ? undefined
        : await this.tryResolveLocalDevRulesHostDir(
            devRulesSearchPath || workspacePath,
          );

      let pulledSingleRule = false;
      if (customRulesOnlyEnabled) {
        const copied = await this.copyRulesSubsetFromCache({
          sourceRulesDir: customRulesHostDir ?? '',
          destRulesDir: rulesDir,
          ruleNames: [ruleName],
        });
        pulledSingleRule = copied.copiedFiles > 0;
        if (copied.missingRules.length > 0 || copied.copiedFiles === 0) {
          return {
            success: false,
            modifiedFiles: {},
            exitCode: 1,
            error: `Rule "${ruleName}" was not found in custom rules folder "${customRulesHostDir}".`,
          };
        }
      } else {
        try {
          await this.pullRulesUsingOrl(rulesDir, { searchQuery: query });
          pulledSingleRule = await this.hasAnyRulesInDir(rulesDir);
          if (!pulledSingleRule) {
            logger.warn(
              'Single-rule rules pull via --search returned no rules; falling back to channel pull',
              { ruleName, baseRuleName },
            );
            await this.pullRulesUsingOrl(rulesDir);
          }
        } catch (e) {
          if (injectedDevRulesHostDir) {
            logger.warn(
              'Single-rule rules pull failed but local dev rules are available; continuing with dev rules only',
              {
                ruleName,
                baseRuleName,
                error: e instanceof Error ? e.message : String(e),
              },
            );
          } else {
            logger.warn(
              'Single-rule rules pull via --search failed; falling back to channel pull',
              {
                ruleName,
                baseRuleName,
                error: e instanceof Error ? e.message : String(e),
              },
            );
            await this.pullRulesUsingOrl(rulesDir);
          }
        }
      }
      prof.mark('pullRulesUsingOrl', {
        customRulesOnly: customRulesOnlyEnabled,
        pulledSingleRule,
      });

      if (customRulesOnlyEnabled) {
        logger.info('Using custom-rules-only mode for ORL single-rule fix', {
          ruleName,
          customRulesHostDir,
        });
      }

      // Execute ORL remediation with pulled rules.
      const dockerArgs = this.buildDockerArgs({
        workspacePath: tempDir,
        language,
        rulesDir,
        devRulesHostDir: injectedDevRulesHostDir,
      });
      logger.info('Executing ORL via Docker (single-rule)', {
        command: 'docker',
        args: dockerArgs,
      });

      const execResult = await runProcess({
        command: 'docker',
        commandArgs: dockerArgs,
        timeoutMs: 90000,
        maxOutputBytes: 10 * 1024 * 1024,
        cwd: workspacePath,
      });
      prof.mark('dockerRemediate', {
        exitCode: execResult.exitCode,
        timedOut: execResult.timedOut,
      });

      if (prof.enabled) {
        const hookEvents = await this.readHookManifestEvents(tempDir);
        const hookSummary = this.summarizeHookTimings(hookEvents);
        prof.mark('hookTimingSummary', hookSummary);
      }

      const diagnostics = await this.readDiagnostics(tempDir);
      prof.mark('readDiagnostics');
      const reportFile = await this.readReportFile(tempDir);
      prof.mark('readReportFile', { usedReportFile: Boolean(reportFile) });
      const reportText = reportFile || execResult.stdout;
      const changedRelPaths =
        this.extractChangedRelativePathsFromReport(reportText);
      prof.mark('extractChangedRelativePaths', {
        changedPathCount: changedRelPaths.length,
      });
      const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir, {
        onlyRelativePaths: changedRelPaths.length ? changedRelPaths : undefined,
      });
      prof.mark('readModifiedFilesFromTemp', {
        modifiedFileCount: Object.keys(modifiedFiles).length,
      });

      await this.persistDiagnosticsArtifacts(
        workspacePath,
        tempDir,
        reportText,
      );
      prof.mark('persistDiagnosticsArtifacts');

      await this.storageClient
        .remove({ path: tempDir, opts: { recursive: true, force: true } })
        .catch((err: unknown) => {
          logger.warn(
            'Failed to clean up single-rule temp directory; stale temp dir may remain',
            {
              tempDir,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        });
      prof.mark('cleanupTemp');

      const exitCode =
        typeof execResult.exitCode === 'number'
          ? execResult.exitCode
          : undefined;
      const executedSuccessfully =
        exitCode === 0 || exitCode === 2 || exitCode === 3;

      logger.info('ORL single-rule remediation completed', {
        ruleName,
        filesModified: Object.keys(modifiedFiles).length,
        exitCode,
      });

      if (!executedSuccessfully || execResult.timedOut) {
        prof.end({ success: false, exitCode: exitCode ?? 1 });
        return {
          success: false,
          modifiedFiles: {},
          exitCode: exitCode ?? 1,
          error: execResult.timedOut
            ? 'ORL execution timed out'
            : `ORL execution failed (exit code ${exitCode ?? 'unknown'})`,
        };
      }

      prof.end({
        success: true,
        exitCode: exitCode ?? 0,
        modifiedFileCount: Object.keys(modifiedFiles).length,
      });
      return {
        success: true,
        modifiedFiles,
        report: reportText,
        exitCode: exitCode ?? 0,
        error:
          exitCode === 2
            ? 'ORL executed with errors in the report. See logs for details.'
            : exitCode === 3
              ? 'ORL fix count is less than finding count.'
              : undefined,
        // @ts-ignore add diagnostics for downstream usage
        diagnostics,
      };
    } catch (error) {
      logger.error('ORL single-rule remediation failed', {
        ruleName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        modifiedFiles: {},
        exitCode: getErrorCode(error),
        error:
          error instanceof Error
            ? error.message
            : 'ORL single-rule remediation failed',
      };
    }
  }
}

/**
 * Factory function to create OrlClient from VS Code configuration.
 *
 * Resolves the channel name based on account ID and settings:
 * - If orlChannel setting is set, uses that (manual override)
 * - Otherwise, uses account-based channel: `${accountId}/accounts/default`
 * - Falls back to "default" if account-based channel doesn't exist
 */
export async function createOrlClient(args: {
  extensionPath?: string;
  storagePath?: string;
}): Promise<OrlClient> {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  let { extensionPath, storagePath } = args;

  // Get extension path if not provided
  if (!extensionPath) {
    try {
      const extension = vscode.extensions.getExtension(
        'gomboc.gomboc-vscode-extension',
      );
      if (extension) {
        extensionPath = extension.extensionPath;
      }
    } catch (e) {
      // Extension not available
    }
  }

  // Get rules service token, falling back to apiKey if not set
  // This allows using the same PAT for both the IDE extension and rules service
  const rulesServiceToken =
    (config.get('orlRulesServiceToken') as string | undefined) ||
    (config.get('apiKey') as string | undefined) ||
    '';

  // Resolve channel name (account-based or override)
  const channel = await ChannelResolver.resolveChannel();

  return new OrlClient({
    containerImage: ORL_CONTAINER_IMAGE,
    rulesServiceUrl: getStringSetting(
      config,
      'orlRulesServiceUrl',
      DEFAULTS.orlRulesServiceUrl,
    ),
    rulesServiceToken,
    channel,
    extensionPath,
    storagePath,
    debugKeepTemp: getBooleanSetting(
      config,
      'orlDebugKeepTemp',
      DEFAULTS.orlDebugKeepTemp,
    ),
    debugPersistDiagnostics: getBooleanSetting(
      config,
      'orlDebugPersistDiagnostics',
      DEFAULTS.orlDebugPersistDiagnostics,
    ),
    twoPassEnabled: getBooleanSetting(
      config,
      'orlTwoPassEnabled',
      DEFAULTS.orlTwoPassEnabled,
    ),
    customRulesOnly: getBooleanSetting(
      config,
      'orlCustomRulesOnly',
      DEFAULTS.orlCustomRulesOnly,
    ),
    customRulesPath: getStringSetting(
      config,
      'orlCustomRulesPath',
      DEFAULTS.orlCustomRulesPath,
    ),
    localDevRulesEnabled: getBooleanSetting(
      config,
      'orlLocalDevRulesEnabled',
      DEFAULTS.orlLocalDevRulesEnabled,
    ),
  });
}

/**
 * Host base directory for ORL persisted data: VS Code global storage when provided,
 * otherwise the same temp fallback as {@link OrlClient} uses when `storagePath` is unset.
 */
export function resolveOrlStorageBase(storagePath?: string): string {
  return (
    (storagePath && storagePath.trim()) ||
    path.join(os.tmpdir(), 'gomboc-vscode-extension')
  );
}

/**
 * Directory that holds all `rules-<hash>/` channel caches. Must match
 * {@link OrlClient} rule cache layout so clear and pull use the same tree.
 */
export function getOrlRulesCacheRoot(storagePath?: string): string {
  return path.join(resolveOrlStorageBase(storagePath), 'orl-rules-cache');
}

/**
 * Remove all cached ORL rules so the next scan triggers a fresh pull.
 * Wipes the entire `orl-rules-cache` directory under the given storagePath
 * (or the OS temp fallback), covering all channel/image variants.
 */
export async function clearOrlRulesCache(storagePath?: string): Promise<void> {
  const cacheRoot = getOrlRulesCacheRoot(storagePath);
  const storageClient = new FileSystemHandler();

  try {
    await storageClient.remove({
      path: cacheRoot,
      opts: { recursive: true, force: true },
    });
    logger.info('ORL rules cache cleared', { cacheRoot });
  } catch (e) {
    logger.warn('Failed to clear ORL rules cache', {
      cacheRoot,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
