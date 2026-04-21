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

export class BicepLanguageHandler extends BaseLanguageHandler {
  displayName = 'Bicep';
  codeResourceType = 'bicep';
  extensions = ['.bicep'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.bicep';
  }

  /**
   * Parses top-level Bicep declarations and expands multiline value spans.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const declarationPattern =
      /^\s*(resource|module|param|var|output)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) {
        continue;
      }

      const match = line.match(declarationPattern);
      if (!match) {
        continue;
      }

      const blockKind = match[1];
      const blockName = match[2];
      const type = `bicep_${blockKind}`;
      let endLine = i + 1;

      const startValue = line.includes('=')
        ? line.slice(line.indexOf('=') + 1)
        : '';
      let depth = this.countDepth(startValue);
      const consumedValueOnLine = startValue.trim().length > 0;

      if (
        !consumedValueOnLine &&
        (blockKind === 'resource' || blockKind === 'module')
      ) {
        depth = 1;
      }

      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        const nextTrimmed = next.trim();
        if (!nextTrimmed || nextTrimmed.startsWith('//')) {
          endLine = j + 1;
          continue;
        }
        if (next.match(declarationPattern) && depth <= 0) {
          break;
        }
        depth += this.countDepth(next);
        endLine = j + 1;
        if (depth <= 0 && /[}\])]/.test(next)) {
          break;
        }
      }

      blocks.push({
        type,
        name: blockName,
        startLine: i + 1,
        endLine,
        header: `${blockKind} ${blockName}`,
      });
    }

    return blocks;
  }

  private countDepth(line: string): number {
    const opens =
      (line.match(/{/g) || []).length +
      (line.match(/\[/g) || []).length +
      (line.match(/\(/g) || []).length;
    const closes =
      (line.match(/}/g) || []).length +
      (line.match(/]/g) || []).length +
      (line.match(/\)/g) || []).length;
    return opens - closes;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'bicep',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: true,
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
