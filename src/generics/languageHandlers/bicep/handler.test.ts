import { BicepLanguageHandler } from './handler';

const bicepContent = [
  'param location string = resourceGroup().location',
  '',
  'var tags = {',
  "  environment: 'dev'",
  '}',
  '',
  "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {",
  "  name: 'storacctdemo'",
  '  location: location',
  '}',
  '',
  'output endpoint string = storageAccount.properties.primaryEndpoints.blob',
].join('\n');

describe('BicepLanguageHandler', () => {
  const handler = new BicepLanguageHandler();

  it('detects .bicep files and ignores other extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
      }),
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/main.tf',
        content: bicepContent,
      }),
    ).toBe(false);
  });

  it('returns bicep document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
      }),
    ).toMatchObject({
      languageId: 'bicep',
      extension: '.bicep',
      supportsBlocks: true,
      isConfigLike: true,
    });
  });

  it('parses bicep declarations and resolves block lookup', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/main.bicep',
      content: bicepContent,
    });
    expect(blocks.find(block => block.type === 'bicep_param')?.name).toBe(
      'location',
    );
    expect(blocks.find(block => block.type === 'bicep_var')?.name).toBe('tags');
    expect(blocks.find(block => block.type === 'bicep_resource')?.name).toBe(
      'storageAccount',
    );

    expect(
      handler.findBlockAtLine({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
        line: 8,
      })?.name,
    ).toBe('storageAccount');
    expect(
      handler.findNearestBlock({
        filePath: '/workspace/main.bicep',
        content: bicepContent,
        line: 99,
      })?.name,
    ).toBe('endpoint');
  });
});
