import { HelmTemplateLanguageHandler } from './handler';

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
      supportsBlocks: true,
    });
  });

  it('parses define blocks and YAML blocks', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/charts/app/templates/deployment.yaml',
      content: helmTemplate,
    });
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0]).toMatchObject({
      type: 'helm_template',
      name: 'myapp.labels',
      startLine: 1,
    });
    const blockAtLine = handler.findBlockAtLine({
      filePath: '/workspace/charts/app/templates/deployment.yaml',
      content: helmTemplate,
      line: 6,
    });
    expect(blockAtLine?.header).toContain('Deployment');
  });
});
