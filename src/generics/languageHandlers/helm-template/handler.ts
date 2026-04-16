import path from 'path';
import {
  DetectLanguageArgs,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  BlockRange,
} from '../../types';
import { YamlBaseLanguageHandler } from '../yamlBase';

export class HelmTemplateLanguageHandler extends YamlBaseLanguageHandler {
  displayName = 'Helm Template';
  codeResourceType = 'kubernetes';
  extensions = ['.tpl', '.yaml', '.yml'];

  private hasPatternAtLineStart(content: string, pattern: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith(pattern)) {
        return true;
      }
    }
    return false;
  }

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const content = args.content || '';
    const fileName = path.basename(filePath).toLowerCase();
    const dirPath = path.dirname(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.tpl') {
      return true;
    }

    if (ext !== '.yaml' && ext !== '.yml') {
      return false;
    }

    const firstLines = content.split('\n').slice(0, 50).join('\n');
    const contentLower = firstLines.toLowerCase();
    const isHelmDir =
      dirPath.includes('/charts/') ||
      dirPath.includes('/helm/') ||
      dirPath.includes('\\charts\\') ||
      dirPath.includes('\\helm\\');

    return (
      this.hasPatternAtLineStart(firstLines, '{{') ||
      contentLower.includes('.values') ||
      contentLower.includes('.chart') ||
      contentLower.includes('.release') ||
      fileName.includes('helm') ||
      fileName.includes('chart') ||
      isHelmDir
    );
  }

  /**
   * Parses Helm `define` blocks and YAML-like documents from template files.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];

    const definePattern = /^\s*\{\{[-]?\s*define\s+"([^"]+)"\s*[-]?\}\}/;
    const endPattern = /^\s*\{\{[-]?\s*end\s*[-]?\}\}/;
    for (let i = 0; i < lines.length; i++) {
      const defineMatch = lines[i].match(definePattern);
      if (!defineMatch) {
        continue;
      }
      const name = defineMatch[1];
      let endLine = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (endPattern.test(lines[j])) {
          endLine = j + 1;
          break;
        }
      }
      blocks.push({
        type: 'helm_template',
        name,
        startLine: i + 1,
        endLine,
        header: `define "${name}"`,
      });
    }

    const isTopLevelKey = (line: string, key: string): boolean => {
      const trimmed = line.trim();
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      return indent === 0 && trimmed.startsWith(`${key}:`);
    };

    for (let i = 0; i < lines.length; i++) {
      if (!isTopLevelKey(lines[i], 'kind')) {
        continue;
      }
      const kindMatch = lines[i].trim().match(/^kind:\s*(.+)$/);
      if (!kindMatch) {
        continue;
      }
      const kind = kindMatch[1].trim().replace(/^["']|["']$/g, '');
      let name: string | undefined;
      let endLine = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        const indent = lines[j].match(/^(\s*)/)?.[1]?.length ?? 0;
        if (trimmed === '---') {
          endLine = j;
          break;
        }
        if (indent === 0 && /^kind:/.test(trimmed)) {
          endLine = j;
          break;
        }
        const nameMatch = trimmed.match(/^name:\s*(.+)$/);
        if (nameMatch && !name) {
          name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
        }
      }
      blocks.push({
        type: `helm_${kind.toLowerCase()}`,
        name,
        startLine: i + 1,
        endLine,
        header: name ? `${kind} "${name}"` : kind,
      });
    }

    blocks.sort((a, b) => a.startLine - b.startLine);
    return blocks;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'helm-template',
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
      blocks.find(
        block => line >= block.startLine && line <= block.endLine,
      ) || null
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
