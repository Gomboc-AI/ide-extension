import path from 'path';
import {
  BlockDescription,
  BlockRange,
  BuildDiagnosticContextArgs,
  BuildDiagnosticRangeArgs,
  DescribeBlockArgs,
  DetectLanguageArgs,
  DiagnosticContext,
  DiagnosticRangeResult,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  FindScopedEditRangeArgs,
  FormatBlockDisplayNameArgs,
  GetDocumentInfoArgs,
  ILanguageHandler,
  ListBlocksArgs,
  MatchRulesToDiffArgs,
  ResourceContextExtractKind,
  ResolveDiagnosticAnchorLineArgs,
  ScopedEditRange,
} from '../types';

/**
 * Shared base class for all language handlers. Provides sensible default
 * implementations for every method on {@link ILanguageHandler} so concrete
 * handlers only need to override what diverges from the norm.
 */
export abstract class BaseLanguageHandler implements ILanguageHandler {
  abstract displayName: string;

  diagnosticClearScope: 'file' | 'directory' = 'file';
  codeResourceType = 'unknown';

  abstract detectLanguage(args: DetectLanguageArgs): boolean;
  abstract getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo;

  getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'unknown';
  }

  // --- Block discovery (subclasses must implement) ---

  abstract findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null;
  abstract findNearestBlock(args: FindNearestBlockArgs): BlockRange | null;
  abstract listBlocks(args: ListBlocksArgs): BlockRange[];

  findScopedEditRange(args: FindScopedEditRangeArgs): ScopedEditRange | null {
    const block = this.findBlockAtLine(args) || this.findNearestBlock(args);
    if (!block) {
      return null;
    }
    return { startLine: block.startLine, endLine: block.endLine };
  }

  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext {
    const block = this.findBlockAtLine({
      filePath: args.filePath,
      content: args.content,
      line: args.hint.line,
    });
    const nearestBlock =
      block ||
      this.findNearestBlock({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      });
    const docInfo = this.getDocumentInfo({
      filePath: args.filePath,
      content: args.content,
    });

    return {
      languageId: docInfo.languageId,
      filePath: args.filePath,
      block: block || undefined,
      nearestBlock: nearestBlock || undefined,
      diagnosticAnchorLine:
        (block || nearestBlock)?.startLine || Math.max(1, args.hint.line),
      blockHeader:
        (block || nearestBlock)?.header || path.basename(args.filePath),
      fallbackBlock: !(block || nearestBlock),
      tags: [],
    };
  }

  // --- Diff strategy (defaults match the original FileDiffAnalyzer behavior) ---

  isWeakAnchorLine(line: string): boolean {
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

  /**
   * Default brace-counting grouping. Suitable for HCL, JSON, Groovy, etc.
   */
  groupRelatedLines(lines: string[]): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let braceDepth = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

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

      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      braceDepth += openBraces - closeBraces;

      currentGroup.push(line);

      if (braceDepth === 0 && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    if (groups.length === 0 && lines.length > 0) {
      groups.push(lines);
    }

    return groups;
  }

  // --- Diagnostic placement ---

  /**
   * Build a compact diagnostic range for a single line.
   * Anchors near the first non-whitespace character and keeps a short highlight.
   */
  buildDiagnosticRange(args: BuildDiagnosticRangeArgs): DiagnosticRangeResult {
    const line = Math.max(1, Math.floor(args.line1Based || 1));
    const uniqueOffset =
      Number.isFinite(args.uniqueOffset) && (args.uniqueOffset || 0) > 0
        ? Math.floor(args.uniqueOffset || 0)
        : 0;
    const text =
      typeof args.content === 'string' && args.content.length > 0
        ? args.content
        : '';
    const lines = text ? text.split('\n') : [];
    const idx = Math.min(Math.max(0, line - 1), Math.max(0, lines.length - 1));
    const lineText = lines[idx] || '';
    const lineLength = lineText.length;

    const firstNonWhitespace = lineText.search(/\S/);
    const startChar =
      firstNonWhitespace >= 0 ? firstNonWhitespace : lineLength > 0 ? 0 : 0;

    const trimmedLength = lineText.trim().length;
    const compactWidth = Math.max(1, Math.min(24, trimmedLength || 1));
    const maxEnd = Math.max(startChar + 1, lineLength || startChar + 1);
    const rawEnd = startChar + compactWidth + uniqueOffset;
    const endChar = Math.min(maxEnd, Math.max(startChar + 1, rawEnd));

    return { startChar, endChar };
  }

  /**
   * Resolve a diagnostic anchor line, optionally snapping to block start.
   */
  resolveDiagnosticAnchorLine(args: ResolveDiagnosticAnchorLineArgs): number {
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

    if (!args.content) {
      return clamp(suggested);
    }
    if (args.fromFixOperation) {
      return clamp(suggested);
    }

    const context = this.buildDiagnosticContext({
      filePath: '',
      content: args.content,
      hint: { line: suggested, filePath: '' },
    });
    const anchored =
      context.diagnosticAnchorLine && context.diagnosticAnchorLine > 0
        ? context.diagnosticAnchorLine
        : suggested;
    return clamp(anchored);
  }

  // --- Block context for converter ---

  /**
   * Describes the block at the given line for use by the ORL result converter.
   * Default uses findBlockAtLine / findNearestBlock.
   */
  describeBlock(args: DescribeBlockArgs): BlockDescription {
    const block =
      args.block ||
      this.findBlockAtLine({
        filePath: args.filePath,
        content: args.content,
        line: args.line,
      }) ||
      this.findNearestBlock({
        filePath: args.filePath,
        content: args.content,
        line: args.line,
      });

    if (block) {
      return {
        blockType: block.type,
        blockName: block.name || null,
        blockStartLine: block.startLine - 1,
        blockEndLine: block.endLine - 1,
      };
    }

    return {
      blockType: 'Resource',
      blockName: null,
      blockStartLine: -1,
      blockEndLine: -1,
    };
  }

  // --- Display formatting ---

  /**
   * Default: "blockType.blockName" or just blockType, or filename fallback.
   */
  formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    if (
      args.blockType &&
      args.blockType !== 'Resource' &&
      args.blockName?.trim()
    ) {
      return `${args.blockType}.${args.blockName}`;
    }
    if (args.blockType && args.blockType !== 'Resource') {
      return args.blockType;
    }
    return path.basename(args.filePath);
  }

  // --- Rule matching strategy ---

  /**
   * Default: return all file-level rules (broadest match).
   */
  matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    return [...args.allFileRules];
  }
}
