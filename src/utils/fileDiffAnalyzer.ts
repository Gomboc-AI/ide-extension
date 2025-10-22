import logger from './logger';

export interface Difference {
  originalLine: number;
  targetLine: number;
  newLines: string[];
  type: 'ADD' | 'UPDATE' | 'DELETE';
}

export interface Change {
  originalLine: number;
  targetLine: number;
  newLines: string[];
  type: 'ADD' | 'UPDATE' | 'DELETE';
}

/**
 * Utility class for analyzing differences between original and modified file content
 */
export class FileDiffAnalyzer {
  /**
   * Find differences between original and modified file content
   * Uses a more granular approach to detect individual changes
   */
  static findDifferences(
    originalContent: string,
    modifiedContent: string,
  ): Difference[] {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    const differences: Difference[] = [];

    logger.info('Comparing files', {
      originalLines: originalLines.length,
      modifiedLines: modifiedLines.length,
    });

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

          // Try to break down large changes into smaller ones
          if (originalDiffLines.length === 0 && modifiedDiffLines.length > 0) {
            // Pure addition - try to break into individual additions
            for (let i = 0; i < modifiedDiffLines.length; i++) {
              const line = modifiedDiffLines[i];
              // Only create separate fixes for lines that look like actual changes (no commenting stuff)
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
            const changes = this.identifyIndividualChanges(
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

          break; // No more content
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
  static identifyIndividualChanges(
    originalLines: string[],
    modifiedLines: string[],
    baseLine: number,
  ): Change[] {
    const changes: Change[] = [];

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
}
