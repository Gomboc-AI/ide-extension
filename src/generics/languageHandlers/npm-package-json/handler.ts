import path from 'path';
import {
  DetectLanguageArgs,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  FormatBlockDisplayNameArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  BlockRange,
  DescribeBlockArgs,
  BlockDescription,
  ResourceContextExtractKind,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class NpmPackageJSONLanguageHandler extends BaseLanguageHandler {
  displayName = 'NPM Package JSON';
  codeResourceType = 'npm';
  extensions = ['.json'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    return (
      ext === '.json' &&
      (fileName === 'package.json' || fileName === 'package-lock.json')
    );
  }

  override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'json';
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    return args.blockName
      ? `npm: ${args.blockName}`
      : path.basename(args.filePath);
  }

  /**
   * Parses package metadata and top-level dependency/script sections from package JSON files.
   */
  private parseBlocks(args: {
    filePath: string;
    content: string;
  }): BlockRange[] {
    const blocks: BlockRange[] = [];
    const lines = args.content.split('\n');
    const fileName = path.basename(args.filePath);

    let packageName = fileName;
    try {
      const parsed = JSON.parse(args.content) as { name?: unknown };
      if (typeof parsed?.name === 'string' && parsed.name.trim()) {
        packageName = parsed.name.trim();
      }
    } catch {
      // Keep best-effort file fallback.
    }

    const sectionNames = [
      'scripts',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
      'engines',
    ];
    const sectionBlocks: BlockRange[] = [];
    const keyLines: Array<{ key: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const indent = lines[i].match(/^(\s*)/)?.[1]?.length ?? 0;
      if (indent !== 2) {
        continue;
      }
      const keyMatch = trimmed.match(/^"([^"]+)"\s*:/);
      if (keyMatch) {
        keyLines.push({ key: keyMatch[1], line: i + 1 });
      }
    }

    for (let i = 0; i < keyLines.length; i++) {
      const curr = keyLines[i];
      if (!sectionNames.includes(curr.key)) {
        continue;
      }
      const next = keyLines[i + 1];
      sectionBlocks.push({
        type: 'npm_section',
        name: curr.key,
        startLine: curr.line,
        endLine: next ? Math.max(curr.line, next.line - 1) : lines.length,
        header: `npm ${curr.key}`,
      });
    }

    blocks.push(...sectionBlocks);
    blocks.push({
      type: 'npm_package',
      name: packageName,
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `npm "${packageName}"`,
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
      languageId: 'npm-package-json',
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
      blocks.find(block => line >= block.startLine && line <= block.endLine) ||
      null
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

    const baseName = path.basename(args.filePath).toLowerCase();
    let packageName: string = baseName;
    try {
      const parsed = JSON.parse(args.content);
      if (typeof parsed.name === 'string') {
        packageName = parsed.name;
      }
    } catch {
      // keep filename fallback
    }

    return {
      blockType: 'npm_package',
      blockName: packageName,
      blockStartLine: 0,
      blockEndLine: args.content.split('\n').length - 1,
    };
  }
}
