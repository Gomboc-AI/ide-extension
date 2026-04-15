import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestResourceArgs,
  FindResourceAtLineArgs,
  FindScopedEditRangeArgs,
  ILanguageHandler,
  ListResourcesArgs,
  ResourceRange,
  ScopedEditRange,
  GetDocumentInfoArgs,
} from '../../types';

export class CloudFormationYAMLLanguageHandler implements ILanguageHandler {
  displayName = 'CloudFormation YAML';
  extensions = ['.yaml', '.yml'];

  /**
   * Parses top-level CloudFormation resources from YAML lines.
   */
  private parseResources(content: string): ResourceRange[] {
    const lines = content.split('\n');
    const resources: ResourceRange[] = [];
    const resourcesLineIndex = lines.findIndex(
      line => line.trim() === 'Resources:',
    );

    if (resourcesLineIndex < 0) {
      return resources;
    }

    const resourcesIndent =
      lines[resourcesLineIndex].match(/^(\s*)/)?.[1]?.length ?? 0;
    const logicalIdPattern = /^([A-Za-z0-9][A-Za-z0-9_-]*)\s*:\s*$/;

    for (let i = resourcesLineIndex + 1; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      const indent = raw.match(/^(\s*)/)?.[1]?.length ?? 0;

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (indent <= resourcesIndent) {
        break;
      }

      if (indent !== resourcesIndent + 2) {
        continue;
      }

      const logicalIdMatch = trimmed.match(logicalIdPattern);
      if (!logicalIdMatch) {
        continue;
      }

      const logicalId = logicalIdMatch[1];
      let endLine = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const nextRaw = lines[j];
        const nextTrimmed = nextRaw.trim();
        const nextIndent = nextRaw.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (!nextTrimmed || nextTrimmed.startsWith('#')) {
          continue;
        }
        if (nextIndent <= resourcesIndent) {
          endLine = j;
          break;
        }
        if (
          nextIndent === resourcesIndent + 2 &&
          logicalIdPattern.test(nextTrimmed)
        ) {
          endLine = j;
          break;
        }
      }

      let type: string | undefined;
      const typePattern = /^\s*Type\s*:\s*["']?([^"']+)["']?\s*$/;
      for (let j = i + 1; j < endLine; j++) {
        const typeMatch = lines[j].match(typePattern);
        if (typeMatch) {
          type = typeMatch[1].trim();
          break;
        }
      }

      resources.push({
        type: type || 'cloudformation_resource',
        name: logicalId,
        startLine: i + 1,
        endLine,
        header: type ? `${logicalId} (${type})` : logicalId,
      });
    }

    return resources;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'cloudformation-yaml',
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
    const hit = resources.find(
      resource => line >= resource.startLine && line <= resource.endLine,
    );
    return hit || null;
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
    if (previous) {
      return previous;
    }

    return resources[0];
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
      languageId: 'cloudformation-yaml',
      filePath: args.filePath,
      resource: resource || undefined,
      nearestResource: nearestResource || undefined,
      diagnosticAnchorLine:
        (resource || nearestResource)?.startLine || Math.max(1, args.hint.line),
      resourceHeader:
        (resource || nearestResource)?.header ||
        `CloudFormation ${path.basename(args.filePath)}`,
      fallbackResource: !(resource || nearestResource),
      tags: [],
    };
  }
}
