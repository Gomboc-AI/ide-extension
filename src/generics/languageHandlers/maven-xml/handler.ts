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

export class MavenXMLLanguageHandler extends BaseLanguageHandler {
  displayName = 'Maven XML';
  codeResourceType = 'xml';
  extensions = ['.xml'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.xml';
  }

  /**
   * Parses Maven project and dependency blocks from XML content.
   */
  private parseBlocks(args: {
    filePath: string;
    content: string;
  }): BlockRange[] {
    const lines = args.content.split('\n');
    const blocks: BlockRange[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/<dependency\b/.test(line)) {
        continue;
      }
      let endLine = lines.length;
      let groupId: string | undefined;
      let artifactId: string | undefined;
      for (let j = i; j < lines.length; j++) {
        const groupMatch = lines[j].match(/<groupId>\s*([^<]+)\s*<\/groupId>/);
        if (groupMatch && !groupId) {
          groupId = groupMatch[1].trim();
        }
        const artifactMatch = lines[j].match(
          /<artifactId>\s*([^<]+)\s*<\/artifactId>/,
        );
        if (artifactMatch && !artifactId) {
          artifactId = artifactMatch[1].trim();
        }
        if (/<\/dependency>/.test(lines[j])) {
          endLine = j + 1;
          break;
        }
      }
      const depName =
        groupId && artifactId
          ? `${groupId}:${artifactId}`
          : artifactId || groupId || `dependency@${i + 1}`;
      blocks.push({
        type: 'maven_dependency',
        name: depName,
        startLine: i + 1,
        endLine,
        header: `dependency ${depName}`,
      });
    }

    const artifactMatch = args.content.match(
      /<artifactId>\s*([^<]+)\s*<\/artifactId>/,
    );
    const groupMatch = args.content.match(/<groupId>\s*([^<]+)\s*<\/groupId>/);
    const projectName =
      groupMatch && artifactMatch
        ? `${groupMatch[1].trim()}:${artifactMatch[1].trim()}`
        : artifactMatch?.[1]?.trim() || path.basename(args.filePath);
    blocks.push({
      type: 'maven_project',
      name: projectName,
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `Maven ${projectName}`,
    });

    blocks.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      // Keep narrower ranges first so dependency blocks win over project fallback.
      return a.endLine - b.endLine;
    });
    return blocks;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'maven-xml',
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
      blockType: 'maven_project',
      blockName: null,
      blockStartLine: 0,
      blockEndLine: args.content.split('\n').length - 1,
    };
  }
}
