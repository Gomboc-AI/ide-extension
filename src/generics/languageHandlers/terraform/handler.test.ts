import { TerraformLanguageHandler } from './handler';

const terraformContent = [
  'resource "aws_s3_bucket" "logs" {',
  '  bucket = "logs-bucket"',
  '}',
  '',
  'resource "aws_db_instance" "main" {',
  '  allocated_storage = 20',
  '}',
].join('\n');

describe('TerraformLanguageHandler', () => {
  const handler = new TerraformLanguageHandler();

  it('returns terraform document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/main.tf',
        content: terraformContent,
      }),
    ).toMatchObject({
      languageId: 'terraform',
      fileName: 'main.tf',
      extension: '.tf',
      supportsBlocks: true,
    });
  });

  it('lists terraform blocks with parsed ranges and headers', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/main.tf',
      content: terraformContent,
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'aws_s3_bucket',
      name: 'logs',
      startLine: 1,
      endLine: 3,
      header: 'resource "aws_s3_bucket" "logs"',
    });
    expect(blocks[1]).toMatchObject({
      type: 'aws_db_instance',
      name: 'main',
      startLine: 5,
      endLine: 7,
      header: 'resource "aws_db_instance" "main"',
    });
  });

  it('finds the block at a line and nearest block outside ranges', () => {
    const atLine = handler.findBlockAtLine({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      line: 6,
    });
    const nearestAfter = handler.findNearestBlock({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      line: 100,
    });

    expect(atLine?.name).toBe('main');
    expect(nearestAfter?.name).toBe('main');
  });

  it('builds diagnostic context with anchor/header and fallback', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      hint: { line: 2, filePath: '/workspace/main.tf' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/empty.tf',
      content: 'locals {\n  enabled = true\n}',
      hint: { line: 2, filePath: '/workspace/empty.tf' },
    });

    expect(withBlock.block?.name).toBe('logs');
    expect(withBlock.diagnosticAnchorLine).toBe(1);
    expect(withBlock.blockHeader).toBe('resource "aws_s3_bucket" "logs"');
    expect(withBlock.fallbackBlock).toBe(false);

    expect(fallback.block).toBeUndefined();
    expect(fallback.nearestBlock).toBeUndefined();
    expect(fallback.diagnosticAnchorLine).toBe(2);
    expect(fallback.blockHeader).toBe('empty.tf');
    expect(fallback.fallbackBlock).toBe(true);
  });

  it('has directory-scoped diagnosticClearScope', () => {
    expect(handler.diagnosticClearScope).toBe('directory');
  });

  it('has terraform codeResourceType', () => {
    expect(handler.codeResourceType).toBe('terraform');
  });

  it('matchRulesToDiff filters by resource type variants', () => {
    const rules = [
      'gomboc-ai/ensure_encryption_for_hashicorp__aws-resources-aws_s3_bucket',
      'gomboc-ai/ensure_logging_for_hashicorp__aws-resources-aws_db_instance',
      'gomboc-ai/unrelated_rule',
    ];

    const matched = handler.matchRulesToDiff({
      blockType: 'aws_s3_bucket',
      blockName: 'logs',
      allFileRules: rules,
      diffLine: 2,
      diffContent: 'bucket = "logs-bucket"',
      properties: ['bucket'],
    });

    expect(matched).toContain(rules[0]);
    expect(matched).not.toContain(rules[1]);
  });

  it('matchRulesToDiff returns all rules for unknown block type', () => {
    const rules = ['rule-a', 'rule-b'];
    const matched = handler.matchRulesToDiff({
      blockType: 'Resource',
      blockName: null,
      allFileRules: rules,
      diffLine: 1,
      diffContent: '',
      properties: [],
    });
    expect(matched).toEqual(rules);
  });

  it('formatBlockDisplayName uses type.name for terraform', () => {
    expect(
      handler.formatBlockDisplayName({
        blockType: 'aws_s3_bucket',
        blockName: 'logs',
        filePath: '/workspace/main.tf',
      }),
    ).toBe('aws_s3_bucket.logs');
  });

  it('buildDiagnosticRange returns compact range', () => {
    const result = handler.buildDiagnosticRange({
      line1Based: 1,
      content: '  resource "aws_s3_bucket" "logs" {',
    });
    expect(result.startChar).toBe(2);
    expect(result.endChar).toBeGreaterThan(result.startChar);
  });

  it('resolveDiagnosticAnchorLine clamps to valid range', () => {
    const result = handler.resolveDiagnosticAnchorLine({
      content: terraformContent,
      suggestedLine: 999,
      fromFixOperation: false,
    });
    expect(result).toBeLessThanOrEqual(terraformContent.split('\n').length);
    expect(result).toBeGreaterThanOrEqual(1);
  });
});
