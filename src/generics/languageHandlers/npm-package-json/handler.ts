import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DetectLanguageArgs,
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

export class NpmPackageJSONLanguageHandler implements ILanguageHandler {
  displayName = 'NPM Package JSON';
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

  /**
   * Parses package metadata and top-level dependency/script sections from package JSON files.
   */
  private parseResources(args: {
    filePath: string;
    content: string;
  }): BlockRange[] {
    const resources: BlockRange[] = [];
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
    const sectionResources: BlockRange[] = [];
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
      sectionResources.push({
        type: 'npm_section',
        name: curr.key,
        startLine: curr.line,
        endLine: next ? Math.max(curr.line, next.line - 1) : lines.length,
        header: `npm ${curr.key}`,
      });
    }

    resources.push(...sectionResources);
    resources.push({
      type: 'npm_package',
      name: packageName,
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `npm "${packageName}"`,
    });
    resources.sort((a, b) => {
      if (a.startLine !== b.startLine) {
        return a.startLine - b.startLine;
      }
      return a.endLine - b.endLine;
    });
    return resources;
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

  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null {
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
    const resource = this.findBlockAtLine(args) || this.findNearestBlock(args);
    if (!resource) {
      return null;
    }
    return { startLine: resource.startLine, endLine: resource.endLine };
  }

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseResources({
      filePath: args.filePath,
      content: args.content,
    });
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
      languageId: 'npm-package-json',
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
