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
} from '../types';

export class DockerfileLanguageHandler implements ILanguageHandler {
  displayName = 'Dockerfile';
  extensions = ['Dockerfile', '.dockerfile'];

  /**
   * Parses Docker build stages (`FROM ... [AS name]`) into line ranges.
   */
  private parseResources(content: string): ResourceRange[] {
    const lines = content.split('\n');
    const resources: ResourceRange[] = [];
    const fromPattern =
      /^FROM\s+(?:--[^\s]+\s+)?([^\s]+(?::[^\s]+)?)(?:\s+AS\s+(\S+))?/i;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const fromMatch = trimmed.match(fromPattern);
      if (!fromMatch) {
        continue;
      }

      const image = fromMatch[1];
      const alias = fromMatch[2];
      const display = alias || image;
      let endLine = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('#')) {
          continue;
        }
        if (fromPattern.test(next)) {
          endLine = j;
          break;
        }
      }

      resources.push({
        type: 'docker_stage',
        name: display,
        startLine: i + 1,
        endLine,
        header: `FROM ${display}`,
      });
    }

    return resources;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);
    return {
      languageId: 'dockerfile',
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
      languageId: 'dockerfile',
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
