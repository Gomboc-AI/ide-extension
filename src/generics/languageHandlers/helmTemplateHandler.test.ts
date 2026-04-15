import { HelmTemplateLanguageHandler } from './helmTemplateHandler';

const helmTemplate = [
  '{{- define "myapp.labels" -}}',
  'app: myapp',
  '{{- end -}}',
  '---',
  'kind: Deployment',
  'metadata:',
  '  name: {{ .Release.Name }}',
].join('\n');

describe('HelmTemplateLanguageHandler', () => {
  const handler = new HelmTemplateLanguageHandler();

  it('returns helm template document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/charts/app/templates/deployment.yaml',
        content: helmTemplate,
      }),
    ).toMatchObject({
      languageId: 'helm-template',
      supportsResources: true,
    });
  });

  it('parses define blocks and YAML resources', () => {
    const resources = handler.listResources({
      filePath: '/workspace/charts/app/templates/deployment.yaml',
      content: helmTemplate,
    });
    expect(resources.length).toBeGreaterThanOrEqual(2);
    expect(resources[0]).toMatchObject({
      type: 'helm_template',
      name: 'myapp.labels',
      startLine: 1,
    });
    const resourceAtLine = handler.findResourceAtLine({
      filePath: '/workspace/charts/app/templates/deployment.yaml',
      content: helmTemplate,
      line: 6,
    });
    expect(resourceAtLine?.header).toContain('Deployment');
  });
});
