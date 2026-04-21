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
  MatchRulesToDiffArgs,
  ResourceContextExtractKind,
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

  override getResourceContextExtractKind(): ResourceContextExtractKind {
    return 'yaml';
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

  /**
   * Normalizes a CloudFormation `Type` string (e.g. AWS::S3::Bucket) into
   * lowercase segments. Returns null when the type is missing or not usable for matching.
   */
  private parseCloudFormationTypeSegments(blockType: string): string[] | null {
    const cleaned = (blockType || '').trim().toLowerCase();
    if (
      !cleaned ||
      cleaned === 'resource' ||
      cleaned === 'cloudformation_resource'
    ) {
      return null;
    }
    const segments = cleaned.split(/[:._-]+/).filter(Boolean);
    return segments.length > 0 ? segments : null;
  }

  private buildBlockTypeMatchTokens(blockType: string): string[] {
    const segments = this.parseCloudFormationTypeSegments(blockType);
    if (!segments) {
      return [];
    }

    const cleaned = (blockType || '').trim().toLowerCase();
    const joinedUnderscore = segments.join('_');
    const joinedDash = segments.join('-');
    const provider = segments[0];
    const coreSegments = segments.length > 1 ? segments.slice(1) : segments;
    const coreUnderscore = coreSegments.join('_');
    const coreDash = coreSegments.join('-');

    const variants = new Set<string>([
      cleaned,
      joinedUnderscore,
      joinedDash,
      `cloudformation-${joinedDash}`,
      `cloudformation_${joinedUnderscore}`,
    ]);

    if (coreUnderscore) {
      variants.add(coreUnderscore);
      variants.add(coreDash);
    }

    if (provider) {
      variants.add(`${provider}_${coreUnderscore}`);
      variants.add(`${provider}-${coreDash}`);
      variants.add(`aws-resources-${provider}_${coreUnderscore}`);
      variants.add(`aws-resources-${provider}-${coreDash}`);
      variants.add(`hashicorp__aws-resources-${provider}_${coreUnderscore}`);
      variants.add(`hashicorp__aws-resources-${provider}-${coreDash}`);
    }

    return Array.from(variants).filter(Boolean);
  }

  private buildContextTokens(args: MatchRulesToDiffArgs): string[] {
    const rawTokens: string[] = [];
    if (Array.isArray(args.properties)) {
      rawTokens.push(...args.properties);
    }
    if (args.diffContent) {
      rawTokens.push(...args.diffContent.split(/[^a-zA-Z0-9_:-]+/));
    }

    const stopWords = new Set([
      'resources',
      'resource',
      'properties',
      'property',
      'metadata',
      'type',
      'value',
      'name',
      'ref',
    ]);
    const out = new Set<string>();

    for (const token of rawTokens) {
      const normalized = token
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_:-]+/g, '');
      if (!normalized) {
        continue;
      }
      const pieces = normalized
        .split(/[_:-]+/)
        .map(piece => piece.trim())
        .filter(piece => piece.length >= 3 && !stopWords.has(piece));
      for (const piece of pieces) {
        out.add(piece);
      }
    }

    return Array.from(out);
  }

  private buildServiceMatchTokens(blockType: string): string[] {
    const segments = this.parseCloudFormationTypeSegments(blockType);
    if (!segments || segments.length < 2) {
      return [];
    }

    const provider = segments[0];
    const service = segments[1];
    const variants = new Set<string>([
      `${provider}_${service}`,
      `${provider}-${service}`,
      `aws-resources-${provider}_${service}`,
      `aws-resources-${provider}-${service}`,
      `hashicorp__aws-resources-${provider}_${service}`,
      `hashicorp__aws-resources-${provider}-${service}`,
      service,
    ]);
    return Array.from(variants);
  }

  /**
   * CloudFormation-specific rule matching for ORL file-level rule lists.
   *
   * 1. **Full resource type** — Match rule names against tokens derived from the
   *    block type (e.g. `AWS::S3::Bucket` → `aws_s3_bucket`, provider-prefixed variants).
   * 2. **Service-only fallback** — If no rule matches the full type, narrow by
   *    provider + service (e.g. `aws` + `kms`) so unrelated services (e.g. S3) do not appear.
   *    If we cannot build service tokens, fall back to all file rules.
   * 3. **Tie-break** — When several rules still match the same type, prefer rules
   *    whose names overlap diff/property tokens from the change.
   * 4. **Empty match** — If type and service filters yield nothing, return [] (do not
   *    broaden to unrelated rules).
   */
  override matchRulesToDiff(args: MatchRulesToDiffArgs): string[] {
    const typeTokens = this.buildBlockTypeMatchTokens(args.blockType);
    if (typeTokens.length === 0) {
      return [...args.allFileRules];
    }

    const typeMatched = args.allFileRules.filter(ruleName => {
      const lower = ruleName.toLowerCase();
      return typeTokens.some(token => lower.includes(token));
    });

    if (typeMatched.length === 0) {
      const serviceTokens = this.buildServiceMatchTokens(args.blockType);
      if (serviceTokens.length === 0) {
        return [...args.allFileRules];
      }
      const serviceMatched = args.allFileRules.filter(ruleName => {
        const lower = ruleName.toLowerCase();
        return serviceTokens.some(token => lower.includes(token));
      });
      return serviceMatched;
    }

    if (typeMatched.length === 1) {
      return typeMatched;
    }

    const contextTokens = this.buildContextTokens(args);
    if (contextTokens.length === 0) {
      return typeMatched;
    }

    const withScores = typeMatched.map(ruleName => {
      const lower = ruleName.toLowerCase();
      const score = contextTokens.reduce(
        (acc, token) => acc + (lower.includes(token) ? 1 : 0),
        0,
      );
      return { ruleName, score };
    });
    const maxScore = Math.max(...withScores.map(item => item.score));
    if (maxScore <= 0) {
      return typeMatched;
    }

    return withScores
      .filter(item => item.score === maxScore)
      .map(item => item.ruleName);
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
