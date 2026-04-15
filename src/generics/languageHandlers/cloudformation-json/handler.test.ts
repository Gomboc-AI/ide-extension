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
      supportsBlocks: true,
    });
  });

  it('lists blocks and computes bounded line ranges', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'AWS::S3::Bucket',
      name: 'AppBucket',
      header: 'AppBucket (AWS::S3::Bucket)',
    });
    expect(blocks[1]).toMatchObject({
      type: 'AWS::SQS::Queue',
      name: 'AppQueue',
      header: 'AppQueue (AWS::SQS::Queue)',
    });
    expect(blocks[0].startLine).toBeLessThan(blocks[1].startLine);
    expect(blocks[0].endLine).toBe(blocks[1].startLine - 1);
  });

  it('finds block at line and nearest block outside bounds', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
    });

    const appQueue = handler.findBlockAtLine({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      line: blocks[1].startLine,
    });
    const nearest = handler.findNearestBlock({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      line: 10_000,
    });

    expect(appQueue?.name).toBe('AppQueue');
    expect(nearest?.name).toBe('AppQueue');
  });

  it('builds context with fallback for invalid JSON', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/template.json',
      content: cloudFormationJson,
      hint: { line: 1, filePath: '/workspace/template.json' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/broken.json',
      content: '{ invalid',
      hint: { line: 4, filePath: '/workspace/broken.json' },
    });

    expect(withBlock.blockHeader).toContain('App');
    expect(withBlock.fallbackBlock).toBe(false);
    expect(withBlock.diagnosticAnchorLine).toBeGreaterThan(0);

    expect(fallback.block).toBeUndefined();
    expect(fallback.nearestBlock).toBeUndefined();
    expect(fallback.diagnosticAnchorLine).toBe(4);
    expect(fallback.blockHeader).toBe('CloudFormation broken.json');
    expect(fallback.fallbackBlock).toBe(true);
  });
});
