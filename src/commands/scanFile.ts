import { ScanLocalScenarioInput } from './../api/__generated__/graphql';
// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getFileType } from '../utils/lib';
import {
  InfrastructureTool,
  IacScanContent,
} from '../api/__generated__/graphql';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import * as path from 'path';
import { createOrlClient } from '../orl/orlClient';
import logger from '../utils/logger';

export async function scanFileCommand(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  // Check feature flag for ORL remediation
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const orlEnabled = config.get('remediateOrlEnabled') as boolean;

  if (orlEnabled) {
    logger.info('ORL remediation enabled, using ORL client');
    await scanWithOrl(scanResultsProvider);
  } else {
    logger.info('Using traditional API client');
    await scanWithApiClient(scanResultsProvider);
  }
}

async function scanWithOrl(scanResultsProvider: ScanResultsProvider) {
  try {
    logger.info('🚀 ORL SCAN STARTING - Extension updated!');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;
    const workspacePath = path.dirname(filePath);

    logger.info('ORL scanning scope', {
      currentFile: filePath,
      workspacePath: workspacePath,
      scope: 'workspace-level (all IaC files in directory)',
    });

    // Validate file type
    const filetype = getFileType(filePath);
    if (
      filetype !== 'tf' &&
      filetype !== 'yml' &&
      filetype !== 'yaml' &&
      filetype !== 'json'
    ) {
      vscode.window.showErrorMessage(
        'Current file is not a cloudformation or terraform file',
      );
      throw new Error('Current file is not a cloudformation or terraform file');
    }

    // Create ORL client and execute remediation
    const orlClient = createOrlClient();
    let language: string;
    if (filetype === 'tf') {
      language = 'terraform';
    } else if (filetype === 'json') {
      language = 'cloudformation-json';
    } else {
      language = 'cloudformation-yaml';
    }
    const result = await orlClient.remediate(workspacePath, language);

    if (!result.success) {
      vscode.window.showErrorMessage(`ORL remediation failed: ${result.error}`);
      return;
    }

    // Convert ORL result to IDE extension format
    const scanResponse = await convertOrlResultToScanResponse(
      result,
      filetype,
      filePath,
    );
    logger.info('ORL scan response converted', {
      individualFixesCount: scanResponse.individualFixes.length,
      groupedFixesCount: scanResponse.groupedFixes.length,
      modifiedFiles: Object.keys(result.modifiedFiles),
    });
    scanResultsProvider.generateComments(scanResponse);
    scanResultsProvider.createDiagnostic();
  } catch (error) {
    logger.error('ORL scan failed', { error });
    vscode.window.showErrorMessage(
      `ORL scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function scanWithApiClient(scanResultsProvider: ScanResultsProvider) {
  const apiClient = new CustomerApiClient();
  // ----- Gather input ------- //
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const filePath = document.uri.fsPath;
  const filetype = getFileType(filePath);

  let fileContents: IacScanContent[];
  let tool: InfrastructureTool;

  if (filetype === 'tf') {
    tool = InfrastructureTool.Terraform;
    fileContents = await getTFScenarioFiles(document);
  } else if (filetype === 'yml' || filetype === 'yaml') {
    tool = InfrastructureTool.Cloudformation;
    fileContents = getCFNFile(document);
  } else {
    vscode.window.showErrorMessage(
      'Current file is not a cloudformation or terraform file',
    );
    throw new Error('Current file is not a cloudformation or terraform file');
  }

  // const metaData = await generateRequestMetadata();

  // ----- Send data to customerapi ------ //
  const inputObject: ScanLocalScenarioInput = {
    fileContents,
    iacTool: tool,
  };

  const scanResponse = await apiClient.getFixes({ inputObject });

  scanResultsProvider.generateComments(scanResponse);
  scanResultsProvider.createDiagnostic();

  // TODO
  // ----- add a progress bar that possible measures the length of time? ------ //
}

/**
 * Convert ORL result to IDE extension scan response format
 */
async function convertOrlResultToScanResponse(
  result: any,
  filetype: string,
  currentFilePath: string,
): Promise<any> {
  // Create individual fixes based on actual differences between original and modified files
  const individualFixes: any[] = [];
  const groupedFixes: any[] = [];

  for (const [orlFilePath, modifiedContent] of Object.entries(
    result.modifiedFiles,
  )) {
    // Convert ORL path (/workspace/file.tf) to actual file path
    const actualFilePath = convertOrlPathToActualPath(
      orlFilePath as string,
      currentFilePath,
    );

    // Read the original file content
    const originalContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(actualFilePath),
    );
    const originalText = new TextDecoder().decode(originalContent);

    // Find the differences between original and modified content
    logger.info('File content comparison', {
      file: actualFilePath,
      originalLength: originalText.length,
      modifiedLength: (modifiedContent as string).length,
      originalPreview: originalText.split('\n').slice(0, 5).join('\n'),
      modifiedPreview: (modifiedContent as string)
        .split('\n')
        .slice(0, 5)
        .join('\n'),
    });

    const differences = findDifferences(
      originalText,
      modifiedContent as string,
    );

    if (differences.length === 0) {
      logger.info('No differences found for file', { file: actualFilePath });
      continue;
    }

    logger.info('Found differences in file', {
      file: actualFilePath,
      differenceCount: differences.length,
      differences: differences.map(d => ({
        line: d.targetLine,
        type: d.type,
        newLinesCount: d.newLines.length,
        newLines: d.newLines.slice(0, 3), // Show first 3 lines of changes
      })),
    });

    // Create individual fixes for each difference found
    // This ensures we always create the correct number of fixes
    for (let i = 0; i < differences.length; i++) {
      const diff = differences[i];
      const fix = {
        filepath: actualFilePath,
        oldLine: diff.originalLine,
        newLine: diff.newLines,
        codePosition: {
          line: diff.targetLine,
          column: 0,
        },
        lineOffset: 0,
        fixType: diff.type,
      };

      // Create individual fix for this specific difference
      const individualFix = {
        benchmarkRecommendation: {
          id: `orl-recommendation-${i}`,
          identifier: 'ORL_REMEDIATION',
          name: 'ORL Security Remediation',
          description: `Automated security remediation via ORL (fix ${i + 1})`,
        },
        fixes: [fix],
        codeObservation: {
          codeResourceInstance: {
            name: path.basename(actualFilePath),
            type: filetype === 'tf' ? 'terraform' : 'cloudformation',
            filepath: actualFilePath,
            line: diff.targetLine,
          },
          disposition: 'NonCompliant' as const,
        },
      };

      individualFixes.push(individualFix);
    }

    // Create grouped fix for the entire file
    const groupedFix = {
      path: actualFilePath,
      content: Buffer.from(modifiedContent as string, 'utf8').toString(
        'base64',
      ),
      comments: differences.map((diff, i) => ({
        position: {
          line: diff.targetLine,
          column: 0,
        },
        benchmarkRecommendation: {
          id: `orl-recommendation-${i}`,
          name: `Apply all ${differences.length} ORL security fixes`,
        },
      })),
    };

    groupedFixes.push(groupedFix);
  }

  logger.info('Created fixes', {
    individualFixesCount: individualFixes.length,
    groupedFixesCount: groupedFixes.length,
  });

  return {
    individualFixes,
    groupedFixes,
  };
}

/**
 * Find differences between original and modified file content
 * Uses a more granular approach to detect individual changes
 */
function findDifferences(
  originalContent: string,
  modifiedContent: string,
): Array<{
  originalLine: number;
  targetLine: number;
  newLines: string[];
  type: 'ADD' | 'UPDATE' | 'DELETE';
}> {
  const originalLines = originalContent.split('\n');
  const modifiedLines = modifiedContent.split('\n');
  const differences: Array<{
    originalLine: number;
    targetLine: number;
    newLines: string[];
    type: 'ADD' | 'UPDATE' | 'DELETE';
  }> = [];

  logger.info('Comparing files', {
    originalLines: originalLines.length,
    modifiedLines: modifiedLines.length,
  });

  // Use a line-by-line comparison with better change detection
  let originalIndex = 0;
  let modifiedIndex = 0;

  while (
    originalIndex < originalLines.length ||
    modifiedIndex < modifiedLines.length
  ) {
    const originalLine = originalLines[originalIndex] || '';
    const modifiedLine = modifiedLines[modifiedIndex] || '';

    if (originalLine === modifiedLine) {
      // Lines match, move both pointers
      originalIndex++;
      modifiedIndex++;
    } else {
      // Lines differ - find the next matching line
      let nextMatch = { originalIdx: -1, modifiedIdx: -1 };

      // Look ahead for the next matching line
      for (let i = originalIndex + 1; i < originalLines.length; i++) {
        for (let j = modifiedIndex + 1; j < modifiedLines.length; j++) {
          if (originalLines[i] === modifiedLines[j]) {
            nextMatch = { originalIdx: i, modifiedIdx: j };
            break;
          }
        }
        if (nextMatch.originalIdx !== -1) {
          break;
        }
      }

      if (nextMatch.originalIdx !== -1) {
        // Found a match - analyze the difference
        const originalDiffLines = originalLines.slice(
          originalIndex,
          nextMatch.originalIdx,
        );
        const modifiedDiffLines = modifiedLines.slice(
          modifiedIndex,
          nextMatch.modifiedIdx,
        );

        // Try to break down large changes into smaller, more meaningful ones
        if (originalDiffLines.length === 0 && modifiedDiffLines.length > 0) {
          // Pure addition - try to break into individual additions
          for (let i = 0; i < modifiedDiffLines.length; i++) {
            const line = modifiedDiffLines[i];
            // Only create separate fixes for lines that look like actual code changes
            if (
              line.trim() &&
              !line.trim().startsWith('#') &&
              !line.trim().startsWith('//')
            ) {
              differences.push({
                originalLine: originalIndex + 1,
                targetLine: originalIndex + 1,
                newLines: [line],
                type: 'ADD',
              });
            }
          }
        } else if (
          modifiedDiffLines.length === 0 &&
          originalDiffLines.length > 0
        ) {
          // Pure deletion
          differences.push({
            originalLine: originalIndex + 1,
            targetLine: originalIndex + 1,
            newLines: [],
            type: 'DELETE',
          });
        } else if (
          originalDiffLines.length > 0 &&
          modifiedDiffLines.length > 0
        ) {
          // Mixed change - try to identify individual changes
          const changes = identifyIndividualChanges(
            originalDiffLines,
            modifiedDiffLines,
            originalIndex + 1,
          );
          differences.push(...changes);
        }

        originalIndex = nextMatch.originalIdx;
        modifiedIndex = nextMatch.modifiedIdx;
      } else {
        // No match found - treat as replacement of remaining content
        const remainingOriginal = originalLines.slice(originalIndex);
        const remainingModified = modifiedLines.slice(modifiedIndex);

        if (remainingOriginal.length > 0 || remainingModified.length > 0) {
          differences.push({
            originalLine: originalIndex + 1,
            targetLine: originalIndex + 1,
            newLines: remainingModified,
            type: remainingOriginal.length === 0 ? 'ADD' : 'UPDATE',
          });
        }

        break; // No more content to process
      }
    }
  }

  logger.info('Found differences', {
    count: differences.length,
    differences: differences.map(d => ({
      line: d.targetLine,
      type: d.type,
      newLinesCount: d.newLines.length,
      newLines: d.newLines.slice(0, 2), // Show first 2 lines
    })),
  });

  return differences;
}

/**
 * Identify individual changes within a larger diff block
 */
function identifyIndividualChanges(
  originalLines: string[],
  modifiedLines: string[],
  baseLine: number,
): Array<{
  originalLine: number;
  targetLine: number;
  newLines: string[];
  type: 'ADD' | 'UPDATE' | 'DELETE';
}> {
  const changes: Array<{
    originalLine: number;
    targetLine: number;
    newLines: string[];
    type: 'ADD' | 'UPDATE' | 'DELETE';
  }> = [];

  // Simple approach: treat each non-empty line as a potential individual change
  let lineOffset = 0;

  for (
    let i = 0;
    i < Math.max(originalLines.length, modifiedLines.length);
    i++
  ) {
    const originalLine = originalLines[i] || '';
    const modifiedLine = modifiedLines[i] || '';

    if (originalLine !== modifiedLine) {
      if (originalLine === '' && modifiedLine !== '') {
        // Addition
        changes.push({
          originalLine: baseLine + lineOffset,
          targetLine: baseLine + lineOffset,
          newLines: [modifiedLine],
          type: 'ADD',
        });
      } else if (modifiedLine === '' && originalLine !== '') {
        // Deletion
        changes.push({
          originalLine: baseLine + lineOffset,
          targetLine: baseLine + lineOffset,
          newLines: [],
          type: 'DELETE',
        });
      } else {
        // Update
        changes.push({
          originalLine: baseLine + lineOffset,
          targetLine: baseLine + lineOffset,
          newLines: [modifiedLine],
          type: 'UPDATE',
        });
      }
    }

    lineOffset++;
  }

  return changes;
}

/**
 * Convert ORL Docker path to actual file system path
 */
function convertOrlPathToActualPath(
  orlPath: string,
  currentFilePath?: string,
): string {
  logger.info('Converting ORL path', { orlPath, currentFilePath });

  // If we have the current file path, use its directory as the base
  if (currentFilePath) {
    const currentDir = path.dirname(currentFilePath);
    const fileName = orlPath.includes('/') ? path.basename(orlPath) : orlPath;
    const actualPath = path.join(currentDir, fileName);
    logger.info('Using current file directory', {
      currentDir,
      fileName,
      actualPath,
    });
    return actualPath;
  }

  // Fallback to workspace root detection
  // ORL returns paths like "/workspace/main.tf" or just "main.tf"
  // We need to convert this to the actual file path
  let fileName = orlPath;

  if (orlPath.startsWith('/workspace/')) {
    fileName = orlPath.replace('/workspace/', '');
  } else if (orlPath.startsWith('/')) {
    // Handle absolute paths by extracting just the filename
    fileName = path.basename(orlPath);
  }

  logger.info('Extracted filename from ORL path', { fileName });

  // Get the current workspace root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  logger.info('Workspace root', { workspaceRoot });

  if (workspaceRoot) {
    const actualPath = path.join(workspaceRoot, fileName);
    logger.info('Converted to actual path', { actualPath });
    return actualPath;
  }

  logger.warn('Could not convert ORL path, using original', { orlPath });
  return orlPath;
}

async function getTFScenarioFiles(
  document: vscode.TextDocument,
): Promise<IacScanContent[]> {
  // updating this to use native os path so we can support windows
  // fsPath is the native reading path, and .path is the unix style vscode path
  // Note, we most likely just want to use fsPath for most purposes
  const currentFilePath = document.uri.fsPath;

  const directoryPath = path.dirname(currentFilePath);
  const entries = await vscode.workspace.fs.readDirectory(
    vscode.Uri.file(directoryPath),
  );

  const contents: IacScanContent[] = [];
  for (const [name, fileType] of entries) {
    if (fileType === vscode.FileType.File && name.endsWith('.tf')) {
      const filePath = path.join(directoryPath, name);
      const fileUri = vscode.Uri.file(filePath);

      const data = await vscode.workspace.fs.readFile(fileUri);
      const contentString = new TextDecoder().decode(data);

      contents.push({
        filePath: filePath, // Use the native OS path directly
        fileContent: Buffer.from(contentString, 'utf8').toString('base64'),
      });
    }
  }
  return contents;
}

/**
 * Only care about the current file, just return base64 of it
 */
export function getCFNFile(document: vscode.TextDocument): IacScanContent[] {
  return [
    {
      filePath: document.uri.fsPath,
      fileContent: Buffer.from(document.getText(), 'utf8').toString('base64'),
    },
  ];
}
