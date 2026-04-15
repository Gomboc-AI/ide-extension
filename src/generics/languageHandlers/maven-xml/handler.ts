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

export class MavenXMLLanguageHandler implements ILanguageHandler {
  displayName = 'Maven XML';
  extensions = ['.xml'];

  /**
   * Parses Maven project and dependency blocks from XML content.
   */
  private parseResources(args: {
    filePath: string;
    content: string;
  }): ResourceRange[] {
    const lines = args.content.split('\n');
    const resources: ResourceRange[] = [];

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
      resources.push({
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
    resources.push({
      type: 'maven_project',
      name: projectName,
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `Maven ${projectName}`,
    });

    resources.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      // Keep narrower ranges first so dependency blocks win over project fallback.
      return a.endLine - b.endLine;
    });
    return resources;
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
      supportsResources: true,
    };
  }

  findResourceAtLine(args: FindResourceAtLineArgs): ResourceRange | null {
    const resources = this.parseResources({
      filePath: args.filePath,
      content: args.content,
    });
    const line = Math.max(1, args.line);
    return (
      resources.find(
        resource => line >= resource.startLine && line <= resource.endLine,
      ) || null
    );
  }

  findNearestResource(args: FindNearestResourceArgs): ResourceRange | null {
    const resources = this.parseResources({
      filePath: args.filePath,
      content: args.content,
    });
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
    return this.parseResources({
      filePath: args.filePath,
      content: args.content,
    });
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
      languageId: 'maven-xml',
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
