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
  rulesServiceAccountId: string;
  channel: string;
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

        // Parse ORL output to extract modified files
        const modifiedFiles = this.parseOrlOutput(stdout);

        // Clean up temp directory
        await fs.promises.rm(tempDir, { recursive: true, force: true });

        logger.info('ORL remediation completed', {
          filesModified: Object.keys(modifiedFiles).length,
        });

        return {
          success: true,
          modifiedFiles,
          report: stdout,
        };
      } catch (error: any) {
        // ORL returns exit code 2 when it finds violations (even if it fixes some)
        // This is normal behavior, not an error
        if (error.code === 2 && error.stdout) {
          logger.info('ORL found violations (exit code 2)', {
            stdout: error.stdout,
            stderr: error.stderr,
          });

          // Parse ORL output to extract modified files
          const modifiedFiles = this.parseOrlOutput(error.stdout);

          // Clean up temp directory
          await fs.promises.rm(tempDir, { recursive: true, force: true });

          logger.info('ORL remediation completed with violations', {
            filesModified: Object.keys(modifiedFiles).length,
          });

          return {
            success: true,
            modifiedFiles,
            report: error.stdout,
          };
        }

        // For other errors, clean up and rethrow
        await fs.promises.rm(tempDir, { recursive: true, force: true });
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
    const {
      rulesServiceUrl,
      rulesServiceToken,
      rulesServiceAccountId,
      channel,
    } = this.config;

    // reuse ORL's rules pull command
    const pullCommand = `docker run --rm \
      -v '${rulesDir}:/output' \
      -e RULE_SERVICE_TOKEN='${rulesServiceToken}' \
      -e RULE_SERVICE_ACCOUNT_ID='${rulesServiceAccountId}' \
      gomboc/orl:latest rules pull --url='${rulesServiceUrl}' --out=/output --channel='${channel}'`;

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
    const {
      containerImage,
      rulesServiceUrl,
      rulesServiceToken,
      rulesServiceAccountId,
    } = this.config;

    const command = [
      'docker run --rm',
      `-v '${workspacePath}:/workspace'`,
      containerImage,
      'remediate /workspace --dry-run',
    ];

    // Add rulespace if rules directory exists
    if (rulesDir) {
      command[command.length - 1] =
        'remediate /workspace --dry-run --rulespace /workspace/rules';
    }

    // Add language if specified
    if (language) {
      command[command.length - 1] += ` --language ${language}`;
    }

    return command.join(' ');
  }

  /**
   * Parse ORL dry-run output to extract modified files
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

        // Only accept lines that look like actual file paths
        if (
          (trimmedLine.startsWith('/') && trimmedLine.includes('.')) ||
          (trimmedLine.includes('.tf') && !trimmedLine.includes(':')) ||
          (trimmedLine.includes('.yaml') && !trimmedLine.includes(':')) ||
          (trimmedLine.includes('.json') && !trimmedLine.includes(':'))
        ) {
          currentFile = trimmedLine;
          inFileContent = true;
          logger.info('Found file path', { file: currentFile });
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
        `-e RULE_SERVICE_ACCOUNT_ID="${this.config.rulesServiceAccountId}"`,
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
export function createOrlClient(): OrlClient {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');

  return new OrlClient({
    containerImage: config.get('orlContainerImage') || 'gomboc/orl:latest',
    rulesServiceUrl:
      config.get('orlRulesServiceUrl') || 'https://rules.app.gomboc.ai',
    rulesServiceToken: config.get('orlRulesServiceToken') || '',
    rulesServiceAccountId: config.get('orlRulesServiceAccountId') || '',
    channel: config.get('orlChannel') || 'default',
  });
}
