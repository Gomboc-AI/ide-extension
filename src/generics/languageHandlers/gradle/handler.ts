import path from 'path';
import {
  DetectLanguageArgs,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  BlockRange,
  DescribeBlockArgs,
  BlockDescription,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class GradleLanguageHandler extends BaseLanguageHandler {
  displayName = 'Gradle';
  codeResourceType = 'gradle';
  extensions = ['.gradle', '.kts'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.gradle' || ext === '.kts';
  }

  /**
   * Parses common Gradle block structures and task declarations.
   */
  private parseBlocks(args: {
    filePath: string;
    content: string;
  }): BlockRange[] {
    const lines = args.content.split('\n');
    const blocks: BlockRange[] = [];
    const taskPattern = /^\s*task\s+([A-Za-z0-9_]+)\s*\{/;
    const registerTaskPattern =
      /^\s*tasks\.(?:register|create)\(\s*["']([^"']+)["']/;
    const blockPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let type = 'gradle_block';
      let name: string | undefined;
      let match = line.match(taskPattern);
      if (match) {
        type = 'gradle_task';
        name = match[1];
      } else {
        match = line.match(registerTaskPattern);
        if (match) {
          type = 'gradle_task';
          name = match[1];
        } else {
          match = line.match(blockPattern);
          if (match) {
            name = match[1];
          }
        }
      }
      if (!match || !name) {
        continue;
      }

      let braceDepth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const openCount = (lines[j].match(/{/g) || []).length;
        const closeCount = (lines[j].match(/}/g) || []).length;
        if (openCount > 0) {
          sawOpening = true;
        }
        braceDepth += openCount - closeCount;
        if (sawOpening && braceDepth === 0 && j >= i) {
          endLine = j + 1;
          break;
        }
      }

      blocks.push({
        type,
        name,
        startLine: i + 1,
        endLine,
        header: type === 'gradle_task' ? `task ${name}` : `${name} { ... }`,
      });
    }

    blocks.push({
      type: 'gradle_project',
      name: path.basename(args.filePath),
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `Gradle ${path.basename(args.filePath)}`,
    });

    blocks.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      return a.endLine - b.endLine;
    });
    return blocks;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'gradle',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: true,
      supportsBlocks: true,
    };
  }

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks({
      filePath: args.filePath,
      content: args.content,
    });
    const line = Math.max(1, args.line);
    return (
      blocks.find(
        block => line >= block.startLine && line <= block.endLine,
      ) || null
    );
  }

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks({
      filePath: args.filePath,
      content: args.content,
    });
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
    return this.parseBlocks({
      filePath: args.filePath,
      content: args.content,
    });
  }

  /**
   * Returns full-file block span when no specific block is found.
   */
  override describeBlock(args: DescribeBlockArgs): BlockDescription {
    const result = super.describeBlock(args);
    if (result.blockType !== 'Resource') {
      return result;
    }

    return {
      blockType: 'gradle_project',
      blockName: path.basename(args.filePath),
      blockStartLine: 0,
      blockEndLine: args.content.split('\n').length - 1,
    };
  }
}
