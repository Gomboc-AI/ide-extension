import {
  chooseLanguageImplementation,
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from './languageHandler';

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
