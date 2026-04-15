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
      supportsResources: true,
    });
  });

  it('lists terraform resources with parsed ranges and headers', () => {
    const resources = handler.listResources({
      filePath: '/workspace/main.tf',
      content: terraformContent,
    });

    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({
      type: 'aws_s3_bucket',
      name: 'logs',
      startLine: 1,
      endLine: 3,
      header: 'resource "aws_s3_bucket" "logs"',
    });
    expect(resources[1]).toMatchObject({
      type: 'aws_db_instance',
      name: 'main',
      startLine: 5,
      endLine: 7,
      header: 'resource "aws_db_instance" "main"',
    });
  });

  it('finds the resource at a line and nearest resource outside ranges', () => {
    const atLine = handler.findResourceAtLine({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      line: 6,
    });
    const nearestAfter = handler.findNearestResource({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      line: 100,
    });

    expect(atLine?.name).toBe('main');
    expect(nearestAfter?.name).toBe('main');
  });

  it('builds diagnostic context with anchor/header and fallback', () => {
    const withResource = handler.buildDiagnosticContext({
      filePath: '/workspace/main.tf',
      content: terraformContent,
      hint: { line: 2, filePath: '/workspace/main.tf' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/empty.tf',
      content: 'locals {\n  enabled = true\n}',
      hint: { line: 2, filePath: '/workspace/empty.tf' },
    });

    expect(withResource.resource?.name).toBe('logs');
    expect(withResource.diagnosticAnchorLine).toBe(1);
    expect(withResource.resourceHeader).toBe('resource "aws_s3_bucket" "logs"');
    expect(withResource.fallbackResource).toBe(false);

    expect(fallback.resource).toBeUndefined();
    expect(fallback.nearestResource).toBeUndefined();
    expect(fallback.diagnosticAnchorLine).toBe(2);
    expect(fallback.resourceHeader).toBe('empty.tf');
    expect(fallback.fallbackResource).toBe(true);
  });
});
