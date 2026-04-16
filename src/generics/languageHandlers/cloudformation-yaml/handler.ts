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
import { YamlBaseLanguageHandler } from '../yamlBase';

export class CloudFormationYAMLLanguageHandler extends YamlBaseLanguageHandler {
  displayName = 'CloudFormation YAML';
  codeResourceType = 'cloudformation';
  extensions = ['.yaml', '.yml'];

  private hasPatternAtLineStart(content: string, pattern: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith(pattern)) {
        return true;
      }
    }
    return false;
  }

  detectLanguage(args: DetectLanguageArgs): boolean {
    const filePath = args.filePath || '';
    const content = args.content || '';
    const fileName = path.basename(filePath).toLowerCase();
    const dirPath = path.dirname(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml') {
      return false;
    }

    const firstLines = content.split('\n').slice(0, 50).join('\n');
    const contentLower = firstLines.toLowerCase();
    const isHelmDir =
      dirPath.includes('/charts/') ||
      dirPath.includes('/helm/') ||
      dirPath.includes('\\charts\\') ||
      dirPath.includes('\\helm\\');
    const isK8sDir =
      dirPath.includes('/k8s/') ||
      dirPath.includes('/kubernetes/') ||
      dirPath.includes('/manifests/') ||
      dirPath.includes('\\k8s\\') ||
      dirPath.includes('\\kubernetes\\') ||
      dirPath.includes('\\manifests\\');

    const isHelm =
      this.hasPatternAtLineStart(firstLines, '{{') ||
      contentLower.includes('.values') ||
      contentLower.includes('.chart') ||
      contentLower.includes('.release') ||
      fileName.includes('helm') ||
      fileName.includes('chart') ||
      isHelmDir;
    const isKubernetes =
      (this.hasPatternAtLineStart(firstLines, 'kind:') &&
        this.hasPatternAtLineStart(firstLines, 'apiVersion:')) ||
      isK8sDir;

    return !isHelm && !isKubernetes;
  }

  override formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string {
    return `CloudFormation: ${path.basename(args.filePath)}`;
  }

  /**
   * Parses top-level CloudFormation resources from YAML lines.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
    const resourcesLineIndex = lines.findIndex(
      line => line.trim() === 'Resources:',
    );

    if (resourcesLineIndex < 0) {
      return blocks;
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

      blocks.push({
        type: type || 'cloudformation_resource',
        name: logicalId,
        startLine: i + 1,
        endLine,
        header: type ? `${logicalId} (${type})` : logicalId,
      });
    }

    return blocks;
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
