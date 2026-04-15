import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  FindScopedEditRangeArgs,
  GetDocumentInfoArgs,
  ILanguageHandler,
  ListBlocksArgs,
  BlockRange,
  ScopedEditRange,
} from '../../types';

export class KubernetesYAMLLanguageHandler implements ILanguageHandler {
  displayName = 'Kubernetes YAML';
  extensions = ['.yaml', '.yml'];

  /**
   * Parses top-level Kubernetes resources by detecting `kind` + `metadata.name`.
   */
  private parseResources(content: string): BlockRange[] {
    const lines = content.split('\n');
    const resources: BlockRange[] = [];
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

      resources.push({
        type: kind,
        name,
        startLine: i + 1,
        endLine,
        header: name ? `${kind} "${name}"` : kind,
      });
    }

    return resources;
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
    const resources = this.parseResources(args.content);
    const line = Math.max(1, args.line);
    return (
      resources.find(
        resource => line >= resource.startLine && line <= resource.endLine,
      ) || null
    );
  }

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
    const resources = this.parseResources(args.content);
    if (resources.length === 0) {
      return null;
    }
    const line = Math.max(1, args.line);
    const containing = resources.find(
      resource => line >= resource.startLine && line <= resource.endLine,
    );
    if (containing) {
      return containing;
    }
    const previous = resources
      .filter(resource => resource.startLine <= line)
      .sort((a, b) => b.startLine - a.startLine)[0];
    return previous || resources[0];
  }

  findScopedEditRange(args: FindScopedEditRangeArgs): ScopedEditRange | null {
    const resource = this.findBlockAtLine(args) || this.findNearestBlock(args);
    if (!resource) {
      return null;
    }
    return { startLine: resource.startLine, endLine: resource.endLine };
  }

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseResources(args.content);
  }

  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext {
    const resource = this.findBlockAtLine({
      filePath: args.filePath,
      content: args.content,
      line: args.hint.line,
    });
    const nearestResource =
      resource ||
      this.findNearestBlock({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      });

    return {
      languageId: 'kubernetes-yaml',
      filePath: args.filePath,
      block: resource || undefined,
      nearestBlock: nearestResource || undefined,
      diagnosticAnchorLine:
        (resource || nearestResource)?.startLine || Math.max(1, args.hint.line),
      blockHeader:
        (resource || nearestResource)?.header || path.basename(args.filePath),
      fallbackBlock: !(resource || nearestResource),
      tags: [],
    };
  }
}
