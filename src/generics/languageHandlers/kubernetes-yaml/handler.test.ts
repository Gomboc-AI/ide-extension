import { KubernetesYAMLLanguageHandler } from './handler';

const kubernetesYaml = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  'spec:',
  '  replicas: 2',
  '---',
  'apiVersion: v1',
  'kind: Service',
  'metadata:',
  '  name: web-svc',
].join('\n');

describe('KubernetesYAMLLanguageHandler', () => {
  const handler = new KubernetesYAMLLanguageHandler();

  it('returns kubernetes document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/k8s/deployment.yaml',
        content: kubernetesYaml,
      }),
    ).toMatchObject({
      languageId: 'kubernetes-yaml',
      extension: '.yaml',
      supportsBlocks: true,
    });
  });

  it('lists kubernetes blocks and finds nearest block', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/k8s/deployment.yaml',
      content: kubernetesYaml,
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'Deployment',
      name: 'web',
      startLine: 2,
    });
    expect(blocks[1]).toMatchObject({
      type: 'Service',
      name: 'web-svc',
      startLine: 9,
    });

    const nearest = handler.findNearestBlock({
      filePath: '/workspace/k8s/deployment.yaml',
      content: kubernetesYaml,
      line: 10_000,
    });
    expect(nearest?.name).toBe('web-svc');
  });

  it('has file-scoped diagnosticClearScope', () => {
    expect(handler.diagnosticClearScope).toBe('file');
  });

  it('has kubernetes codeResourceType', () => {
    expect(handler.codeResourceType).toBe('kubernetes');
  });

  it('formatBlockDisplayName uses kind/name format', () => {
    expect(
      handler.formatBlockDisplayName({
        blockType: 'Deployment',
        blockName: 'web',
        filePath: '/workspace/k8s/deployment.yaml',
      }),
    ).toBe('Deployment/web');
  });

  it('matchRulesToDiff returns all file rules (file-level matching)', () => {
    const rules = ['rule-a', 'rule-b', 'rule-c'];
    const matched = handler.matchRulesToDiff({
      blockType: 'Deployment',
      blockName: 'web',
      allFileRules: rules,
      diffLine: 5,
      diffContent: 'replicas: 3',
      properties: ['replicas'],
    });
    expect(matched).toEqual(rules);
  });

  it('isWeakAnchorLine recognizes YAML-specific weak anchors', () => {
    expect(handler.isWeakAnchorLine('')).toBe(true);
    expect(handler.isWeakAnchorLine('---')).toBe(true);
    expect(handler.isWeakAnchorLine('  # comment')).toBe(true);
    expect(handler.isWeakAnchorLine('  replicas: 2')).toBe(false);
  });

  it('groupRelatedLines uses indentation-based grouping', () => {
    const lines = [
      'spec:',
      '  replicas: 2',
      '  template:',
      '    metadata:',
      '      labels:',
      '        app: web',
    ];
    const groups = handler.groupRelatedLines(lines);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups.flat()).toEqual(lines);
  });

  it('resolveDiagnosticAnchorLine keeps suggested line for YAML', () => {
    const result = handler.resolveDiagnosticAnchorLine({
      content: kubernetesYaml,
      suggestedLine: 5,
      fromFixOperation: false,
    });
    expect(result).toBe(5);
  });
});
