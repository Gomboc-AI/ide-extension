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

export class GradleLanguageHandler implements ILanguageHandler {
  displayName = 'Gradle';
  extensions = ['.gradle', '.kts'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.gradle' || ext === '.kts';
  }

  /**
   * Parses common Gradle block structures and task declarations.
   */
  private parseResources(args: {
    filePath: string;
    content: string;
  }): BlockRange[] {
    const lines = args.content.split('\n');
    const resources: BlockRange[] = [];
    const taskPattern = /^\s*task\s+([A-Za-z0-9_]+)\s*\{/;
    const registerTaskPattern =
      /^\s*tasks\.(?:register|create)\(\s*["']([^"']+)["']/;
    const blockPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\{/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let type = 'gradle_block';
      let name: string | undefined;
      let match = line.match(taskPattern);
      if (match) {
        type = 'gradle_task';
        name = match[1];
      } else {
        match = line.match(registerTaskPattern);
        if (match) {
          type = 'gradle_task';
          name = match[1];
        } else {
          match = line.match(blockPattern);
          if (match) {
            name = match[1];
          }
        }
      }
      if (!match || !name) {
        continue;
      }

      let braceDepth = 0;
      let sawOpening = false;
      let endLine = i + 1;
      for (let j = i; j < lines.length; j++) {
        const openCount = (lines[j].match(/{/g) || []).length;
        const closeCount = (lines[j].match(/}/g) || []).length;
        if (openCount > 0) {
          sawOpening = true;
        }
        braceDepth += openCount - closeCount;
        if (sawOpening && braceDepth === 0 && j >= i) {
          endLine = j + 1;
          break;
        }
      }

      resources.push({
        type,
        name,
        startLine: i + 1,
        endLine,
        header: type === 'gradle_task' ? `task ${name}` : `${name} { ... }`,
      });
    }

    resources.push({
      type: 'gradle_project',
      name: path.basename(args.filePath),
      startLine: 1,
      endLine: Math.max(1, lines.length),
      header: `Gradle ${path.basename(args.filePath)}`,
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
      languageId: 'gradle',
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
      languageId: 'gradle',
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
