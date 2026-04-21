import { PythonLanguageHandler } from './handler';

const pythonContent = [
  'class Service:',
  '    def __init__(self, name):',
  '        self.name = name',
  '',
  '    def get_name(self):',
  '        return self.name',
  '',
  '',
  'def helper():',
  "    return 'ok'",
].join('\n');

describe('PythonLanguageHandler', () => {
  const handler = new PythonLanguageHandler();

  it('detects .py files and ignores non-python extensions', () => {
    expect(
      handler.detectLanguage({
        filePath: '/workspace/service.py',
        content: pythonContent,
      }),
    ).toBe(true);
    expect(
      handler.detectLanguage({
        filePath: '/workspace/service.rb',
        content: pythonContent,
      }),
    ).toBe(false);
  });

  it('returns python document info metadata', () => {
    expect(
      handler.getDocumentInfo({
        filePath: '/workspace/service.py',
        content: pythonContent,
      }),
    ).toMatchObject({
      languageId: 'python',
      extension: '.py',
      fileName: 'service.py',
      supportsBlocks: true,
    });
  });

  it('parses class/function blocks and resolves line-based lookup', () => {
    const blocks = handler.listBlocks({
      filePath: '/workspace/service.py',
      content: pythonContent,
    });
    expect(blocks.find(block => block.type === 'python_class')?.name).toBe(
      'Service',
    );
    expect(blocks.find(block => block.name === 'get_name')).toBeDefined();
    expect(blocks.find(block => block.name === 'helper')).toBeDefined();

    expect(
      handler.findBlockAtLine({
        filePath: '/workspace/service.py',
        content: pythonContent,
        line: 9,
      })?.name,
    ).toBe('helper');
    expect(
      handler.findNearestBlock({
        filePath: '/workspace/service.py',
        content: pythonContent,
        line: 99,
      })?.name,
    ).toBe('helper');
  });
});
