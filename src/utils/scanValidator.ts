import * as vscode from 'vscode';
import * as path from 'path';
import { getFileType } from './lib';

export interface ScanPreparation {
  filePath: string;
  workspacePath: string;
  filetype: string;
  language: string;
}

/**
 * Check if content matches pattern at start of line (more reliable than includes)
 */
function hasPatternAtLineStart(content: string, pattern: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Get first N lines of content for pattern matching (performance optimization)
 */
function getFirstLines(content: string, maxLines: number = 50): string {
  const lines = content.split('\n');
  return lines.slice(0, maxLines).join('\n');
}

/**
 * Detect language from file path and content
 * Uses file extension first (safe, fast), then content analysis for ambiguous cases
 */
export function detectLanguageFromFile(
  filePath: string,
  fileContent: string,
): string | null {
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const filetype = getFileType(filePath);
  const dirPath = path.dirname(filePath).toLowerCase();

  // Handle empty files
  if (!fileContent || fileContent.trim().length === 0) {
    // For empty files, rely only on extension/filename
    if (fileName.startsWith('dockerfile') || ext === '.dockerfile') {
      return 'docker';
    }
    if (filetype === 'tf' || filetype === 'hcl' || filetype === 'tfvars') {
      return 'terraform';
    }
    if (ext === '.tpl') {
      return 'helm';
    }
    if (ext === '.json') {
      return 'cloudformation-json';
    }
    if (ext === '.yaml' || ext === '.yml') {
      return 'cloudformation-yaml'; // Safe default
    }
    return null;
  }

  // 1. Docker: Dockerfile* or *.dockerfile (check filename first - most specific)
  if (fileName.startsWith('dockerfile') || ext === '.dockerfile') {
    return 'docker';
  }

  // 2. Terraform: .tf, .hcl, .tfvars (extension-based, like original)
  if (filetype === 'tf' || filetype === 'hcl' || filetype === 'tfvars') {
    return 'terraform';
  }

  // 3. Helm: .tpl extension (Helm template files)
  if (ext === '.tpl') {
    return 'helm';
  }

  // 4. CloudFormation: .json (with specific naming patterns, like original)
  if (ext === '.json') {
    return 'cloudformation-json';
  }

  // 5. YAML files (.yaml, .yml): need content analysis to distinguish
  if (ext === '.yaml' || ext === '.yml') {
    // Limit content scanning to first 50 lines for performance
    const firstLines = getFirstLines(fileContent, 50);
    const contentLower = firstLines.toLowerCase();

    // Check for Helm patterns first (Helm can have .yaml/.yml extensions)
    // Helm templates contain Go template syntax - check for {{ at line start
    // Also check directory structure (Helm charts are in charts/ or helm/ directories)
    const isHelmDir =
      dirPath.includes('/charts/') ||
      dirPath.includes('/helm/') ||
      dirPath.includes('\\charts\\') ||
      dirPath.includes('\\helm\\');

    if (
      hasPatternAtLineStart(firstLines, '{{') ||
      contentLower.includes('.values') ||
      contentLower.includes('.chart') ||
      contentLower.includes('.release') ||
      fileName.includes('helm') ||
      fileName.includes('chart') ||
      isHelmDir
    ) {
      return 'helm';
    }

    // Check for Kubernetes patterns (kind: and apiVersion: at line start are strong indicators)
    // Kubernetes manifests have both kind: and apiVersion: at the top level
    // Also check directory structure (k8s manifests are often in k8s/, kubernetes/, or manifests/)
    const isK8sDir =
      dirPath.includes('/k8s/') ||
      dirPath.includes('/kubernetes/') ||
      dirPath.includes('/manifests/') ||
      dirPath.includes('\\k8s\\') ||
      dirPath.includes('\\kubernetes\\') ||
      dirPath.includes('\\manifests\\');

    const hasKind = hasPatternAtLineStart(firstLines, 'kind:');
    const hasApiVersion = hasPatternAtLineStart(firstLines, 'apiVersion:');

    if ((hasKind && hasApiVersion) || isK8sDir) {
      return 'kubernetes';
    }

    // Check for CloudFormation patterns (like original logic)
    // CloudFormation YAML has AWSTemplateFormatVersion or Resources: at top level
    if (
      hasPatternAtLineStart(firstLines, 'AWSTemplateFormatVersion') ||
      hasPatternAtLineStart(firstLines, 'Resources:') ||
      hasPatternAtLineStart(firstLines, 'Transform:') ||
      fileName.includes('cloudformation') ||
      fileName.includes('cfn') ||
      fileName.includes('template') ||
      fileName.includes('stack')
    ) {
      return 'cloudformation-yaml';
    }

    // Default: If we can't determine, default to cloudformation-yaml
    // This preserves backward compatibility for existing CloudFormation YAML files
    // Note: This might misclassify some Kubernetes files, but it's safer than assuming
    return 'cloudformation-yaml';
  }

  // XML files (Maven pom.xml, etc.)
  if (ext === '.xml') {
    return 'xml';
  }

  // Gradle Groovy
  if (ext === '.gradle') {
    return 'groovy';
  }

  // Gradle Kotlin DSL
  if (ext === '.kts') {
    return 'kotlin';
  }

  return null;
}

/**
 * Utility class for validating and preparing scan operations
 */
export class ScanValidator {
  /**
   * Validate file type and prepare scan parameters
   */
  static validateAndPrepareScan(editor: vscode.TextEditor): ScanPreparation {
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const workspacePath = path.dirname(filePath);
    const filetype = getFileType(filePath);
    const fileContent = document.getText();

    // Detect language from file path and content
    const language = detectLanguageFromFile(filePath, fileContent);

    if (!language) {
      throw new Error(
        'Current file is not a supported IaC file (Terraform, CloudFormation, Docker, Helm, Kubernetes, Maven XML, or Gradle)',
      );
    }

    return {
      filePath,
      workspacePath,
      filetype,
      language,
    };
  }
}
