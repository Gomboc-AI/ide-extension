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
  BuildDiagnosticContextArgs,
  DiagnosticContext,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class CloudFormationJSONLanguageHandler extends BaseLanguageHandler {
  displayName = 'CloudFormation JSON';
  codeResourceType = 'cloudformation';
  extensions = ['.json'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const fileName = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.json') {
      return false;
    }

    return fileName !== 'package.json' && fileName !== 'package-lock.json';
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    return `CloudFormation: ${path.basename(args.filePath)}`;
  }

  /**
   * Parses CloudFormation JSON Resources and maps them to source lines.
   */
  private parseBlocks(content: string): BlockRange[] {
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
    const blocks: BlockRange[] = [];

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

      blocks.push({
        type: type || 'cloudformation_resource',
        name: logicalId,
        startLine,
        endLine: lines.length,
        header: type ? `${logicalId} (${type})` : logicalId,
      });
    }

    blocks.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < blocks.length; i++) {
      const next = blocks[i + 1];
      blocks[i].endLine = next
        ? Math.max(blocks[i].startLine, next.startLine - 1)
        : lines.length;
    }

    return blocks;
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
      supportsBlocks: true,
    };
  }

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null {
    const blocks = this.parseBlocks(args.content);
    const line = Math.max(1, args.line);
    const hit = blocks.find(
      block => line >= block.startLine && line <= block.endLine,
    );
    return hit || null;
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
    if (previous) {
      return previous;
    }

    return blocks[0];
  }

  listBlocks(args: ListBlocksArgs): BlockRange[] {
    return this.parseBlocks(args.content);
  }

  override buildDiagnosticContext(
    args: BuildDiagnosticContextArgs,
  ): DiagnosticContext {
    const ctx = super.buildDiagnosticContext(args);
    if (!ctx.blockHeader || ctx.blockHeader === path.basename(args.filePath)) {
      ctx.blockHeader = `CloudFormation ${path.basename(args.filePath)}`;
    }
    return ctx;
  }
}
