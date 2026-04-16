import path from 'path';
import {
  DetectLanguageArgs,
  DocumentInfo,
  FindNearestBlockArgs,
  FindBlockAtLineArgs,
  GetDocumentInfoArgs,
  ListBlocksArgs,
  BlockRange,
  MatchRulesToDiffArgs,
} from '../../types';
import { BaseLanguageHandler } from '../base';

export class TerraformLanguageHandler extends BaseLanguageHandler {
  displayName = 'Terraform';
  diagnosticClearScope = 'directory' as const;
  codeResourceType = 'terraform';
  extensions = ['.tf', '.tfvars', '.hcl'];

  detectLanguage(args: DetectLanguageArgs): boolean {
    const ext = path.extname(args.filePath || '').toLowerCase();
    return ext === '.tf' || ext === '.tfvars' || ext === '.hcl';
  }

  /**
   * Parses Terraform-style resource blocks and returns their line ranges.
   */
  private parseBlocks(content: string): BlockRange[] {
    const lines = content.split('\n');
    const blocks: BlockRange[] = [];
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

      blocks.push({
        type,
        name,
        startLine,
        endLine,
        header: `resource "${type}" "${name}"`,
      });
    }

    return blocks;
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

  /**
   * Terraform-specific rule matching: filters by block-type variants so that
   * rules are attributed only to relevant resource types.
   */
  override matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    if (args.blockType === 'Resource' || !args.blockType) {
      return [...args.allFileRules];
    }

    const normalized = args.blockType
      .replace(/^hashicorp__/, '')
      .replace(/^aws-resources-/, '')
      .replace(/^google-resources-/, '')
      .replace(/^azurerm-resources-/, '')
      .replace(/\./g, '_')
      .replace(/-/g, '_');

    const core = normalized.replace(/^(aws_|google_|azurerm_)/, '');
    const coreWithDashes = core.replace(/_/g, '-');
    const normalizedWithDashes = normalized.replace(/_/g, '-');

    const variants = [
      normalized,
      normalizedWithDashes,
      `hashicorp__aws-resources-${normalized}`,
      `hashicorp__aws-resources-aws_${normalized}`,
      `hashicorp__google-resources-${normalized}`,
      `hashicorp__google-resources-google_${normalized}`,
      `aws-resources-${normalized}`,
      `aws-resources-aws_${normalized}`,
      `hashicorp__aws-resources-${normalizedWithDashes}`,
      `aws-resources-${normalizedWithDashes}`,
    ];

    if (core.includes('_') || core.includes('-')) {
      variants.splice(1, 0, core, coreWithDashes);
    }

    const matched: string[] = [];
    for (const ruleName of args.allFileRules) {
      const ruleLower = ruleName.toLowerCase();
      if (variants.some(v => ruleLower.includes(v.toLowerCase()))) {
        matched.push(ruleName);
      }
    }

    return matched.length > 0 ? matched : [...args.allFileRules];
  }
}
