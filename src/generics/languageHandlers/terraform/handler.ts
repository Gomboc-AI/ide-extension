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

export class TerraformLanguageHandler implements ILanguageHandler {
  displayName = 'Terraform';
  extensions = ['.tf', '.tfvars', '.hcl'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.tf' || ext === '.tfvars' || ext === '.hcl';
  }

  /**
   * Parses Terraform-style resource blocks and returns their line ranges.
   */
  private parseResources(content: string): BlockRange[] {
    const lines = content.split('\n');
    const resources: BlockRange[] = [];
    const resourcePattern = /resource\s+"([^"]+)"\s+"([^"]+)"/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const resourceMatch = line.match(resourcePattern);
      if (!resourceMatch) {
        continue;
      }

      const type = resourceMatch[1];
      const name = resourceMatch[2];
      const startLine = i + 1;
      let endLine = startLine;

      let braceDepth = 0;
      let sawOpeningBrace = false;
      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j];
        const openCount = (currentLine.match(/{/g) || []).length;
        const closeCount = (currentLine.match(/}/g) || []).length;
        if (openCount > 0) {
          sawOpeningBrace = true;
        }
        braceDepth += openCount - closeCount;

        if (sawOpeningBrace && braceDepth === 0 && j >= i) {
          endLine = j + 1;
          break;
        }
      }

      resources.push({
        type,
        name,
        startLine,
        endLine,
        header: `resource "${type}" "${name}"`,
      });
    }

    return resources;
  }

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'terraform',
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

    const hit = resources.find(
      resource => line >= resource.startLine && line <= resource.endLine,
    );

    return hit || null;
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
    if (previous) {
      return previous;
    }

    return resources[0];
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
      languageId: 'terraform',
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
