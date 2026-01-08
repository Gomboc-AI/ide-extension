import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../utils/logger';

const execAsync = promisify(exec);

export interface OrlConfig {
  containerImage: string;
  rulesServiceUrl: string;
  rulesServiceToken: string;
  channel: string;
  extensionPath?: string; // Path to extension directory (from context.extensionPath)
  debugKeepTemp?: boolean;
  debugPersistDiagnostics?: boolean;
}

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
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
      const dockerCommand = this.buildDockerCommand(
        tempDir,
        language,
        rulesDir,
      );
      logger.info('Executing Docker command', { command: dockerCommand });

      try {
        const { stdout, stderr } = await execAsync(dockerCommand, {
          timeout: 90000, // 90 second timeout - hooks add overhead but shouldn't take this long
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer (default is 1MB, hooks produce more output)
          cwd: workspacePath,
        });

        if (stderr && !stderr.includes('WARN')) {
          logger.warn('ORL execution warnings', { stderr });
        }

        // Read modified files directly from temp directory (non-dry-run mode)
        // Files are actually modified in .orl-temp, so we can read them directly
        const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir);

        // Attempt to read aggregated diagnostics generated by hooks
        const diagnostics = await this.readDiagnostics(tempDir);
        const reportFile = await this.readReportFile(tempDir);

        // Persist diagnostics for debugging (best-effort) before cleanup
        await this.persistDiagnosticsArtifacts(
          workspacePath,
          tempDir,
          reportFile || stdout,
        );

        // Clean up temp directory
        if (!this.config.debugKeepTemp) {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        } else {
          logger.warn('Debug: preserving .orl-temp after remediation', {
            tempDir,
          });
        }

        logger.info('ORL remediation completed', {
          filesModified: Object.keys(modifiedFiles).length,
        });

        return {
          success: true,
          modifiedFiles,
          report: reportFile || stdout,
          // @ts-ignore add diagnostics for downstream usage
          diagnostics,
        };
      } catch (error: any) {
        // Handle SIGPIPE - if process was killed but files might have been modified
        if (error.signal === 'SIGPIPE' || error.signal === 'SIGTERM') {
          logger.warn(
            'ORL process was interrupted (SIGPIPE/SIGTERM), checking for modified files',
            {
              signal: error.signal,
            },
          );

          // Try to read modified files anyway - ORL might have completed before the pipe closed
          const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir);
          const diagnostics = await this.readDiagnostics(tempDir);
          const reportFile = await this.readReportFile(tempDir);

          await this.persistDiagnosticsArtifacts(
            workspacePath,
            tempDir,
            reportFile || error.stdout,
          );

          // If we got some results, treat it as success
          if (Object.keys(modifiedFiles).length > 0) {
            logger.info(
              'ORL remediation completed despite signal interruption',
              {
                filesModified: Object.keys(modifiedFiles).length,
              },
            );

            // Clean up temp directory
            if (!this.config.debugKeepTemp) {
              await fs.promises.rm(tempDir, { recursive: true, force: true });
            } else {
              logger.warn('Debug: preserving .orl-temp after remediation', {
                tempDir,
              });
            }

            return {
              success: true,
              modifiedFiles,
              report: reportFile || error.stdout || '',
              // @ts-ignore add diagnostics for downstream usage
              diagnostics,
            };
          }

          // No files modified, treat as failure
          await fs.promises.rm(tempDir, { recursive: true, force: true });
          throw new Error(
            `ORL process was interrupted (${error.signal}). This may indicate the process was killed due to timeout or output buffer overflow.`,
          );
        }

        // ORL non-zero exit codes semantics:
        // - code 1: fixes < findings (partial remediation) -> treat as success
        // - code 2: violations found (legacy behavior)     -> treat as success
        if ((error.code === 1 || error.code === 2) && error.stdout) {
          logger.info('ORL found violations (exit code 2)', {
            stdout: error.stdout,
            stderr: error.stderr,
          });

          // Read modified files directly from temp directory (non-dry-run mode)
          const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir);

          // Attempt to read aggregated diagnostics generated by hooks
          const diagnostics = await this.readDiagnostics(tempDir);
          const reportFile = await this.readReportFile(tempDir);

          await this.persistDiagnosticsArtifacts(
            workspacePath,
            tempDir,
            reportFile || error.stdout,
          );

          // Clean up temp directory
          if (!this.config.debugKeepTemp) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
          } else {
            logger.warn('Debug: preserving .orl-temp after remediation', {
              tempDir,
            });
          }

          logger.info(
            'ORL remediation completed with non-zero exit (expected)',
            {
              filesModified: Object.keys(modifiedFiles).length,
              exitCode: error.code,
            },
          );

          return {
            success: true,
            modifiedFiles,
            report: reportFile || error.stdout,
            // @ts-ignore add diagnostics for downstream usage
            diagnostics,
          };
        }

        // For other errors, clean up and rethrow
        const reportFile = await this.readReportFile(tempDir);
        await this.persistDiagnosticsArtifacts(
          workspacePath,
          tempDir,
          reportFile || error.stdout,
        );
        if (!this.config.debugKeepTemp) {
          await fs.promises.rm(tempDir, { recursive: true, force: true });
        } else {
          logger.warn('Debug: preserving .orl-temp after remediation', {
            tempDir,
          });
        }
        throw error;
      }
    } catch (error) {
      logger.error('ORL remediation failed', { error });
      return {
        success: false,
        modifiedFiles: {},
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
   * Pull rules
   */
  private async pullRulesUsingOrl(rulesDir: string): Promise<void> {
    const { rulesServiceUrl, rulesServiceToken, channel } = this.config;

    // reuse ORL's rules pull command
    // Note: We don't force --platform to allow Docker to use native architecture
    const commandParts = ['docker run --rm'];
    commandParts.push(
      `-v '${rulesDir}:/output'`,
      `-e RULE_SERVICE_TOKEN='${rulesServiceToken}'`,
      `${this.config.containerImage} rules pull --url='${rulesServiceUrl}' --out=/output --channel='${channel}'`,
    );
    const pullCommand = commandParts.join(' \\\n      ');

    logger.info('Pulling rules using ORL', { command: pullCommand });

    try {
      const result = await execAsync(pullCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for verbose output
      });
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

  /**
   * Build Docker command for ORL execution
   */
  private buildDockerCommand(
    workspacePath: string,
    language?: string,
    rulesDir?: string,
  ): string {
    const { containerImage } = this.config;

    // Note: We don't force --platform to allow Docker to use native architecture
    // This avoids emulation overhead on ARM Macs if the image supports ARM64
    // Docker Desktop on Windows automatically handles path conversion (C:\Users\... -> /c/Users/...)
    const command: string[] = ['docker run --rm'];
    command.push(
      `-v '${workspacePath}:/workspace'`,
      containerImage,
      'remediate /workspace --hooks-dir /workspace/.orl/hooks',
    );

    // Add rulespace if rules directory exists
    if (rulesDir) {
      command[command.length - 1] =
        'remediate /workspace --rulespace /workspace/rules --hooks-dir /workspace/.orl/hooks';
    }

    // Add language if specified
    if (language) {
      command[command.length - 1] += ` --language ${language}`;
    }

    // Always write the report to a file so we can read/persist it reliably (stdout may be empty/truncated).
    command[command.length - 1] += ' --out /workspace/.orl/report.yaml';

    return command.join(' ');
  }

  /**
   * Read modified files directly from the temp directory (non-dry-run mode)
   */
  private async readModifiedFilesFromTemp(
    tempDir: string,
  ): Promise<{ [filePath: string]: string }> {
    const modifiedFiles: { [filePath: string]: string } = {};

    try {
      // Read all IaC files from temp directory
      const files = await this.getAllIacFiles(tempDir);

      for (const filePath of files) {
        try {
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
        files: Object.keys(modifiedFiles),
      });
    } catch (error) {
      logger.error('Failed to read modified files from temp directory', {
        error,
      });
    }

    return modifiedFiles;
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
      const testCommandParts: string[] = ['docker run --rm'];
      testCommandParts.push(
        `-e RULE_SERVICE_URL="${this.config.rulesServiceUrl}"`,
        `-e RULE_SERVICE_TOKEN="${this.config.rulesServiceToken}"`,
        this.config.containerImage,
        'rules list --help',
      );
      const testCommand = testCommandParts.join(' ');

      await execAsync(testCommand, { timeout: 30000 });
      return true;
    } catch (error) {
      logger.error('ORL connection test failed', { error });
      return false;
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
    containerImage: config.get('orlContainerImage') || 'gomboc/orl:latest',
    rulesServiceUrl:
      config.get('orlRulesServiceUrl') || 'https://rules.app.gomboc.ai',
    rulesServiceToken,
    channel: config.get('orlChannel') || 'default',
    extensionPath,
    debugKeepTemp:
      (config.get('orlDebugKeepTemp') as boolean | undefined) || false,
    debugPersistDiagnostics:
      (config.get('orlDebugPersistDiagnostics') as boolean | undefined) ??
      false,
  });
}
