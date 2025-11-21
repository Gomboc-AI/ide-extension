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

    // Read hook files - we know exactly where they are
    for (const hookName of hookFiles) {
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

    // Verify all required hooks were found
    const missingHooks: string[] = [];
    for (const hookName of hookFiles) {
      if (!scripts[hookName] || scripts[hookName].trim() === '') {
        missingHooks.push(hookName);
      }
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
      const file = path.join(hooksDir, name);
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
          timeout: 60000, // 60 second timeout
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

        // Clean up temp directory
        //await fs.promises.rm(tempDir, { recursive: true, force: true });

        logger.info('ORL remediation completed', {
          filesModified: Object.keys(modifiedFiles).length,
        });

        return {
          success: true,
          modifiedFiles,
          report: stdout,
          // @ts-ignore add diagnostics for downstream usage
          diagnostics,
        };
      } catch (error: any) {
        // ORL returns exit code 2 when it finds violations (even if it fixes some)
        // This is normal behavior, not an error
        if (error.code === 2 && error.stdout) {
          logger.info('ORL found violations (exit code 2)', {
            stdout: error.stdout,
            stderr: error.stderr,
          });

          // Read modified files directly from temp directory (non-dry-run mode)
          const modifiedFiles = await this.readModifiedFilesFromTemp(tempDir);

          // Attempt to read aggregated diagnostics generated by hooks
          const diagnostics = await this.readDiagnostics(tempDir);

          // Clean up temp directory
          //await fs.promises.rm(tempDir, { recursive: true, force: true });

          logger.info('ORL remediation completed with violations', {
            filesModified: Object.keys(modifiedFiles).length,
          });

          return {
            success: true,
            modifiedFiles,
            report: error.stdout,
            // @ts-ignore add diagnostics for downstream usage
            diagnostics,
          };
        }

        // For other errors, clean up and rethrow
        //await fs.promises.rm(tempDir, { recursive: true, force: true });
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
    const pullCommand = `docker run --rm \
      -v '${rulesDir}:/output' \
      -e RULE_SERVICE_TOKEN='${rulesServiceToken}' \
      ${this.config.containerImage} rules pull --url='${rulesServiceUrl}' --out=/output --channel='${channel}'`;

    logger.info('Pulling rules using ORL', { command: pullCommand });

    try {
      const result = await execAsync(pullCommand);
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

    const command = [
      'docker run --rm',
      `-v '${workspacePath}:/workspace'`,
      containerImage,
      'remediate /workspace --hooks-dir /workspace/.orl/hooks',
    ];

    // Add rulespace if rules directory exists
    if (rulesDir) {
      command[command.length - 1] =
        'remediate /workspace --rulespace /workspace/rules --hooks-dir /workspace/.orl/hooks';
    }

    // Add language if specified
    if (language) {
      command[command.length - 1] += ` --language ${language}`;
    }

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
    const iacExtensions = ['.tf', '.yaml', '.yml'];
    const ext = path.extname(fileName).toLowerCase();

    // For JSON files, only accept CloudFormation templates
    if (ext === '.json') {
      const baseName = path.basename(fileName, ext).toLowerCase();
      // Accept common CloudFormation template names
      return (
        baseName.includes('template') ||
        baseName.includes('cloudformation') ||
        baseName.includes('cfn') ||
        baseName.includes('stack')
      );
    }

    return iacExtensions.includes(ext);
  }

  /**
   * Test ORL connectivity and configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      const testCommand = [
        'docker run --rm',
        `-e RULE_SERVICE_URL="${this.config.rulesServiceUrl}"`,
        `-e RULE_SERVICE_TOKEN="${this.config.rulesServiceToken}"`,
        this.config.containerImage,
        'rules list --help',
      ].join(' ');

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

  return new OrlClient({
    containerImage: config.get('orlContainerImage') || 'gomboc/orl:latest',
    rulesServiceUrl:
      config.get('orlRulesServiceUrl') || 'https://rules.app.gomboc.ai',
    rulesServiceToken: config.get('orlRulesServiceToken') || '',
    channel: config.get('orlChannel') || 'default',
    extensionPath,
  });
}
