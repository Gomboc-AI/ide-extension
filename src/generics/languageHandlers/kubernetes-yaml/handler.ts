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
  ResourceContextExtractKind,
} from '../../types';
import { YamlBaseLanguageHandler } from '../yamlBase';

export class KubernetesYAMLLanguageHandler extends YamlBaseLanguageHandler {
  displayName = 'Kubernetes YAML';
  codeResourceType = 'kubernetes';
  extensions = ['.yaml', '.yml'];

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
    const dirPath = path.dirname(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml') {
      return false;
    }

    const firstLines = content.split('\n').slice(0, 50).join('\n');
    const isK8sDir =
      dirPath.includes('/k8s/') ||
      dirPath.includes('/kubernetes/') ||
      dirPath.includes('/manifests/') ||
      dirPath.includes('\\k8s\\') ||
      dirPath.includes('\\kubernetes\\') ||
      dirPath.includes('\\manifests\\');

    return (
      (this.hasPatternAtLineStart(firstLines, 'kind:') &&
        this.hasPatternAtLineStart(firstLines, 'apiVersion:')) ||
      isK8sDir
    );
  }

  override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'yaml';
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    if (args.blockName?.trim()) {
      return `${args.blockType}/${args.blockName}`;
    }
    return path.basename(args.filePath);
  }

  /**
   * Parses top-level Kubernetes resources by detecting `kind` + `metadata.name`.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const isDocBoundary = (line: string): boolean => line.trim() === '---';
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
      let metadataLine = -1;
      let endLine = lines.length;

      for (let j = i + 1; j < lines.length; j++) {
        if (isDocBoundary(lines[j])) {
          endLine = j;
          break;
        }
        if (isTopLevelKey(lines[j], 'apiVersion')) {
          endLine = j;
          break;
        }

        const trimmed = lines[j].trim();
        if (metadataLine < 0 && /^metadata:\s*$/.test(trimmed)) {
          metadataLine = j;
          continue;
        }
        if (metadataLine >= 0) {
          const indent = lines[j].match(/^(\s*)/)?.[1]?.length ?? 0;
          const metadataIndent =
            lines[metadataLine].match(/^(\s*)/)?.[1]?.length ?? 0;
          if (indent <= metadataIndent && trimmed.includes(':')) {
            metadataLine = -1;
            continue;
          }
          const nameMatch = trimmed.match(/^name:\s*(.+)$/);
          if (nameMatch) {
            name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
          }
        }
      }

      blocks.push({
        type: kind,
        name,
        startLine: i + 1,
        endLine,
        header: name ? `${kind} "${name}"` : kind,
      });
    }

    return blocks;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'kubernetes-yaml',
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
