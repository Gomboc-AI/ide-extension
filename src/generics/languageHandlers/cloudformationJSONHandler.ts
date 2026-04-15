import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestResourceArgs,
  FindResourceAtLineArgs,
  ILanguageHandler,
  ListResourcesArgs,
  ResourceRange,
  GetDocumentInfoArgs,
} from '../types';

export class CloudFormationJSONLanguageHandler implements ILanguageHandler {
  displayName = 'CloudFormation JSON';
  extensions = ['.json'];

  /**
   * Parses CloudFormation JSON Resources and maps them to source lines.
   */
  private parseResources(content: string): ResourceRange[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const resourcesObject = (parsed as { Resources?: unknown }).Resources;
    if (!resourcesObject || typeof resourcesObject !== 'object') {
      return [];
    }

    const lines = content.split('\n');
    const entries = Object.entries(resourcesObject as Record<string, unknown>);
    const resources: ResourceRange[] = [];

    const escapeRegex = (value: string): string =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const [logicalId, resourceNode] of entries) {
      const type =
        resourceNode &&
        typeof resourceNode === 'object' &&
        typeof (resourceNode as { Type?: unknown }).Type === 'string'
          ? ((resourceNode as { Type: string }).Type as string)
          : undefined;

      const idPattern = new RegExp(`^\\s*"${escapeRegex(logicalId)}"\\s*:`);
      const startLine = Math.max(
        1,
        lines.findIndex(line => idPattern.test(line)) + 1,
      );

      resources.push({
        type: type || 'cloudformation_resource',
        name: logicalId,
        startLine,
        endLine: lines.length,
        header: type ? `${logicalId} (${type})` : logicalId,
      });
    }

    resources.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < resources.length; i++) {
      const next = resources[i + 1];
      resources[i].endLine = next
        ? Math.max(resources[i].startLine, next.startLine - 1)
        : lines.length;
    }

    return resources;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'cloudformation-json',
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
      languageId: 'cloudformation-json',
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
