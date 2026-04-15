import { CloudFormationYAMLLanguageHandler } from './handler';

const cloudFormationYaml = [
  'AWSTemplateFormatVersion: "2010-09-09"',
  'Resources:',
  '  AppBucket:',
  '    Type: AWS::S3::Bucket',
  '    Properties:',
  '      BucketName: app-bucket',
  '  AppRole:',
  '    Type: AWS::IAM::Role',
  '    Properties:',
  '      RoleName: app-role',
].join('\n');

describe('CloudFormationYAMLLanguageHandler', () => {
  const handler = new CloudFormationYAMLLanguageHandler();

  it('returns cloudformation yaml document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/template.yaml',
        content: cloudFormationYaml,
      }),
    ).toMatchObject({
      languageId: 'cloudformation-yaml',
      fileName: 'template.yaml',
      extension: '.yaml',
      supportsBlocks: true,
    });
  });

  it('lists blocks from the YAML Resources block', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'AWS::S3::Bucket',
      name: 'AppBucket',
      startLine: 3,
      endLine: 6,
      header: 'AppBucket (AWS::S3::Bucket)',
    });
    expect(blocks[1]).toMatchObject({
      type: 'AWS::IAM::Role',
      name: 'AppRole',
      startLine: 7,
      endLine: 10,
      header: 'AppRole (AWS::IAM::Role)',
    });
  });

  it('finds blocks by line and nearest previous block', () => {
    const atLine = handler.findBlockAtLine({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      line: 8,
    });
    const nearest = handler.findNearestBlock({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      line: 100,
    });

    expect(atLine?.name).toBe('AppRole');
    expect(nearest?.name).toBe('AppRole');
  });

  it('builds context with fallback when no Resources block exists', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      hint: { line: 5, filePath: '/workspace/template.yaml' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/deployment.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
      hint: { line: 2, filePath: '/workspace/deployment.yaml' },
    });

    expect(withBlock.block?.name).toBe('AppBucket');
    expect(withBlock.diagnosticAnchorLine).toBe(3);
    expect(withBlock.blockHeader).toBe('AppBucket (AWS::S3::Bucket)');
    expect(withBlock.fallbackBlock).toBe(false);

    expect(fallback.block).toBeUndefined();
    expect(fallback.nearestBlock).toBeUndefined();
    expect(fallback.blockHeader).toBe('CloudFormation deployment.yaml');
    expect(fallback.fallbackBlock).toBe(true);
  });
});
