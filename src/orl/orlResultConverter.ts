import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer, Difference } from '../utils/fileDiffAnalyzer';
import { DiffContentAnalyzer } from '../utils/diffContentAnalyzer';

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
  error?: string;
}

export interface ScanResponse {
  individualFixes: any[];
  groupedFixes: any[];
}

/**
 * Utility class for converting ORL results to VS Code scan response format
 */
export class OrlResultConverter {
  /**
   * Convert ORL result to IDE extension scan response format
   */
  static async convertToScanResponse(
    result: OrlResult,
    filetype: string,
    currentFilePath: string,
  ): Promise<ScanResponse> {
    // Create individual fixes based on actual differences between original and modified files
    const individualFixes: any[] = [];
    const groupedFixes: any[] = [];

    for (const [orlFilePath, modifiedContent] of Object.entries(
      result.modifiedFiles,
    )) {
      // Convert ORL path (/workspace/file.tf) to actual file path
      const actualFilePath = PathConverter.convertOrlPathToActualPath(
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

      const differences = FileDiffAnalyzer.findDifferences(
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
        differences: differences.map((d: Difference) => ({
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

        // Analyze the diff content to extract meaningful information
        const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

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
            name: analysis.description,
            description: analysis.description,
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
        comments: differences.map((diff: Difference, i: number) => {
          const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);
          return {
            position: {
              line: diff.targetLine,
              column: 0,
            },
            benchmarkRecommendation: {
              id: `orl-recommendation-${i}`,
              name: analysis.description,
            },
          };
        }),
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
}
