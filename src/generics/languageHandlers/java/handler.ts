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

export class JavaLanguageHandler extends BaseLanguageHandler {
  displayName = 'Java';
  codeResourceType = 'java';
  extensions = ['.java'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.java';
  }

  /**
   * Parses Java declaration blocks (types + methods/constructors) using brace spans.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const typePattern =
      /^\s*(?:public|protected|private|abstract|final|sealed|non-sealed|static|\s)*(class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
    const methodPattern =
      /^\s*(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp|\s)+(?:<[^>]+>\s*)?(?:(?:[A-Za-z_][A-Za-z0-9_<>\[\],.? ]*)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/;
    const controlKeywords = new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'try',
      'do',
      'else',
      'return',
      'new',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith('//') || line.trim() === '*') {
        continue;
      }

      const typeMatch = line.match(typePattern);
      const methodMatch = line.match(methodPattern);
      if (!typeMatch && !methodMatch) {
        continue;
      }

      const openingIndex = line.indexOf('{');
      if (openingIndex < 0) {
        continue;
      }

      let type = 'java_block';
      let name: string | undefined;
      let header = line.trim();

      if (typeMatch) {
        type = `java_${typeMatch[1]}`;
        name = typeMatch[2];
        header = `${typeMatch[1]} ${name}`;
      } else if (methodMatch) {
        const methodName = methodMatch[1];
        if (controlKeywords.has(methodName)) {
          continue;
        }
        type = 'java_method';
        name = methodName;
        header = `method ${methodName}()`;
      }

      let braceDepth = 0;
      let sawOpening = false;
      let endLine = i + 1;

      for (let j = i; j < lines.length; j++) {
        const current = lines[j];
        const openCount = (current.match(/{/g) || []).length;
        const closeCount = (current.match(/}/g) || []).length;
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
        header,
      });
    }

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
      languageId: 'java',
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
    const containing = blocks.filter(
      block => line >= block.startLine && line <= block.endLine,
    );
    if (containing.length === 0) {
      return null;
    }
    containing.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return b.startLine - a.startLine;
      }
      return a.endLine - b.endLine;
    });
    return containing[0];
  }

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    if (blocks.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = blocks.filter(
      block => line >= block.startLine && line <= block.endLine,
    );
    if (containing.length > 0) {
      containing.sort((a, b) => {
        if (a.startLine !== b.startLine) {
          return b.startLine - a.startLine;
        }
        return a.endLine - b.endLine;
      });
      return containing[0];
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
