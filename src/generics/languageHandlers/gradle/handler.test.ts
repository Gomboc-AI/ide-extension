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
      supportsResources: true,
    });
  });

  it('parses gradle blocks and task resources', () => {
    const resources = handler.listResources({
      filePath: '/workspace/build.gradle',
      content: gradleContent,
    });
    expect(resources.find(r => r.name === 'plugins')).toBeDefined();
    expect(resources.find(r => r.type === 'gradle_task')?.name).toBe(
      'smokeTest',
    );
  });
});
