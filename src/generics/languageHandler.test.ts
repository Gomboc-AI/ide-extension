import {
  chooseLanguageImplementation,
  detectLanguageId,
  getResourceContextExtractKind,
  isOrlScannableLanguageFile,
  mapLanguageIdToOrlLanguage,
} from './languageHandler';

describe('isOrlScannableLanguageFile', () => {
  it('matches ORL staging expectations for common basenames (no content)', () => {
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.tf', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'template.yaml', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'config.yml', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'template.json', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({
        filePath: 'cloudformation.json',
        content: '',
      }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'stack.json', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'app.py', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'Main.java', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({ filePath: 'main.bicep', content: '' }),
    ).toBe(true);
  });

  it('treats npm package manifests as scannable', () => {
    expect(
      isOrlScannableLanguageFile({ filePath: 'package.json', content: '' }),
    ).toBe(true);
    expect(
      isOrlScannableLanguageFile({
        filePath: 'package-lock.json',
        content: '',
      }),
    ).toBe(true);
  });

  it('rejects non-ORL files', () => {
    expect(
      isOrlScannableLanguageFile({ filePath: 'README.md', content: '' }),
    ).toBe(false);
    expect(
      isOrlScannableLanguageFile({ filePath: 'script.sh', content: '' }),
    ).toBe(false);
    expect(
      isOrlScannableLanguageFile({ filePath: 'data.json', content: '' }),
    ).toBe(false);
    expect(
      isOrlScannableLanguageFile({ filePath: 'config.json', content: '' }),
    ).toBe(false);
    expect(
      isOrlScannableLanguageFile({ filePath: 'tsconfig.json', content: '' }),
    ).toBe(false);
  });
});

describe('getResourceContextExtractKind', () => {
  it('delegates to the matched handler', () => {
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/main.tf',
        content: 'resource "x" "y" {}',
      }),
    ).toBe('terraform');
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/Dockerfile',
        content: 'FROM scratch',
      }),
    ).toBe('dockerfile');
    expect(
      getResourceContextExtractKind({
        filePath: '/workspace/service.py',
        content: 'def f():\n  pass',
      }),
    ).toBe('unknown');
  });
});

describe('languageHandler selector', () => {
  it('detects dockerfile and maps to ORL docker', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/Dockerfile',
      content: 'FROM node:20',
    });
    expect(languageId).toBe('dockerfile');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/Dockerfile',
      }),
    ).toBe('docker');
  });

  it('resolves yaml precedence as helm before kubernetes/cloudformation', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/charts/app/templates/deploy.yaml',
      content: '{{ .Values.image.repository }}',
    });
    expect(languageId).toBe('helm-template');
  });

  it('keeps helm before kubernetes when both yaml signals are present', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/k8s/charts/app/templates/deploy.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
    });
    expect(languageId).toBe('helm-template');
  });

  it('resolves kubernetes yaml using content markers', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/k8s/deployment.yaml',
      content: ['apiVersion: apps/v1', 'kind: Deployment'].join('\n'),
    });
    expect(languageId).toBe('kubernetes-yaml');
  });

  it('splits json between npm package and cloudformation', () => {
    expect(
      detectLanguageId({
        filePath: '/workspace/package.json',
        content: '{"name":"app"}',
      }),
    ).toBe('npm-package-json');
    expect(
      detectLanguageId({
        filePath: '/workspace/template.json',
        content: '{"Resources":{}}',
      }),
    ).toBe('cloudformation-json');
  });

  it('returns concrete handler implementation for resolved language', () => {
    const handler = chooseLanguageImplementation({
      filePath: '/workspace/pom.xml',
      content: '<project></project>',
    });
    expect(handler.displayName).toBe('Maven XML');
  });

  it('detects java files and maps to ORL java', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/src/App.java',
      content: 'public class App {}',
    });
    expect(languageId).toBe('java');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/src/App.java',
      }),
    ).toBe('java');
  });

  it('detects bicep files and maps to ORL bicep', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/main.bicep',
      content:
        "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {}",
    });
    expect(languageId).toBe('bicep');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/main.bicep',
      }),
    ).toBe('bicep');
  });

  it('detects python files and maps to ORL python', () => {
    const languageId = detectLanguageId({
      filePath: '/workspace/service.py',
      content: ['def handler():', '    return True'].join('\n'),
    });
    expect(languageId).toBe('python');
    expect(
      mapLanguageIdToOrlLanguage({
        languageId: languageId || '',
        filePath: '/workspace/service.py',
      }),
    ).toBe('python');
  });

  it('returns concrete handler implementation for java, bicep, and python', () => {
    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/src/App.java',
        content: 'public class App {}',
      }).displayName,
    ).toBe('Java');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/main.bicep',
        content: 'param location string = resourceGroup().location',
      }).displayName,
    ).toBe('Bicep');

    expect(
      chooseLanguageImplementation({
        filePath: '/workspace/service.py',
        content: ['def handler():', '    return True'].join('\n'),
      }).displayName,
    ).toBe('Python');
  });
});
