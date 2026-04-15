import { CloudFormationJSONLanguageHandler } from './handler';

const cloudFormationJson = JSON.stringify(
  {
    AWSTemplateFormatVersion: '2010-09-09',
    Resources: {
      AppBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: 'app-bucket',
        },
      },
      AppQueue: {
        Type: 'AWS::SQS::Queue',
      },
    },
  },
  null,
  2,
);

describe('CloudFormationJSONLanguageHandler', () => {
  const handler = new CloudFormationJSONLanguageHandler();

  it('returns cloudformation json document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/template.json',
        content: cloudFormationJson,
      }),
    ).toMatchObject({
      languageId: 'cloudformation-json',
      fileName: 'template.json',
      extension: '.json',
      supportsResources: true,
    });
  });

  it('lists resources and computes bounded line ranges', () => {
    const resources = handler.listResources({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
    });

    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({
      type: 'AWS::S3::Bucket',
      name: 'AppBucket',
      header: 'AppBucket (AWS::S3::Bucket)',
    });
    expect(resources[1]).toMatchObject({
      type: 'AWS::SQS::Queue',
      name: 'AppQueue',
      header: 'AppQueue (AWS::SQS::Queue)',
    });
    expect(resources[0].startLine).toBeLessThan(resources[1].startLine);
    expect(resources[0].endLine).toBe(resources[1].startLine - 1);
  });

  it('finds resource at line and nearest resource outside bounds', () => {
    const resources = handler.listResources({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
    });

    const appQueue = handler.findResourceAtLine({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      line: resources[1].startLine,
    });
    const nearest = handler.findNearestResource({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      line: 10_000,
    });

    expect(appQueue?.name).toBe('AppQueue');
    expect(nearest?.name).toBe('AppQueue');
  });

  it('builds context with fallback for invalid JSON', () => {
    const withResource = handler.buildDiagnosticContext({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      hint: { line: 1, filePath: '/workspace/template.json' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/broken.json',
      content: '{ invalid',
      hint: { line: 4, filePath: '/workspace/broken.json' },
    });

    expect(withResource.resourceHeader).toContain('App');
    expect(withResource.fallbackResource).toBe(false);
    expect(withResource.diagnosticAnchorLine).toBeGreaterThan(0);

    expect(fallback.resource).toBeUndefined();
    expect(fallback.nearestResource).toBeUndefined();
    expect(fallback.diagnosticAnchorLine).toBe(4);
    expect(fallback.resourceHeader).toBe('CloudFormation broken.json');
    expect(fallback.fallbackResource).toBe(true);
  });
});
