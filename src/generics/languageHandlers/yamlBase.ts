import { ResolveDiagnosticAnchorLineArgs } from '../types';
import { BaseLanguageHandler } from './base';

/**
 * Shared base for YAML-family language handlers (Kubernetes, Helm, CloudFormation YAML).
 * Overrides diff grouping and diagnostic anchoring to use indentation-aware behavior
 * instead of the default brace-counting approach.
 */
export abstract class YamlBaseLanguageHandler extends BaseLanguageHandler {
  override isWeakAnchorLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.length === 0 ||
      trimmed === '---' ||
      trimmed === '...' ||
      trimmed.startsWith('#') ||
      trimmed === '{' ||
      trimmed === '}' ||
      trimmed === '],' ||
      trimmed === ']' ||
      trimmed === '},'
    );
  }

  /**
   * Indentation-aware grouping for YAML. Groups lines by tracking indentation
   * depth rather than brace counting.
   */
  override groupRelatedLines(lines: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let baseIndent: number | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        if (currentGroup.length > 0) {
          currentGroup.push(line);
        }
        continue;
      }

      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

      if (baseIndent === null) {
        baseIndent = indent;
      }

      if (indent <= baseIndent && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }

      currentGroup.push(line);
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    if (groups.length === 0 && lines.length > 0) {
      groups.push(lines);
    }

    return groups;
  }

  /**
   * YAML handlers keep the operation line when it comes from a fix operation
   * instead of snapping to block start.
   */
  override resolveDiagnosticAnchorLine(
    args: ResolveDiagnosticAnchorLineArgs,
  ): number {
    const suggested =
      Number.isFinite(args.suggestedLine) && args.suggestedLine > 0
        ? Math.floor(args.suggestedLine)
        : 1;
    const maxLine = args.content
      ? Math.max(1, args.content.split('\n').length)
      : undefined;
    const clamp = (line: number): number => {
      const floored = Number.isFinite(line) && line > 0 ? Math.floor(line) : 1;
      if (!maxLine) {
        return floored;
      }
      return Math.min(maxLine, Math.max(1, floored));
    };

    // For YAML, always keep the suggested line — do not snap to block start.
    return clamp(suggested);
  }
}
