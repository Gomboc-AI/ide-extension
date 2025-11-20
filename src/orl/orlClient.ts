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

    // Try to read hook files from the source directory (for development)
    // or use legacy inline scripts as fallback
    for (const hookName of hookFiles) {
      // Try multiple possible paths
      const possiblePaths = [
        path.join(__dirname, 'hooks', `${hookName}.sh`),
        path.join(process.cwd(), 'src', 'orl', 'hooks', `${hookName}.sh`),
      ];

      let found = false;
      for (const hookPath of possiblePaths) {
        try {
          const content = await fs.promises.readFile(hookPath, 'utf8');
          scripts[hookName] = content;
          found = true;
          break;
        } catch (error) {
          // Try next path
        }
      }

      if (!found) {
        logger.warn(
          `Failed to read hook file for ${hookName}, using legacy script`,
        );
      }
    }

    // Legacy inline scripts (used as fallback if hook files aren't found)
    const legacyScripts: Record<string, string> = {
      pre_remediate: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "\$BASE/.orl/diagnostics/rules" "\$BASE/.orl/diag/rules"
manifest="\$BASE/.orl/diagnostics/manifest.jsonl"
: > "\$manifest"
rules="\${1:-0}"; workspaces="\${2:-0}"
case "\$rules" in ''|*[!0-9]*) rules=0;; esac
case "\$workspaces" in ''|*[!0-9]*) workspaces=0;; esac
printf '{"event":"pre_remediate","rules":%s,"workspaces":%s,"time":"%s"}\\n' "\$rules" "\$workspaces" "\$(timestamp)" >> "\$manifest"
`,
      pre_remediate_rule: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "\$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "\$BASE/.orl/diagnostics" "\$BASE/.orl/diag"
manifest="\$BASE/.orl/diagnostics/manifest.jsonl"
rule="\${1:-unknown}"; prio="\${2:-0}"
case "\$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=\$(json_escape "\$rule")
printf '{"event":"pre_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\\n' "\$rule_esc" "\$prio" "\$(timestamp)" >> "\$manifest"
# Snapshot current workspace for this rule's baseline
snapDir="\$BASE/.orl/diag/rules/\$rule_esc/before"
mkdir -p "\$snapDir"
# Copy only IaC files; preserve directory structure
cd "\$BASE"
find . -type d -name ".orl" -prune -o -type f \\( -name "*.tf" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \\) -print | while IFS= read -r f; do
  # Remove leading ./ from path
  rel_path=\$(echo "\$f" | sed 's|^\\./||')
  dest="\$snapDir/\$rel_path"
  mkdir -p "\$(dirname "\$dest")"
  cp "\$f" "\$dest" 2>/dev/null || true
done
`,
      post_remediate_rule: `#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "\$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
mkdir -p "\$BASE/.orl/diagnostics" "\$BASE/.orl/diag"
manifest="\$BASE/.orl/diagnostics/manifest.jsonl"
rule="\${1:-unknown}"; prio="\${2:-0}"; files_csv="\${3:-}"
case "\$prio" in ''|*[!0-9-]*) prio=0;; esac
rule_esc=\$(json_escape "\$rule")
printf '{"event":"post_remediate_rule","ruleName":"%s","priority":%s,"time":"%s"}\\n' "\$rule_esc" "\$prio" "\$(timestamp)" >> "\$manifest" || true

# Build per-rule JSON with file paths and resource instances
rulesOut="\$BASE/.orl/diagnostics/rules"
ruleDir="\$rulesOut/\$rule_esc"
mkdir -p "\$rulesOut" "\$ruleDir" || true

# Sanitize rule name for filename
rule_file=\$(printf '%s' "\$rule" | sed 's/[^a-zA-Z0-9._-]/_/g' | head -c 200)
ruleJson="\$rulesOut/\$rule_file.json"
ruleJsonTmp="\$ruleJson.tmp"

# Read modified resources if available
modified_resources="\$ruleDir/resources_modified.json"
if [ -f "\$modified_resources" ] && command -v jq >/dev/null 2>&1; then
  # Include resource instances in the JSON
  printf '{"ruleName":"%s","priority":%s,"files":[' "\$rule_esc" "\$prio" > "\$ruleJsonTmp" || true
  firstFile=1
  
  if [ -n "\$files_csv" ]; then
    OLDIFS=\$IFS
    IFS=','; set -- \$files_csv; IFS=\$OLDIFS
    for p in "\$@"; do
      t=\$(printf '%s' "\$p" | sed -e 's/^ *//' -e 's/ *\$//' || echo "")
      [ -z "\$t" ] && continue
      
      # Normalize path
      if [ "\${t#/workspace/}" != "\$t" ]; then
        normalized_path="\${t#/workspace/}"
      elif [ "\${t#./}" != "\$t" ]; then
        normalized_path="\${t#./}"
      else
        normalized_path="\$t"
      fi
      
      if [ "\$firstFile" -eq 0 ]; then printf ',' >> "\$ruleJsonTmp" || true; fi
      firstFile=0
      
      fileEsc=\$(json_escape "\$normalized_path")
      
      # Get resources for this file from modified_resources
      resources_json=\$(jq -r --arg file "\$normalized_path" '.[\$file] // []' "\$modified_resources" 2>/dev/null || echo "[]")
      
      printf '{"path":"%s","resources":%s}' "\$fileEsc" "\$resources_json" >> "\$ruleJsonTmp" || true
    done
  fi
  printf ']}\\n' >> "\$ruleJsonTmp" || true
else
  # Fallback: no resource instances, just file paths
  printf '{"ruleName":"%s","priority":%s,"files":[' "\$rule_esc" "\$prio" > "\$ruleJsonTmp" || true
  firstFile=1
  if [ -n "\$files_csv" ]; then
    OLDIFS=\$IFS
    IFS=','; set -- \$files_csv; IFS=\$OLDIFS
    for p in "\$@"; do
      t=\$(printf '%s' "\$p" | sed -e 's/^ *//' -e 's/ *\$//' || echo "")
      [ -z "\$t" ] && continue
      if [ "\$firstFile" -eq 0 ]; then printf ',' >> "\$ruleJsonTmp" || true; fi
      firstFile=0
      fileEsc=\$(printf '%s' "\$t" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g' || echo "\$t")
      printf '{"path":"%s","resources":[]}' "\$fileEsc" >> "\$ruleJsonTmp" || true
    done
  fi
  printf ']}\\n' >> "\$ruleJsonTmp" || true
fi

mv "\$ruleJsonTmp" "\$ruleJson" 2>/dev/null || cp "\$ruleJsonTmp" "\$ruleJson" || true
`,
      pre_remediate_rule_finding: `#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "\$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="\${1:-unknown}"; prio="\${2:-0}"; files_csv="\${3:-}"
rule_esc=\$(json_escape "\$rule")
ruleDir="\$BASE/.orl/diagnostics/rules/\$rule_esc"
mkdir -p "\$ruleDir" || true

# Function to extract resource content hash (for comparison)
get_resource_hash() {
  file_path="\$1"
  start_line="\$2"
  end_line="\$3"
  if [ ! -f "\$file_path" ] || [ \$start_line -le 0 ] || [ \$end_line -lt \$start_line ]; then
    echo ""
    return 0
  fi
  sed -n "\${start_line},\${end_line}p" "\$file_path" 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1 || echo ""
}

# Function to extract Terraform resource instances from a file
# Outputs JSON array of resources with content hash: [{"type":"...","name":"...","startLine":N,"endLine":M,"hash":"..."}]
extract_resources() {
  file_path="\$1"
  if [ ! -f "\$file_path" ]; then return 0; fi
  
  # Only process Terraform files
  case "\$file_path" in
    *.tf) ;;
    *) return 0 ;;
  esac
  
  line_num=0
  in_resource=0
  resource_type=""
  resource_name=""
  resource_start=0
  brace_depth=0
  
  while IFS= read -r line || [ -n "\$line" ]; do
    line_num=\$((line_num + 1))
    
    # Check for resource definition: resource "type" "name" {
    if echo "\$line" | grep -qE '^[[:space:]]*resource[[:space:]]+"[^"]+"[[:space:]]+"[^"]+"[[:space:]]*\{'; then
      # Extract type and name (using basic sed for compatibility)
      resource_type=\$(echo "\$line" | sed -n 's/.*resource[[:space:]]*"\\([^"]*\\)".*/\\1/p')
      resource_name=\$(echo "\$line" | sed -n 's/.*resource[[:space:]]*"[^"]*"[[:space:]]*"\\([^"]*\\)".*/\\1/p')
      resource_start=\$line_num
      in_resource=1
      brace_depth=1
      continue
    fi
    
    # If we're in a resource block, track braces
    if [ \$in_resource -eq 1 ]; then
      # Count opening and closing braces on this line
      open_braces=\$(echo "\$line" | tr -cd '{' | wc -c)
      close_braces=\$(echo "\$line" | tr -cd '}' | wc -c)
      brace_depth=\$((brace_depth + open_braces - close_braces))
      
      # If brace depth reaches 0, we've found the end of the resource
      if [ \$brace_depth -le 0 ]; then
        # Get content hash for comparison
        content_hash=\$(get_resource_hash "\$file_path" "\$resource_start" "\$line_num")
        # Output the resource as JSON (with newline for line-by-line reading)
        type_esc=\$(json_escape "\$resource_type")
        name_esc=\$(json_escape "\$resource_name")
        printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":"%s"}\\n' "\$type_esc" "\$name_esc" "\$resource_start" "\$line_num" "\$content_hash"
        in_resource=0
        resource_type=""
        resource_name=""
        resource_start=0
        brace_depth=0
      fi
    fi
  done < "\$file_path"
}

# Extract resources from all files with findings
resources_json="\$ruleDir/resources_before.json"
printf '{' > "\$resources_json.tmp" || true
first_file=1

if [ -n "\$files_csv" ]; then
  OLDIFS=\$IFS
  IFS=','; set -- \$files_csv; IFS=\$OLDIFS
  for file_path in "\$@"; do
    file_path=\$(printf '%s' "\$file_path" | sed -e 's/^ *//' -e 's/ *\$//')
    [ -z "\$file_path" ] && continue
    
    # Normalize path (remove /workspace prefix if present, add if missing)
    if [ "\${file_path#/workspace/}" != "\$file_path" ]; then
      normalized_path="\${file_path#/workspace/}"
    elif [ "\${file_path#./}" != "\$file_path" ]; then
      normalized_path="\${file_path#./}"
    else
      normalized_path="\$file_path"
    fi
    full_path="\$BASE/\$normalized_path"
    
    if [ ! -f "\$full_path" ]; then continue; fi
    
    if [ \$first_file -eq 0 ]; then printf ',' >> "\$resources_json.tmp" || true; fi
    first_file=0
    
    file_esc=\$(json_escape "\$normalized_path")
    printf '"%s":[' "\$file_esc" >> "\$resources_json.tmp" || true
    
    first_resource=1
    # Extract resources and write to temp file (capture stderr for debugging)
    extract_resources "\$full_path" > "\$ruleDir/tmp_resources.txt" 2>"\$ruleDir/tmp_resources.err" || true
    # Read resources line by line (each resource is on its own line)
    while IFS= read -r resource_json || [ -n "\$resource_json" ]; do
      [ -z "\$resource_json" ] && continue
      if [ \$first_resource -eq 0 ]; then printf ',' >> "\$resources_json.tmp" || true; fi
      first_resource=0
      printf '%s' "\$resource_json" >> "\$resources_json.tmp" || true
    done < "\$ruleDir/tmp_resources.txt" 2>/dev/null || true
    rm -f "\$ruleDir/tmp_resources.txt" "\$ruleDir/tmp_resources.err" 2>/dev/null || true
    
    printf ']' >> "\$resources_json.tmp" || true
  done
fi

printf '}\\n' >> "\$resources_json.tmp" || true
mv "\$resources_json.tmp" "\$resources_json" 2>/dev/null || cp "\$resources_json.tmp" "\$resources_json" || true
`,
      post_remediate_rule_finding: `#!/bin/sh
set -e
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
json_escape() { printf '%s' "\$1" | sed -e 's/[\\\\]/\\\\\\\\/g' -e 's/"/\\"/g'; }
BASE="/workspace"
rule="\${1:-unknown}"; prio="\${2:-0}"; files_csv="\${3:-}"
rule_esc=\$(json_escape "\$rule")
ruleDir="\$BASE/.orl/diagnostics/rules/\$rule_esc"
mkdir -p "\$ruleDir" || true

# Function to extract resource content hash (for comparison)
get_resource_hash() {
  file_path="\$1"
  start_line="\$2"
  end_line="\$3"
  if [ ! -f "\$file_path" ] || [ \$start_line -le 0 ] || [ \$end_line -lt \$start_line ]; then
    echo ""
    return 0
  fi
  sed -n "\${start_line},\${end_line}p" "\$file_path" 2>/dev/null | md5sum 2>/dev/null | cut -d' ' -f1 || echo ""
}

# Function to extract resources (same as pre_remediate_rule_finding, with hash)
extract_resources() {
  file_path="\$1"
  if [ ! -f "\$file_path" ]; then return 0; fi
  
  case "\$file_path" in
    *.tf) ;;
    *) return 0 ;;
  esac
  
  line_num=0
  in_resource=0
  resource_type=""
  resource_name=""
  resource_start=0
  brace_depth=0
  
  while IFS= read -r line || [ -n "\$line" ]; do
    line_num=\$((line_num + 1))
    
    if echo "\$line" | grep -qE '^[[:space:]]*resource[[:space:]]+"[^"]+"[[:space:]]+"[^"]+"[[:space:]]*\{'; then
      resource_type=\$(echo "\$line" | sed -n 's/.*resource[[:space:]]*"\\([^"]*\\)".*/\\1/p')
      resource_name=\$(echo "\$line" | sed -n 's/.*resource[[:space:]]*"[^"]*"[[:space:]]*"\\([^"]*\\)".*/\\1/p')
      resource_start=\$line_num
      in_resource=1
      brace_depth=1
      continue
    fi
    
    if [ \$in_resource -eq 1 ]; then
      open_braces=\$(echo "\$line" | tr -cd '{' | wc -c)
      close_braces=\$(echo "\$line" | tr -cd '}' | wc -c)
      brace_depth=\$((brace_depth + open_braces - close_braces))
      
      if [ \$brace_depth -le 0 ]; then
        # Get content hash for comparison
        content_hash=\$(get_resource_hash "\$file_path" "\$resource_start" "\$line_num")
        type_esc=\$(json_escape "\$resource_type")
        name_esc=\$(json_escape "\$resource_name")
        printf '{"type":"%s","name":"%s","startLine":%d,"endLine":%d,"hash":"%s"}\\n' "\$type_esc" "\$name_esc" "\$resource_start" "\$line_num" "\$content_hash"
        in_resource=0
        resource_type=""
        resource_name=""
        resource_start=0
        brace_depth=0
      fi
    fi
  done < "\$file_path"
}

# Read before snapshot
before_json="\$ruleDir/resources_before.json"
modified_json="\$ruleDir/resources_modified.json"
current_json="\$ruleDir/resources_after.json"

# Extract current resources
printf '{' > "\$current_json.tmp" || true
first_file=1

if [ -n "\$files_csv" ]; then
  OLDIFS=\$IFS
  IFS=','; set -- \$files_csv; IFS=\$OLDIFS
  for file_path in "\$@"; do
    file_path=\$(printf '%s' "\$file_path" | sed -e 's/^ *//' -e 's/ *\$//')
    [ -z "\$file_path" ] && continue
    
    if [ "\${file_path#/workspace/}" != "\$file_path" ]; then
      normalized_path="\${file_path#/workspace/}"
    elif [ "\${file_path#./}" != "\$file_path" ]; then
      normalized_path="\${file_path#./}"
    else
      normalized_path="\$file_path"
    fi
    full_path="\$BASE/\$normalized_path"
    
    if [ ! -f "\$full_path" ]; then continue; fi
    
    if [ \$first_file -eq 0 ]; then printf ',' >> "\$current_json.tmp" || true; fi
    first_file=0
    
    file_esc=\$(json_escape "\$normalized_path")
    printf '"%s":[' "\$file_esc" >> "\$current_json.tmp" || true
    
    first_resource=1
    # Extract resources and write to temp file
    extract_resources "\$full_path" > "\$ruleDir/tmp_resources_after.txt" 2>"\$ruleDir/tmp_resources_after.err" || true
    # Read resources line by line (each resource is on its own line)
    while IFS= read -r resource_json || [ -n "\$resource_json" ]; do
      [ -z "\$resource_json" ] && continue
      if [ \$first_resource -eq 0 ]; then printf ',' >> "\$current_json.tmp" || true; fi
      first_resource=0
      printf '%s' "\$resource_json" >> "\$current_json.tmp" || true
    done < "\$ruleDir/tmp_resources_after.txt" 2>/dev/null || true
    rm -f "\$ruleDir/tmp_resources_after.txt" "\$ruleDir/tmp_resources_after.err" 2>/dev/null || true
    
    printf ']' >> "\$current_json.tmp" || true
  done
fi

printf '}\\n' >> "\$current_json.tmp" || true
mv "\$current_json.tmp" "\$current_json" 2>/dev/null || cp "\$current_json.tmp" "\$current_json" || true

# In dry-run mode, don't include resources in modified list
# The IDE extension will extract resources from the original file and match based on diff line numbers
# This avoids false positives where all resources from a file are attributed to all rules
printf '{}\\n' > "\$modified_json" || true
`,
      post_remediate: `#!/bin/sh
set -eu
timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
BASE="/workspace"
mkdir -p "\$BASE/.orl/diagnostics" "\$BASE/.orl/diag"
manifest="\$BASE/.orl/diagnostics/manifest.jsonl"
aggregate="\$BASE/.orl/diagnostics/diagnostics.json"
rules="\${1:-0}"
case "\$rules" in ''|*[!0-9-]*) rules=0;; esac
printf '{"event":"post_remediate","rulesExecuted":%s,"time":"%s"}\\n' "\$rules" "\$(timestamp)" >> "\$manifest"
# Aggregate per-rule JSON files into final diagnostics
rulesDir="\$BASE/.orl/diagnostics/rules"
{
  printf '{'
  printf '"version":1,'
  printf '"generatedAt":"%s",' "\$(timestamp)"
  printf '"rules":['
  first=1
  for f in "\$rulesDir"/*.json; do
    if [ ! -f "\$f" ]; then continue; fi
    # Skip resource tracking files (they have / in the name)
    case "\$f" in
      */resources_*.json) continue ;;
    esac
    if [ \$first -eq 0 ]; then printf ','; fi
    first=0
    cat "\$f"
  done
  printf ']}\\n'
} > "\$aggregate"
`,
    };

    // Merge hook files with legacy scripts (legacy scripts as fallback)
    const finalScripts: Record<string, string> = { ...legacyScripts };
    for (const [name, content] of Object.entries(scripts)) {
      if (content && content.trim() !== `#!/bin/sh\n# Hook ${name}\n`) {
        finalScripts[name] = content;
      }
    }

    for (const [name, content] of Object.entries(finalScripts)) {
      const file = path.join(hooksDir, name);
      await fs.promises.writeFile(file, content, {
        encoding: 'utf8',
        mode: 0o755,
      });
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
