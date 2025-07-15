import { getCFNFile } from '../src/commands/scanFile';

describe('getCFNFile()', () => {
  it('returns the document path and base64 of its text', () => {
    // 1) stub out the minimal parts of a TextDocument
    const fakeDoc = {
      uri: { fsPath: '/workspace/template.json' },
      getText: () => '{"hello":"world"}',
    };

    // 2) run your helper
    const result = getCFNFile(fakeDoc as any);

    // 3) assert it did the btoa conversion correctly
    expect(result).toEqual([
      {
        filePath: '/workspace/template.json',
        fileContent: btoa('{"hello":"world"}'),
      },
    ]);
  });
});
