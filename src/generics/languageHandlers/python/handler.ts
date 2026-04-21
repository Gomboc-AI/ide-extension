import path from 'path';
import {
  BlockRange,
  DetectLanguageArgs,
  DocumentInfo,
  FindBlockAtLineArgs,
  FindNearestBlockArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class PythonLanguageHandler extends BaseLanguageHandler {
  displayName = 'Python';
  codeResourceType = 'python';
  extensions = ['.py'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.py';
  }

  /**
   * Parses Python class/def blocks and computes their indentation-based ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const blockPattern = /^\s*(class|def)\s+([A-Za-z_][A-Za-z0-9_]*)\b.*:\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(blockPattern);
      if (!match) {
        continue;
      }

      const blockKind = match[1];
      const blockName = match[2];
      const baseIndent = this.getIndent(line);
      let endLine = i + 1;

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        const trimmed = next.trim();
        if (!trimmed) {
          endLine = j + 1;
          continue;
        }

        const indent = this.getIndent(next);
        if (indent <= baseIndent) {
          break;
        }
        endLine = j + 1;
      }

      blocks.push({
        type: blockKind === 'class' ? 'python_class' : 'python_function',
        name: blockName,
        startLine: i + 1,
        endLine,
        header: `${blockKind} ${blockName}`,
      });
    }

    return blocks;
  }

  private getIndent(line: string): number {
    const leading = line.match(/^\s*/)?.[0] || '';
    return leading.replace(/\t/g, '    ').length;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'python',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: false,
      supportsBlocks: true,
    };
  }

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    const line = Math.max(1, args.line);
    return (
      blocks.find(block => line >= block.startLine && line <= block.endLine) ||
      null
    );
  }

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    if (blocks.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = blocks.find(
      block => line >= block.startLine && line <= block.endLine,
    );
    if (containing) {
      return containing;
    }
    const previous = blocks
      .filter(block => block.startLine <= line)
      .sort((a, b) => b.startLine - a.startLine)[0];
    return previous || blocks[0];
  }

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseBlocks(args.content);
  }
}
