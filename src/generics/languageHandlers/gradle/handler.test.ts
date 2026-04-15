import { GradleLanguageHandler } from './handler';

const gradleContent = [
  'plugins {',
  '  id "java"',
  '}',
  '',
  'task smokeTest {',
  '  doLast {',
  '    println "ok"',
  '  }',
  '}',
].join('\n');

describe('GradleLanguageHandler', () => {
  const handler = new GradleLanguageHandler();

  it('returns gradle document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/build.gradle',
        content: gradleContent,
      }),
    ).toMatchObject({
      languageId: 'gradle',
      extension: '.gradle',
      supportsBlocks: true,
    });
  });

  it('parses gradle blocks and task blocks', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/build.gradle',
      content: gradleContent,
    });
    expect(blocks.find(block => block.name === 'plugins')).toBeDefined();
    expect(blocks.find(block => block.type === 'gradle_task')?.name).toBe(
      'smokeTest',
    );
  });
});
