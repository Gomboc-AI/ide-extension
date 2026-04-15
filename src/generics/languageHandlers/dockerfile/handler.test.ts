import { DockerfileLanguageHandler } from './handler';

const dockerContent = [
  'FROM node:20 AS base',
  'WORKDIR /app',
  '',
  'FROM base AS build',
  'RUN npm ci',
].join('\n');

describe('DockerfileLanguageHandler', () => {
  const handler = new DockerfileLanguageHandler();

  it('returns dockerfile document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/Dockerfile',
        content: dockerContent,
      }),
    ).toMatchObject({
      languageId: 'dockerfile',
      fileName: 'Dockerfile',
      supportsBlocks: true,
    });
  });

  it('lists docker stages with bounded ranges', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/Dockerfile',
      content: dockerContent,
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'docker_stage',
      name: 'base',
      startLine: 1,
      endLine: 3,
    });
    expect(blocks[1]).toMatchObject({
      type: 'docker_stage',
      name: 'build',
      startLine: 4,
    });
  });

  it('builds context with fallback when stage not found', () => {
    const withBlock = handler.buildDiagnosticContext({
      filePath: '/workspace/Dockerfile',
      content: dockerContent,
      hint: { line: 2, filePath: '/workspace/Dockerfile' },
    });
    const fallback = handler.buildDiagnosticContext({
      filePath: '/workspace/Dockerfile',
      content: 'RUN echo hello',
      hint: { line: 1, filePath: '/workspace/Dockerfile' },
    });
    expect(withBlock.block?.name).toBe('base');
    expect(withBlock.fallbackBlock).toBe(false);
    expect(fallback.block).toBeUndefined();
    expect(fallback.fallbackBlock).toBe(true);
  });
});
