import { JavaLanguageHandler } from './handler';

const javaContent = [
  'public class App {',
  '  private String name;',
  '',
  '  public App(String name) {',
  '    this.name = name;',
  '  }',
  '',
  '  public String getName() {',
  '    return name;',
  '  }',
  '}',
].join('\n');

describe('JavaLanguageHandler', () => {
  const handler = new JavaLanguageHandler();

  it('detects .java files and ignores non-java extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/src/App.java',
        content: javaContent,
      }),
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/src/App.kt',
        content: javaContent,
      }),
    ).toBe(false);
  });

  it('returns java document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/src/App.java',
        content: javaContent,
      }),
    ).toMatchObject({
      languageId: 'java',
      fileName: 'App.java',
      extension: '.java',
      supportsBlocks: true,
    });
  });

  it('lists java declaration blocks and resolves block lookups', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/src/App.java',
      content: javaContent,
    });
    expect(blocks.find(block => block.type === 'java_class')?.name).toBe('App');
    expect(
      blocks.some(
        block => block.type === 'java_method' && block.name === 'getName',
      ),
    ).toBe(true);

    expect(
      handler.findBlockAtLine({
        filePath: '/workspace/src/App.java',
        content: javaContent,
        line: 8,
      })?.name,
    ).toBe('getName');
    expect(
      handler.findNearestBlock({
        filePath: '/workspace/src/App.java',
        content: javaContent,
        line: 99,
      })?.name,
    ).toBe('getName');
  });
});
