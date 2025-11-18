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
    const scripts: Record<string, string> = {
      pre_remediate: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics/rules" "$BASE/.orl/diag/rules"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
: > "$manifest"
rules="\${1:-0}"; workspaces="\${2:-0}"
case "$rules" in ''|*[!0-9]*) rules=0;; esac
case "$workspaces" in ''|*[!0-9]*) workspaces=0;; esac
printf '{"event":"pre_remediate","rules":%s,"workspaces":%s,"time":"%s"}\n' "$rules" "$workspaces" "$(timestamp)" >> "$manifest"
`,
      pre_remediate_rule: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
rule="\${1:-unknown}"; prio="\${2:-0}"
case "$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=$(json_escape "$rule")
printf '{"event":"pre_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\n' "$rule_esc" "$prio" "$(timestamp)" >> "$manifest"
# Snapshot current workspace for this rule's baseline
snapDir="$BASE/.orl/diag/rules/$rule_esc/before"
mkdir -p "$snapDir"
# Copy only IaC files; preserve directory structure
cd "$BASE"
find . -type d -name ".orl" -prune -o -type f \\( -name "*.tf" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \\) -print | while IFS= read -r f; do
  # Remove leading ./ from path
  rel_path=$(echo "$f" | sed 's|^\\./||')
  dest="$snapDir/$rel_path"
  mkdir -p "$(dirname "$dest")"
  cp "$f" "$dest" 2>/dev/null || true
done
`,
      post_remediate_rule: `#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
rule="\${1:-unknown}"; prio="\${2:-0}"; files_csv="\${3:-}"
case "$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=$(json_escape "$rule")
printf '{"event":"post_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\n' "$rule_esc" "$prio" "$(timestamp)" >> "$manifest" || true
# Build per-rule JSON with file paths (IDE will handle diffing)
rulesOut="$BASE/.orl/diagnostics/rules"
mkdir -p "$rulesOut" || true
# Sanitize rule name for filename (replace problematic chars)
rule_file=$(printf '%s' "$rule" | sed 's/[^a-zA-Z0-9._-]/_/g' | head -c 200)
ruleJson="$rulesOut/$rule_file.json"
ruleJsonTmp="$ruleJson.tmp"
printf '{"ruleName":"%s","priority":%s,"files":[' "$rule_esc" "$prio" > "$ruleJsonTmp" || true
firstFile=1
if [ -n "$files_csv" ]; then
  OLDIFS=$IFS
  IFS=','; set -- $files_csv; IFS=$OLDIFS
  for p in "$@"; do
    t=$(printf '%s' "$p" | sed -e 's/^ *//' -e 's/ *$//' || echo "")
    [ -z "$t" ] && continue
    if [ "$firstFile" -eq 0 ]; then printf ',' >> "$ruleJsonTmp" || true; fi
    firstFile=0
    fileEsc=$(printf '%s' "$t" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g' || echo "$t")
    printf '{"path":"%s"}' "$fileEsc" >> "$ruleJsonTmp" || true
  done
fi
printf ']}\n' >> "$ruleJsonTmp" || true
mv "$ruleJsonTmp" "$ruleJson" 2>/dev/null || cp "$ruleJsonTmp" "$ruleJson" || true
`,
      post_remediate: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "$BASE/.orl/diagnostics" "$BASE/.orl/diag"
manifest="$BASE/.orl/diagnostics/manifest.jsonl"
aggregate="$BASE/.orl/diagnostics/diagnostics.json"
rules="\${1:-0}"
case "$rules" in ''|*[!0-9-]*) rules=0;; esac
printf '{"event":"post_remediate","rulesExecuted":%s,"time":"%s"}\n' "$rules" "$(timestamp)" >> "$manifest"
# Aggregate per-rule JSON files into final diagnostics
rulesDir="$BASE/.orl/diagnostics/rules"
{
  printf '{'
  printf '"version":1,'
  printf '"generatedAt":"%s",' "$(timestamp)"
  printf '"rules":['
  first=1
  for f in "$rulesDir"/*.json; do
    if [ ! -f "$f" ]; then continue; fi
    if [ $first -eq 0 ]; then printf ','; fi
    first=0
    cat "$f"
  done
  printf ']}\n'
} > "$aggregate"
`,
    };
    for (const [name, content] of Object.entries(scripts)) {
      const file = path.join(hooksDir, name);
      await fs.promises.writeFile(file, content, { encoding: 'utf8', mode: 0o755 });
      await fs.promises.chmod(file, 0o755);
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

        // Parse ORL output to extract modified files
        const modifiedFiles = this.parseOrlOutput(stdout);

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

          // Parse ORL output to extract modified files
          const modifiedFiles = this.parseOrlOutput(error.stdout);

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
      'remediate /workspace --dry-run --hooks-dir /workspace/.orl/hooks',
    ];

    // Add rulespace if rules directory exists
    if (rulesDir) {
      command[command.length - 1] =
        'remediate /workspace --dry-run --rulespace /workspace/rules --hooks-dir /workspace/.orl/hooks';
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
        const looksLikeYamlKey = hasColon && !trimmedLine.startsWith('/') && !trimmedLine.startsWith('./');
        
        // Accept if it's an IaC file and doesn't look like a YAML key
        if (isIacExt && !looksLikeYamlKey) {
          // Normalize to container workspace path if relative
          currentFile = trimmedLine.startsWith('/workspace/') 
            ? trimmedLine 
            : trimmedLine.startsWith('./') 
              ? `/workspace/${trimmedLine.slice(2)}`
              : `/workspace/${trimmedLine}`;
          inFileContent = true;
          logger.info('Found file path', { file: currentFile, original: trimmedLine });
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
export function createOrlClient(): OrlClient {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');

  return new OrlClient({
    containerImage: config.get('orlContainerImage') || 'gomboc/orl:latest',
    rulesServiceUrl:
      config.get('orlRulesServiceUrl') || 'https://rules.app.gomboc.ai',
    rulesServiceToken: config.get('orlRulesServiceToken') || '',
    channel: config.get('orlChannel') || 'default',
  });
}
