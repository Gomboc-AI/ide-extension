import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestResourceArgs,
  FindResourceAtLineArgs,
  FindScopedEditRangeArgs,
  GetDocumentInfoArgs,
  ILanguageHandler,
  ListResourcesArgs,
  ResourceRange,
  ScopedEditRange,
} from '../../types';

export class HelmTemplateLanguageHandler implements ILanguageHandler {
  displayName = 'Helm Template';
  extensions = ['.tpl', '.yaml', '.yml'];

  /**
   * Parses Helm `define` blocks and YAML-like documents from template files.
   */
  private parseResources(content: string): ResourceRange[] {
    const lines = content.split('\n');
    const resources: ResourceRange[] = [];

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
      resources.push({
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
      resources.push({
        type: `helm_${kind.toLowerCase()}`,
        name,
        startLine: i + 1,
        endLine,
        header: name ? `${kind} "${name}"` : kind,
      });
    }

    resources.sort((a, b) => a.startLine - b.startLine);
    return resources;
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
      supportsResources: true,
    };
  }

  findResourceAtLine(args: FindResourceAtLineArgs): ResourceRange | null {
    const resources = this.parseResources(args.content);
    const line = Math.max(1, args.line);
    return (
      resources.find(
        resource => line >= resource.startLine && line <= resource.endLine,
      ) || null
    );
  }

  findNearestResource(args: FindNearestResourceArgs): ResourceRange | null {
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
    const resource =
      this.findResourceAtLine(args) || this.findNearestResource(args);
    if (!resource) {
      return null;
    }
    return { startLine: resource.startLine, endLine: resource.endLine };
  }

  listResources(args: ListResourcesArgs): ResourceRange[] {
    return this.parseResources(args.content);
  }

  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext {
    const resource = this.findResourceAtLine({
      filePath: args.filePath,
      content: args.content,
      line: args.hint.line,
    });
    const nearestResource =
      resource ||
      this.findNearestResource({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      });

    return {
      languageId: 'helm-template',
      filePath: args.filePath,
      resource: resource || undefined,
      nearestResource: nearestResource || undefined,
      diagnosticAnchorLine:
        (resource || nearestResource)?.startLine || Math.max(1, args.hint.line),
      resourceHeader:
        (resource || nearestResource)?.header || path.basename(args.filePath),
      fallbackResource: !(resource || nearestResource),
      tags: [],
    };
  }
}
