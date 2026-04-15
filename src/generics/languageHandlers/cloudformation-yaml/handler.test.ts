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
      supportsResources: true,
    });
  });

  it('lists resources from the YAML Resources block', () => {
    const resources = handler.listResources({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
    });

    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({
      type: 'AWS::S3::Bucket',
      name: 'AppBucket',
      startLine: 3,
      endLine: 6,
      header: 'AppBucket (AWS::S3::Bucket)',
    });
    expect(resources[1]).toMatchObject({
      type: 'AWS::IAM::Role',
      name: 'AppRole',
      startLine: 7,
      endLine: 10,
      header: 'AppRole (AWS::IAM::Role)',
    });
  });

  it('finds resources by line and nearest previous resource', () => {
    const atLine = handler.findResourceAtLine({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      line: 8,
    });
    const nearest = handler.findNearestResource({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      line: 100,
    });

    expect(atLine?.name).toBe('AppRole');
    expect(nearest?.name).toBe('AppRole');
  });

  it('builds context with fallback when no Resources block exists', () => {
    const withResource = handler.buildDiagnosticContext({
      filePath: '/workspace/template.yaml',
      content: cloudFormationYaml,
      hint: { line: 5, filePath: '/workspace/template.yaml' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/deployment.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
      hint: { line: 2, filePath: '/workspace/deployment.yaml' },
    });

    expect(withResource.resource?.name).toBe('AppBucket');
    expect(withResource.diagnosticAnchorLine).toBe(3);
    expect(withResource.resourceHeader).toBe('AppBucket (AWS::S3::Bucket)');
    expect(withResource.fallbackResource).toBe(false);

    expect(fallback.resource).toBeUndefined();
    expect(fallback.nearestResource).toBeUndefined();
    expect(fallback.resourceHeader).toBe('CloudFormation deployment.yaml');
    expect(fallback.fallbackResource).toBe(true);
  });
});
