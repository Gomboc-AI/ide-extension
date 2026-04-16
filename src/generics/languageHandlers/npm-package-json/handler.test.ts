import { NpmPackageJSONLanguageHandler } from './handler';

const packageJson = JSON.stringify(
  {
    name: 'my-app',
    scripts: {
      lint: 'eslint .',
    },
    dependencies: {
      lodash: '^4.17.21',
    },
  },
  null,
  2,
);

describe('NpmPackageJSONHandler', () => {
  const handler = new NpmPackageJSONLanguageHandler();

  it('returns npm package json document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/package.json',
        content: packageJson,
      }),
    ).toMatchObject({
      languageId: 'npm-package-json',
      extension: '.json',
      supportsBlocks: true,
    });
  });

  it('parses package and section blocks', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/package.json',
      content: packageJson,
    });
    expect(blocks.find(block => block.type === 'npm_package')?.name).toBe(
      'my-app',
    );
    expect(blocks.find(block => block.type === 'npm_section')?.name).toBe(
      'scripts',
    );
  });

  it('has npm codeResourceType', () => {
    expect(handler.codeResourceType).toBe('npm');
  });

  it('formatBlockDisplayName uses npm: prefix', () => {
    expect(
      handler.formatBlockDisplayName({
        blockType: 'npm_package',
        blockName: 'my-app',
        filePath: '/workspace/package.json',
      }),
    ).toBe('npm: my-app');
  });

  it('describeBlock returns full-file span for npm packages', () => {
    const desc = handler.describeBlock({
      filePath: '/workspace/package.json',
      content: packageJson,
      line: 3,
    });
    expect(desc.blockType).toBe('npm_package');
    expect(desc.blockName).toBe('my-app');
    expect(desc.blockStartLine).toBe(0);
    expect(desc.blockEndLine).toBe(packageJson.split('\n').length - 1);
  });
});
