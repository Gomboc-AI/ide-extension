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
      supportsResources: true,
    });
  });

  it('parses package and section resources', () => {
    const resources = handler.listResources({
      filePath: '/workspace/package.json',
      content: packageJson,
    });
    expect(resources.find(r => r.type === 'npm_package')?.name).toBe('my-app');
    expect(resources.find(r => r.type === 'npm_section')?.name).toBe('scripts');
  });
});
