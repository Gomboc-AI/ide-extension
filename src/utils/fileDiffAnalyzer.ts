import logger from './logger';
import type { ILanguageHandler } from '../generics/types';

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
  private static isWeakAnchorLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.length === 0 ||
      trimmed === '{' ||
      trimmed === '}' ||
      trimmed === '],' ||
      trimmed === ']' ||
      trimmed === '},' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('//')
    );
  }

  private static countLineOccurrences(lines: string[], line: string): number {
    let count = 0;
    for (const entry of lines) {
      if (entry === line) {
        count++;
      }
    }
    return count;
  }

  /**
   * Choose the best lookahead resync candidate.
   * We prefer nearby, non-generic, and less-repeated lines to avoid
   * anchoring on ambiguous tokens like `}`.
   */
  private static findNextMatch(
    originalLines: string[],
    modifiedLines: string[],
    originalIndex: number,
    modifiedIndex: number,
    handler?: ILanguageHandler,
  ): { originalIdx: number; modifiedIdx: number } {
    let bestMatch = { originalIdx: -1, modifiedIdx: -1 };
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = originalIndex + 1; i < originalLines.length; i++) {
      for (let j = modifiedIndex + 1; j < modifiedLines.length; j++) {
        if (originalLines[i] !== modifiedLines[j]) {
          continue;
        }

        const value = originalLines[i];
        const distanceScore = i - originalIndex + (j - modifiedIndex);
        const isWeak = handler
          ? handler.isWeakAnchorLine(value)
          : this.isWeakAnchorLine(value);
        const weakAnchorPenalty = isWeak ? 500 : 0;
        const repeatedPenalty =
          this.countLineOccurrences(originalLines, value) > 1 ||
          this.countLineOccurrences(modifiedLines, value) > 1
            ? 100
            : 0;
        const score = distanceScore + weakAnchorPenalty + repeatedPenalty;

        if (score < bestScore) {
          bestScore = score;
          bestMatch = { originalIdx: i, modifiedIdx: j };
        }
      }
    }

    return bestMatch;
  }

  private static getCommonPrefixLength(
    originalLines: string[],
    modifiedLines: string[],
  ): number {
    const max = Math.min(originalLines.length, modifiedLines.length);
    let idx = 0;
    while (idx < max && originalLines[idx] === modifiedLines[idx]) {
      idx++;
    }
    return idx;
  }

  private static getCommonSuffixLength(
    originalLines: string[],
    modifiedLines: string[],
    prefixLength: number,
  ): number {
    const originalEnd = originalLines.length - 1;
    const modifiedEnd = modifiedLines.length - 1;
    let suffix = 0;

    while (
      originalEnd - suffix >= prefixLength &&
      modifiedEnd - suffix >= prefixLength &&
      originalLines[originalEnd - suffix] ===
        modifiedLines[modifiedEnd - suffix]
    ) {
      suffix++;
    }

    return suffix;
  }

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
    handler?: ILanguageHandler,
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
        const nextMatch = this.findNextMatch(
          originalLines,
          modifiedLines,
          originalIndex,
          modifiedIndex,
          handler,
        );

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
            handler,
          );
          differences.push(...groupedChanges);

          originalIndex = nextMatch.originalIdx;
          modifiedIndex = nextMatch.modifiedIdx;
        } else {
          // No match found - treat as replacement of remaining content
          const remainingOriginal = originalLines.slice(originalIndex);
          const remainingModified = modifiedLines.slice(modifiedIndex);

          if (remainingOriginal.length > 0 || remainingModified.length > 0) {
            differences.push(
              ...this.createGroupedChanges(
                remainingOriginal,
                remainingModified,
                originalIndex + 1,
                handler,
              ),
            );
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
    handler?: ILanguageHandler,
  ): Difference[] {
    const changes: Difference[] = [];

    const prefixLength = this.getCommonPrefixLength(
      originalLines,
      modifiedLines,
    );
    const suffixLength = this.getCommonSuffixLength(
      originalLines,
      modifiedLines,
      prefixLength,
    );

    const originalMiddle = originalLines.slice(
      prefixLength,
      originalLines.length - suffixLength,
    );
    const modifiedMiddle = modifiedLines.slice(
      prefixLength,
      modifiedLines.length - suffixLength,
    );
    const middleStartLine = baseLine + prefixLength;

    if (originalMiddle.length === 0 && modifiedMiddle.length === 0) {
      return changes;
    }

    if (originalMiddle.length === 0 && modifiedMiddle.length > 0) {
      // Pure addition - group related lines together
      const groupedAdditions = handler
        ? handler.groupRelatedLines(modifiedMiddle)
        : this.groupRelatedLines(modifiedMiddle);

      for (const group of groupedAdditions) {
        changes.push({
          originalLine: middleStartLine,
          targetLine: middleStartLine,
          newLines: group,
          type: 'ADD',
        });
      }
    } else if (modifiedMiddle.length === 0 && originalMiddle.length > 0) {
      // Pure deletion
      changes.push({
        originalLine: middleStartLine,
        targetLine: middleStartLine,
        newLines: [],
        type: 'DELETE',
      });
    } else {
      // Mixed change - treat as replacement
      changes.push({
        originalLine: middleStartLine,
        targetLine: middleStartLine,
        newLines: modifiedMiddle,
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
