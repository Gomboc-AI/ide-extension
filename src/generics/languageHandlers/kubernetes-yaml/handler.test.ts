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
});
