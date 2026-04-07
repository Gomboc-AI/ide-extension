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
 * with improved grouping to avoid syntax issues
 */
export class FileDiffAnalyzer {
  /**
   * Normalize all line endings so downstream diff logic behaves the same on
   * Windows (CRLF) and Unix (LF).
   *
   * - Convert CRLF -> LF
   * - Convert bare CR  -> LF (rare, but safe)
   */
  private static normalizeLineEndings(content: string): string {
    // Important: use '\n' (not '') so we don't accidentally merge lines when
    // encountering bare '\r' characters.
    return (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Find differences between original and modified file content
   * Uses intelligent grouping to avoid syntax issues
   */
  static findDifferences(
    originalContent: string,
    modifiedContent: string,
  ): Difference[] {
    const originalNormalized = this.normalizeLineEndings(originalContent);
    const modifiedNormalized = this.normalizeLineEndings(modifiedContent);

    const originalLines = originalNormalized.split('\n');
    const modifiedLines = modifiedNormalized.split('\n');
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

          // Use intelligent grouping instead of breaking into individual lines
          const groupedChanges = this.createGroupedChanges(
            originalDiffLines,
            modifiedDiffLines,
            originalIndex + 1,
          );
          differences.push(...groupedChanges);

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
   * Create grouped changes that maintain syntax integrity
   */
  private static createGroupedChanges(
    originalLines: string[],
    modifiedLines: string[],
    baseLine: number,
  ): Difference[] {
    const changes: Difference[] = [];

    if (originalLines.length === 0 && modifiedLines.length > 0) {
      // Pure addition - group related lines together
      const groupedAdditions = this.groupRelatedLines(modifiedLines);

      for (const group of groupedAdditions) {
        changes.push({
          originalLine: baseLine,
          targetLine: baseLine,
          newLines: group,
          type: 'ADD',
        });
      }
    } else if (modifiedLines.length === 0 && originalLines.length > 0) {
      // Pure deletion
      changes.push({
        originalLine: baseLine,
        targetLine: baseLine,
        newLines: [],
        type: 'DELETE',
      });
    } else {
      // Mixed change - treat as replacement
      changes.push({
        originalLine: baseLine,
        targetLine: baseLine,
        newLines: modifiedLines,
        type: 'UPDATE',
      });
    }

    return changes;
  }

  /**
   * Group related lines together to maintain syntax integrity
   */
  private static groupRelatedLines(lines: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let braceDepth = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (
        !trimmedLine ||
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//')
      ) {
        if (currentGroup.length > 0) {
          currentGroup.push(line);
        }
        continue;
      }

      // Track brace depth to group related blocks
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      currentGroup.push(line);

      // If we've closed all braces and have meaningful content, end the group
      if (braceDepth === 0 && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    }

    // Add any remaining lines as a final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // If no groups were created, create one group with all lines
    if (groups.length === 0 && lines.length > 0) {
      groups.push(lines);
    }

    logger.info('Grouped related lines', {
      totalLines: lines.length,
      groups: groups.length,
      groupSizes: groups.map(g => g.length),
    });

    return groups;
  }

  public static groupRelatedLinesForTests(lines: string[]): string[][] {
    return this.groupRelatedLines(lines);
  }

  /**
   * Identify individual changes within a larger diff block
   * @deprecated - Use createGroupedChanges instead to avoid syntax issues
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
