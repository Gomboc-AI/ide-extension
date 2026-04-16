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
  const filePath = '/workspace/template.yaml';
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

  it('maps adjacent resources to non-overlapping blocks', () => {
    const content = [
      'Resources:',
      '  MyBucket:',
      '    Type: AWS::S3::Bucket',
      '    Properties:',
      '      BucketName: test-bucket',
      '  MyTable:',
      '    Type: AWS::DynamoDB::Table',
      '    Properties:',
      '      BillingMode: PAY_PER_REQUEST',
    ].join('\n');

    const firstBoundaryLine = 5;
    const secondStartLine = 6;

    const firstBlock = handler.findBlockAtLine({
      filePath,
      content,
      line: firstBoundaryLine,
    });
    const secondBlock = handler.findBlockAtLine({
      filePath,
      content,
      line: secondStartLine,
    });

    expect(firstBlock?.name).toBe('MyBucket');
    expect(firstBlock?.endLine).toBe(5);
    expect(secondBlock?.name).toBe('MyTable');
    expect(secondBlock?.startLine).toBe(6);
  });

  it('filters rules by CloudFormation resource type', () => {
    const matched = handler.matchRulesToDiff({
      blockType: 'AWS::S3::Bucket',
      blockName: 'MyBucket',
      allFileRules: [
        'gomboc-ai/ensure_data_at_rest_is_encrypted_for_hashicorp__aws-resources-aws_s3_bucket000',
        'gomboc-ai/deny_public_access_for_hashicorp__aws-resources-aws_s3_bucket001',
        'gomboc-ai/ensure_pitr_for_hashicorp__aws-resources-aws_dynamodb_table000',
      ],
      diffLine: 12,
      diffContent: 'PublicAccessBlockConfiguration:',
      properties: ['public_access_block_configuration'],
    });

    expect(matched).toEqual([
      'gomboc-ai/deny_public_access_for_hashicorp__aws-resources-aws_s3_bucket001',
    ]);
  });

  it('falls back to service-scoped rules when type-specific match is missing', () => {
    const allFileRules = [
      'gomboc-ai/ensure_s3_public_access_block_for_hashicorp__aws-resources-aws_s3_bucket000',
      'gomboc-ai/ensure_kms_key_rotation_for_hashicorp__aws-resources-aws_kms_key000',
      'gomboc-ai/ensure_kms_key_policy_for_hashicorp__aws-resources-aws_kms_key001',
    ];
    const matched = handler.matchRulesToDiff({
      blockType: 'AWS::KMS::Alias',
      blockName: 'LogsKeyAlias',
      allFileRules,
      diffLine: 20,
      diffContent: 'AliasName: !Sub "alias/logs"',
      properties: ['alias_name'],
    });

    expect(matched).toEqual([
      'gomboc-ai/ensure_kms_key_rotation_for_hashicorp__aws-resources-aws_kms_key000',
      'gomboc-ai/ensure_kms_key_policy_for_hashicorp__aws-resources-aws_kms_key001',
    ]);
  });

  it('returns empty when neither type nor service matches any rule', () => {
    const matched = handler.matchRulesToDiff({
      blockType: 'AWS::KMS::Alias',
      blockName: 'LogsKeyAlias',
      allFileRules: [
        'gomboc-ai/ensure_s3_public_access_block_for_hashicorp__aws-resources-aws_s3_bucket000',
        'gomboc-ai/ensure_pitr_for_hashicorp__aws-resources-aws_dynamodb_table000',
      ],
      diffLine: 30,
      diffContent: 'TargetKeyId: !Ref LogsKey',
      properties: ['target_key_id'],
    });

    expect(matched).toEqual([]);
  });
});
