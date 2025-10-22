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
  async remediate(workspacePath: string, language?: string): Promise<OrlResult> {
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
      const dockerCommand = this.buildDockerCommand(tempDir, language, rulesDir);
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
          filesModified: Object.keys(modifiedFiles).length 
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
            stderr: error.stderr 
          });

          // Parse ORL output to extract modified files
          const modifiedFiles = this.parseOrlOutput(error.stdout);

          // Clean up temp directory
          await fs.promises.rm(tempDir, { recursive: true, force: true });

          logger.info('ORL remediation completed with violations', { 
            filesModified: Object.keys(modifiedFiles).length 
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
  private async copyWorkspaceFiles(sourcePath: string, destPath: string): Promise<void> {
    const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(sourcePath));
    
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
   * Pull rules using ORL's built-in rules pull command
   */
  private async pullRulesUsingOrl(rulesDir: string): Promise<void> {
    const { rulesServiceUrl, rulesServiceToken, rulesServiceAccountId, channel } = this.config;
    
    // Use ORL's rules pull command instead of duplicating the API logic
    const pullCommand = `docker run --rm \
      -v '${rulesDir}:/output' \
      -e RULE_SERVICE_TOKEN='${rulesServiceToken}' \
      -e RULE_SERVICE_ACCOUNT_ID='${rulesServiceAccountId}' \
      gomboc/orl:latest rules pull --url='${rulesServiceUrl}' --out=/output --channel='${channel}'`;
    
    logger.info('Pulling rules using ORL', { command: pullCommand });
    
    try {
      const result = await execAsync(pullCommand);
      logger.info('Rules pulled successfully', { stdout: result.stdout, stderr: result.stderr });
    } catch (error) {
      logger.error('Failed to pull rules using ORL', { error });
      throw new Error(`Failed to pull rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pull rules from rules service API (DEPRECATED - use pullRulesUsingOrl instead)
   */
    private async pullRulesFromService(rulesDir: string): Promise<{ success: boolean; error?: string }> {
        try {
          const { rulesServiceUrl, rulesServiceToken, rulesServiceAccountId, channel } = this.config;
          
          // Build the API request to pull rules from channel
          const url = `${rulesServiceUrl}/api/v1/channels/rules`;
          const headers = {
            'Authorization': `Bearer ${rulesServiceToken}`,
            'x-account-id': rulesServiceAccountId,
          };
          
          // Build query parameters for GET request
          const params = new URLSearchParams();
          params.append('name', channel);
          params.append('page', '1');
          params.append('perPage', '100');
          
          // No filters - get all rules

          const fullUrl = `${url}?${params.toString()}`;

          logger.info('Pulling rules from service', { url: fullUrl, channel });

          const response = await fetch(fullUrl, {
            method: 'GET',
            headers,
          });

      if (!response.ok) {
        throw new Error(`Rules service request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('Raw rules service response', { data });
      
      // Write rules to files - rules are in data.data.rules
      const rules = data.data?.rules || [];
      logger.info('Found rules in response', { count: rules.length, ruleTypes: rules.map((r: any) => r.type) });
      
      // Write real ORL rules from the API
      logger.info('Writing ORL rules from API');
      logger.info('Rule processing details', { 
        totalRules: rules.length,
        ruleTypes: rules.map((r: any) => r.type),
        ruleNames: rules.map((r: any) => r.name),
        rulesWithBodies: rules.filter((r: any) => r.body).length
      });
      
      for (const rule of rules) {
        try {
          logger.info('Processing individual rule', { 
            ruleId: rule.id, 
            ruleName: rule.name,
            ruleType: rule.type,
            hasBody: !!rule.body,
            bodyKeys: rule.body ? Object.keys(rule.body) : 'no body',
            allKeys: Object.keys(rule)
          });
          
          // The rules should already be in ORL format in the 'body' field
          if (rule.body) {
            logger.info('Processing rule body', { 
              ruleId: rule.id, 
              ruleName: rule.name,
              bodyKeys: Object.keys(rule.body),
              bodyType: typeof rule.body,
              bodyPreview: JSON.stringify(rule.body).substring(0, 200) + '...'
            });
            const yamlRule = this.convertRuleBodyToYaml(rule.body, rule);
            // Sanitize filename by replacing invalid characters
            const sanitizedName = (rule.name || rule.id).replace(/[\/\\:*?"<>|]/g, '_');
            const fileName = `${sanitizedName}.orl`;
            const filePath = path.join(rulesDir, fileName);
            await fs.promises.writeFile(filePath, yamlRule, 'utf8');
            logger.info('Created rule file', { filePath, ruleName: rule.name || rule.id, sanitizedName });
          } else {
            logger.warn('Rule has no body - checking if we can use other fields', { 
              ruleId: rule.id, 
              ruleName: rule.name,
              availableFields: Object.keys(rule)
            });
          }
        } catch (error) {
          logger.warn('Failed to process rule', { ruleId: rule.id, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      return { success: true };

    } catch (error) {
      logger.error('Rules pull failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Convert rule body to YAML format (the body should already be in ORL format)
   */
  private convertRuleBodyToYaml(ruleBody: any, rule: any): string {
    // The rule body contains the ORL spec with 'rules' and 'template' keys
    // We need to wrap it in the proper YAML structure
    const yamlRule = {
      type: 'Rule',
      version: 'v1',
      metadata: {
        name: rule.name || rule.id,
        description: rule.description || rule.metadata?.description || ''
      },
      spec: ruleBody  // The ruleBody itself contains the spec (rules, template, etc.)
    };

    // Convert to YAML string
    return this.objectToYaml(yamlRule);
  }

  /**
   * Convert JavaScript object to YAML string
   */
  private objectToYaml(obj: any): string {
    let yaml = `type: ${obj.type}\n`;
    yaml += `version: ${obj.version}\n`;
    
    if (obj.metadata) {
      yaml += 'metadata:\n';
      for (const [key, value] of Object.entries(obj.metadata)) {
        if (typeof value === 'string') {
          yaml += `  ${key}: '${value}'\n`;
        } else if (typeof value === 'boolean') {
          yaml += `  ${key}: ${value}\n`;
        } else if (typeof value === 'number') {
          yaml += `  ${key}: ${value}\n`;
        } else if (Array.isArray(value)) {
          yaml += `  ${key}:\n`;
          for (const item of value) {
            yaml += `    - '${item}'\n`;
          }
        } else if (typeof value === 'object' && value !== null) {
          yaml += `  ${key}:\n`;
          for (const [subKey, subValue] of Object.entries(value)) {
            yaml += `    ${subKey}: '${subValue}'\n`;
          }
        }
      }
    }
    
    if (obj.spec) {
      yaml += '\nspec:\n';
      for (const [key, value] of Object.entries(obj.spec)) {
        if (key === 'rules' && Array.isArray(value)) {
          // Handle Ruleset structure with rules array
          yaml += `  ${key}:\n`;
          for (const rule of value) {
            yaml += `    - name: '${rule.name}'\n`;
            if (rule.audit) {
              yaml += '      audit: |\n';
              const lines = rule.audit.split('\n');
              for (const line of lines) {
                yaml += `        ${line}\n`;
              }
            }
            if (rule.remediation && Array.isArray(rule.remediation)) {
              yaml += '      remediation:\n';
              for (const item of rule.remediation) {
                yaml += `        - command: '${item.command}'\n`;
                if (item.path) {
                  yaml += `          path: '${item.path}'\n`;
                }
                if (item.flags) {
                  yaml += '          flags:\n';
                  for (const [flagKey, flagValue] of Object.entries(item.flags)) {
                    yaml += `            ${flagKey}: '${flagValue}'\n`;
                  }
                }
                if (item.value) {
                  yaml += '          value: |\n';
                  const lines = item.value.split('\n');
                  for (const line of lines) {
                    yaml += `            ${line}\n`;
                  }
                }
              }
            }
          }
        } else if (key === 'template' && typeof value === 'object' && value !== null) {
          // Handle template object
          yaml += `  ${key}:\n`;
          for (const [templateKey, templateValue] of Object.entries(value)) {
            yaml += `    ${templateKey}: '${templateValue}'\n`;
          }
        } else if (key === 'audit' && typeof value === 'string') {
          // Handle simple Rule structure
          yaml += `  ${key}: |\n`;
          const lines = value.split('\n');
          for (const line of lines) {
            yaml += `    ${line}\n`;
          }
        } else if (key === 'remediation' && Array.isArray(value)) {
          // Handle simple Rule remediation
          yaml += `  ${key}:\n`;
          for (const item of value) {
            yaml += `    - command: '${item.command}'\n`;
            if (item.path) {
              yaml += `      path: '${item.path}'\n`;
            }
            if (item.flags) {
              yaml += '      flags:\n';
              for (const [flagKey, flagValue] of Object.entries(item.flags)) {
                yaml += `        ${flagKey}: '${flagValue}'\n`;
              }
            }
            if (item.value) {
              yaml += '      value: |\n';
              const lines = item.value.split('\n');
              for (const line of lines) {
                yaml += `        ${line}\n`;
              }
            }
          }
        } else if (typeof value === 'string') {
          yaml += `  ${key}: '${value}'\n`;
        } else if (typeof value === 'boolean') {
          yaml += `  ${key}: ${value}\n`;
        } else if (typeof value === 'number') {
          yaml += `  ${key}: ${value}\n`;
        }
      }
    }
    
    return yaml;
  }

  /**
   * Convert rule object to YAML format (legacy method for fallback)
   */
  private convertRuleToYaml(rule: any): string {
    // Extract rule information from the API structure
    const ruleName = rule.name || rule.id || 'unnamed-rule';
    const language = rule.iacLanguage || 'terraform';
    
    // For now, create a basic rule structure since the API rules don't have ORL-specific audit/remediation
    // In a real implementation, you'd need to map the API rule structure to ORL format
    const yamlRule = {
      type: 'Rule',
      version: 'v1',
      metadata: {
        name: ruleName,
        description: rule.metadata?.description || rule.description || '',
      },
      spec: {
        language: language,
        audit_language: 'ast',
        audit: this.generateBasicAuditQuery(rule),
        remediation: this.generateBasicRemediation(rule),
      }
    };

    // Simple YAML conversion
    return `type: ${yamlRule.type}
version: ${yamlRule.version}
metadata:
  name: "${yamlRule.metadata.name}"
  description: "${yamlRule.metadata.description}"

spec:
  language: "${yamlRule.spec.language}"
  audit_language: "${yamlRule.spec.audit_language}"

  audit: |
${this.indentText(yamlRule.spec.audit, '    ')}

  remediation:
${yamlRule.spec.remediation.map((r: any) => `    - command: "${r.command}"
      path: "${r.path || ''}"
      flags:
        prefix: "${r.flags?.prefix || ''}"
        indent: "${r.flags?.indent || '  '}"
      value: |
${this.indentText(r.value || '', '        ')}`).join('\n')}
`;
  }

  /**
   * Generate a basic audit query based on the rule
   */
  private generateBasicAuditQuery(rule: any): string {
    // Extract resource type from annotations if available
    const resourceType = this.extractResourceType(rule);
    if (resourceType) {
      return `(block
  (identifier) @keyword
  (string_lit
    (template_literal) @type
  )
  (body) @body

  (#eq? @keyword "resource")
  (#eq? @type "${resourceType}")
)`;
    }
    
    // Fallback to a generic query
    return `(block
  (identifier) @keyword
  (string_lit
    (template_literal) @type
  )
  (body) @body

  (#eq? @keyword "resource")
)`;
  }

  /**
   * Generate basic remediation based on the rule
   */
  private generateBasicRemediation(rule: any): any[] {
    // For now, return a basic remediation that adds a comment
    // In a real implementation, you'd parse the rule's specific requirements
    return [{
      command: 'insert_after',
      path: 'body',
      flags: {
        prefix: '\n',
        indent: '  '
      },
      value: `# TODO: Apply ${rule.name || rule.id} remediation`
    }];
  }

  /**
   * Extract resource type from rule annotations
   */
  private extractResourceType(rule: any): string | null {
    const annotations = rule.annotations || rule.metadata?.annotations || {};
    const resourceKey = annotations['gomboc-ai/configoption/resource-key'];
    
    if (resourceKey) {
      // Extract the resource type from the key
      // e.g., "TfResourceSchemaDefinition:hashicorp/aws.resources.aws_s3_bucket" -> "aws_s3_bucket"
      const match = resourceKey.match(/\.([^.]+)$/);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Indent text for YAML formatting
   */
  private indentText(text: string, indent: string): string {
    return text.split('\n').map(line => `${indent}${line}`).join('\n');
  }

  /**
   * Build Docker command for ORL execution
   */
  private buildDockerCommand(workspacePath: string, language?: string, rulesDir?: string): string {
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
      'remediate /workspace --dry-run'
    ];

    // Add rulespace if rules directory exists
    if (rulesDir) {
      command[command.length - 1] = 'remediate /workspace --dry-run --rulespace /workspace/rules';
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
          logger.info('Saved file content', { file: currentFile, contentLength: currentContent.length });
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
        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('type:') || trimmedLine.startsWith('version:') || 
            trimmedLine.startsWith('metadata:') || trimmedLine.startsWith('spec:') || trimmedLine.startsWith('rules:')) {
          continue;
        }
        
        // Only accept lines that look like actual file paths
        if ((trimmedLine.startsWith('/') && trimmedLine.includes('.')) || 
            (trimmedLine.includes('.tf') && !trimmedLine.includes(':')) ||
            (trimmedLine.includes('.yaml') && !trimmedLine.includes(':')) ||
            (trimmedLine.includes('.json') && !trimmedLine.includes(':'))) {
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
      logger.info('Saved final file content', { file: currentFile, contentLength: currentContent.length });
    }

    logger.info('Parsed ORL output', { modifiedFiles: Object.keys(modifiedFiles) });
    return modifiedFiles;
  }

  /**
   * Check if file is an IaC file that ORL can process
   */
  private isIacFile(fileName: string): boolean {
    const iacExtensions = ['.tf', '.yaml', '.yml', '.json'];
    const ext = path.extname(fileName).toLowerCase();
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
        'rules list --help'
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
    rulesServiceUrl: config.get('orlRulesServiceUrl') || 'https://rules.app.gomboc.ai',
    rulesServiceToken: config.get('orlRulesServiceToken') || '',
    rulesServiceAccountId: config.get('orlRulesServiceAccountId') || '',
    channel: config.get('orlChannel') || 'default',
  });
}
