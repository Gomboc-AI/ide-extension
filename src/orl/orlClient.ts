import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../utils/logger';
import { parseOrlReport } from '../utils/orlReportParser';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from '../utils/configDefaults';

type SpawnResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

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
  debugKeepTemp?: boolean;
  debugPersistDiagnostics?: boolean;
}

// Pinned ORL container image. Intentionally not configurable via VS Code settings
// to ensure consistent behavior across environments and easier support/debugging.
const ORL_CONTAINER_IMAGE = 'gombocai/orl:v1.0.9-latest';

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
  /**
   * The ORL process exit code, when available.
   * Proposed semantics (client-facing):
   * - 0: success
   * - 1: recoverable failure (e.g., some rules failed to load but scan continued)
   * - 2: unrecoverable failure
   *
   * Note: ORL may not yet implement these semantics consistently; we still surface the raw code.
   */
  exitCode?: number;
  error?: string;
}

export class OrlClient {
  private config: OrlConfig;

  constructor(config: OrlConfig) {
    this.config = config;
  }

  /**
   * Write ORL hooks into the temp workspace so the container can execute them.
   * Hooks will emit aggregated diagnostics at /workspace/.orl/diagnostics/diagnostics.json
   */
  private async writeHooksToTempWorkspace(tempDir: string): Promise<void> {
    const hooksDir = path.join(tempDir, '.orl', 'hooks');
    await fs.promises.mkdir(hooksDir, { recursive: true });

    // Read hook scripts from separate files for maintainability
    const hookFiles = [
      'pre_remediate',
      'pre_remediate_rule',
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
          await fs.promises.access(distHookPath, fs.constants.F_OK);
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
            await fs.promises.access(srcHookPath, fs.constants.F_OK);
            hookPath = srcHookPath;
          } catch (e2) {
            // src path doesn't exist either
          }
        }
      }

      // If we found a path, read the file
      if (hookPath) {
        try {
          const content = await fs.promises.readFile(hookPath, 'utf8');
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
      await fs.promises.writeFile(file, content, {
        encoding: 'utf8',
        mode: 0o755,
      });
      await fs.promises.chmod(file, 0o755);
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
      const exists = await fs.promises
        .access(diagnosticsPath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        return undefined;
      }
      const raw = await fs.promises.readFile(diagnosticsPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      logger.warn('Failed to read diagnostics from hooks', { err });
      return undefined;
    }
  }

  private async readReportFile(tempDir: string): Promise<string | undefined> {
    const reportPath = path.join(tempDir, '.orl', 'report.yaml');
    try {
      await fs.promises.access(reportPath, fs.constants.F_OK);
      const raw = await fs.promises.readFile(reportPath, 'utf8');
      return raw && raw.trim() ? raw : undefined;
    } catch {
      return undefined;
    }
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
      await fs.promises.mkdir(outDir, { recursive: true });

      const copyIfExists = async (rel: string) => {
        const src = path.join(srcDir, rel);
        const dst = path.join(outDir, rel);
        try {
          await fs.promises.access(src, fs.constants.F_OK);
          await fs.promises.mkdir(path.dirname(dst), { recursive: true });
          await fs.promises.copyFile(src, dst);
        } catch {
          // ignore
        }
      };

      await copyIfExists('diagnostics.json');
      await copyIfExists('manifest.jsonl');

      // Persist raw ORL report (best-effort) so we can inspect rule->file attribution after cleanup.
      if (reportText && reportText.trim()) {
        try {
          await fs.promises.writeFile(
            path.join(outDir, 'report.yaml'),
            reportText,
            'utf8',
          );
        } catch {
          // ignore
        }
      }

      // Copy per-rule files list (best-effort; may be large)
      const rulesDir = path.join(srcDir, 'rules');
      try {
        const entries = await fs.promises.readdir(rulesDir, {
          withFileTypes: true,
        });
        const dstRulesDir = path.join(outDir, 'rules');
        await fs.promises.mkdir(dstRulesDir, { recursive: true });
        for (const e of entries) {
          if (!e.isFile()) {
            continue;
          }
          const src = path.join(rulesDir, e.name);
          const dst = path.join(dstRulesDir, e.name);
          await fs.promises.copyFile(src, dst).catch(() => {});
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
      logger.info('Starting ORL remediation', { workspacePath });

      // Create a temporary directory for ORL execution
      const tempDir = path.join(workspacePath, '.orl-temp');
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Copy workspace files to temp directory
      await this.copyWorkspaceFiles(workspacePath, tempDir);

      // Write ORL hook scripts into temp workspace so they are available inside the container
      await this.writeHooksToTempWorkspace(tempDir);

      // Step 1: Pull rules using ORL's built-in rules pull command
      const rulesDir = path.join(tempDir, 'rules');
      await fs.promises.mkdir(rulesDir, { recursive: true });

      await this.pullRulesUsingOrl(rulesDir);

      // Step 2: Execute ORL remediation with pulled rules
      const dockerArgs = this.buildDockerArgs(tempDir, language, rulesDir);
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

      const diagnostics = await this.readDiagnostics(tempDir);
      const reportFile = await this.readReportFile(tempDir);
      const reportText = reportFile || execResult.stdout;

      const changedRelPaths = reportText
        ? this.extractChangedRelativePathsFromReport(reportText)
        : [];
      const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir, {
        onlyRelativePaths: changedRelPaths.length ? changedRelPaths : undefined,
      });

      await this.persistDiagnosticsArtifacts(
        workspacePath,
        tempDir,
        reportText,
      );

      if (!this.config.debugKeepTemp) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } else {
        logger.warn('Debug: preserving .orl-temp after remediation', {
          tempDir,
        });
      }

      const exitCode =
        typeof execResult.exitCode === 'number'
          ? execResult.exitCode
          : undefined;

      // Treat ORL exit codes 0/1/2 as non-fatal for scan execution; anything else is fatal.
      const nonFatal = exitCode === 0 || exitCode === 1 || exitCode === 2;

      const looksLikeRuleLoadFailure = (text: string): boolean => {
        const s = (text || '').toLowerCase();
        if (!s) {
          return false;
        }
        return (
          s.includes('failed to load rule') ||
          s.includes('error loading rule') ||
          s.includes('failed to parse rule') ||
          s.includes('failed to parse ruleset') ||
          s.includes('failed to load ruleset') ||
          (s.includes('ruleset') &&
            s.includes('schema') &&
            s.includes('error')) ||
          (s.includes('yaml') && s.includes('error') && s.includes('rules')) ||
          (s.includes('invalid') && s.includes('ruleset')) ||
          (s.includes('could not load') && s.includes('rule'))
        );
      };

      const ruleLoadFailure =
        exitCode === 1 && looksLikeRuleLoadFailure(execResult.stderr);

      if (execResult.timedOut) {
        logger.error('ORL docker process timed out', {
          timeoutMs: 90000,
          signal: execResult.signal,
        });
      } else if (ruleLoadFailure) {
        logger.warn(
          'ORL exited with code 1 due to rule load error(s); continuing scan with available results',
          { exitCode, stderrPreview: execResult.stderr.slice(0, 2000) },
        );
      } else if (exitCode && exitCode !== 0) {
        logger.info('ORL completed with non-zero exit (continuing)', {
          exitCode,
        });
      }

      if (!nonFatal || execResult.timedOut) {
        return {
          success: false,
          modifiedFiles: {},
          exitCode: 2,
          error: execResult.timedOut
            ? 'ORL execution timed out'
            : `ORL execution failed (exit code ${exitCode ?? 'unknown'})`,
        };
      }

      return {
        success: true,
        modifiedFiles,
        report: reportText,
        exitCode: exitCode ?? 0,
        // Surface recoverable rule-load failures for downstream reporting without blocking the scan.
        error: ruleLoadFailure
          ? `ORL recoverable failure: one or more rules failed to load (exit code ${exitCode}). See logs for details.`
          : undefined,
        // @ts-ignore add diagnostics for downstream usage
        diagnostics,
      };
    } catch (error) {
      logger.error('ORL remediation failed', { error });
      return {
        success: false,
        modifiedFiles: {},
        exitCode:
          typeof (error as any)?.code === 'number' ? (error as any).code : 2,
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

    for (const [fileName, fileType] of files) {
      if (fileType === vscode.FileType.File) {
        const sourceFile = path.join(sourcePath, fileName);
        const destFile = path.join(destPath, fileName);

        // Only copy IaC files
        if (this.isIacFile(fileName)) {
          const content = await fs.promises.readFile(sourceFile);
          await fs.promises.writeFile(destFile, content);
        }
      }
    }
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
    if (!this.isIacFile(base)) {
      throw new Error(`Not an IaC file: ${base}`);
    }
    // Only support copying files within the scan directory (matches our scan scoping).
    const rel = path.relative(sourceDir, abs);
    if (!rel || rel.startsWith('..')) {
      throw new Error('Selected file is not within the scan directory');
    }

    await fs.promises.mkdir(destDir, { recursive: true });
    const destFile = path.join(destDir, rel);
    await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
    const content = await fs.promises.readFile(abs);
    await fs.promises.writeFile(destFile, content);
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
    const dockerArgs: string[] = [
      'run',
      '--rm',
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
    ];

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
      const entries = await fs.promises.readdir(rulesDir, {
        withFileTypes: true,
      });
      // ORL rulespaces typically contain files + directories; we just need "non-empty"
      // to avoid the "search succeeded but returned zero rules" case.
      for (const e of entries) {
        if (e.isFile()) {
          return true;
        }
        if (e.isDirectory()) {
          // If there is any file inside, consider it non-empty.
          const nested = await fs.promises
            .readdir(path.join(rulesDir, e.name))
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
  private buildDockerArgs(
    workspacePath: string,
    language?: string,
    rulesDir?: string,
  ): string[] {
    const { containerImage } = this.config;

    // Note: We don't force --platform to allow Docker to use native architecture
    // This avoids emulation overhead on ARM Macs if the image supports ARM64
    // Docker Desktop on Windows automatically handles path conversion (C:\Users\... -> /c/Users/...)
    const args: string[] = [
      'run',
      '--rm',
      '-v',
      `${workspacePath}:/workspace`,
      containerImage,
      'remediate',
      '/workspace',
      '--hooks-dir',
      '/workspace/.orl/hooks',
    ];

    if (rulesDir) {
      // rulesDir is within the mounted workspacePath, so we reference it at /workspace/rules in-container.
      args.push('--rulespace', '/workspace/rules');
    }
    if (language) {
      args.push('--language', language);
    }

    // Always write the report to a file so we can read/persist it reliably (stdout may be empty/truncated).
    args.push('--out', '/workspace/.orl/report.yaml');
    return args;
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
          await fs.promises.access(filePath, fs.constants.F_OK);
          // Read the modified file content
          const content = await fs.promises.readFile(filePath, 'utf8');

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
    const rules = (parsed as any)?.spec?.rules;
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
   * Recursively get all IaC files from a directory
   */
  private async getAllIacFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip .orl directory and other hidden/system directories
        if (entry.name.startsWith('.') && entry.name !== '.') {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.getAllIacFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isIacFile(entry.name)) {
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

        // Accept file paths that look like IaC files
        // Can be absolute (/workspace/file.tf) or relative (file.tf, ./file.tf)
        const isIacExt =
          trimmedLine.endsWith('.tf') ||
          trimmedLine.endsWith('.yaml') ||
          trimmedLine.endsWith('.yml') ||
          trimmedLine.endsWith('.json');

        // Skip lines with colons that look like YAML key:value pairs
        // But allow paths that might contain colons in certain contexts
        const hasColon = trimmedLine.includes(':');
        const looksLikeYamlKey =
          hasColon &&
          !trimmedLine.startsWith('/') &&
          !trimmedLine.startsWith('./');

        // Accept if it's an IaC file and doesn't look like a YAML key
        if (isIacExt && !looksLikeYamlKey) {
          // Normalize to container workspace path if relative
          currentFile = trimmedLine.startsWith('/workspace/')
            ? trimmedLine
            : trimmedLine.startsWith('./')
              ? `/workspace/${trimmedLine.slice(2)}`
              : `/workspace/${trimmedLine}`;
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

  /**
   * Check if file is an IaC file that ORL can process
   */
  private isIacFile(fileName: string): boolean {
    const fileNameLower = fileName.toLowerCase();
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, ext).toLowerCase();

    // Docker: Dockerfile* (no extension or any extension)
    if (baseName.startsWith('dockerfile')) {
      return true;
    }

    // Terraform: .tf, .hcl, .tfvars
    if (['.tf', '.hcl', '.tfvars'].includes(ext)) {
      return true;
    }

    // Helm: .yaml, .yml, .tpl
    if (['.yaml', '.yml', '.tpl'].includes(ext)) {
      return true;
    }

    // Kubernetes: .yaml, .yml
    if (['.yaml', '.yml'].includes(ext)) {
      return true;
    }

    // CloudFormation: .json (with specific naming patterns)
    if (ext === '.json') {
      return (
        baseName.includes('template') ||
        baseName.includes('cloudformation') ||
        baseName.includes('cfn') ||
        baseName.includes('stack')
      );
    }

    return false;
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
  }): Promise<OrlResult> {
    const { workspacePath, language, ruleName, targetFilePath } = args;
    try {
      logger.info('Starting ORL single-rule remediation', {
        workspacePath,
        ruleName,
        targetFilePath,
      });

      // Use an OS temp directory to avoid contending with .orl-temp from scans.
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'orl-single-rule-'),
      );

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

      // Write ORL hook scripts into temp workspace so they are available inside the container.
      await this.writeHooksToTempWorkspace(tempDir);

      // Pull only this rule into a temp rulespace.
      const rulesDir = path.join(tempDir, 'rules');
      await fs.promises.mkdir(rulesDir, { recursive: true });

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

      let pulledSingleRule = false;
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

      // Execute ORL remediation with pulled rules.
      const dockerArgs = this.buildDockerArgs(tempDir, language, rulesDir);
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

      const diagnostics = await this.readDiagnostics(tempDir);
      const reportFile = await this.readReportFile(tempDir);
      const reportText = reportFile || execResult.stdout;
      const changedRelPaths =
        this.extractChangedRelativePathsFromReport(reportText);
      const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir, {
        onlyRelativePaths: changedRelPaths.length ? changedRelPaths : undefined,
      });

      await this.persistDiagnosticsArtifacts(
        workspacePath,
        tempDir,
        reportText,
      );

      await fs.promises.rm(tempDir, { recursive: true, force: true });

      const exitCode =
        typeof execResult.exitCode === 'number'
          ? execResult.exitCode
          : undefined;
      const nonFatal = exitCode === 0 || exitCode === 1 || exitCode === 2;

      logger.info('ORL single-rule remediation completed', {
        ruleName,
        filesModified: Object.keys(modifiedFiles).length,
        exitCode,
      });

      if (!nonFatal || execResult.timedOut) {
        return {
          success: false,
          modifiedFiles: {},
          exitCode: 2,
          error: execResult.timedOut
            ? 'ORL execution timed out'
            : `ORL execution failed (exit code ${exitCode ?? 'unknown'})`,
        };
      }

      return {
        success: true,
        modifiedFiles,
        report: reportText,
        exitCode: exitCode ?? 0,
        // @ts-ignore add diagnostics for downstream usage
        diagnostics,
      };
    } catch (error: any) {
      logger.error('ORL single-rule remediation failed', {
        ruleName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        modifiedFiles: {},
        exitCode:
          typeof (error as any)?.code === 'number' ? (error as any).code : 2,
        error:
          error instanceof Error
            ? error.message
            : 'ORL single-rule remediation failed',
      };
    }
  }
}

/**
 * Factory function to create OrlClient from VS Code configuration
 */
export function createOrlClient(extensionPath?: string): OrlClient {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');

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

  return new OrlClient({
    containerImage: ORL_CONTAINER_IMAGE,
    rulesServiceUrl: getStringSetting(
      config,
      'orlRulesServiceUrl',
      DEFAULTS.orlRulesServiceUrl,
    ),
    rulesServiceToken,
    channel: config.get('orlChannel') || 'default',
    extensionPath,
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
  });
}
