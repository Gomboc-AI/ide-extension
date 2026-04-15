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
});
