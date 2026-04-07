import { getCFNFile } from '../src/commands/scanFile';
import * as vscode from 'vscode';

describe('getCFNFile()', () => {
  it('returns the document path and base64 of its text', () => {
    // 1) stub out the minimal parts of a TextDocument
    const fakeDoc: Pick<vscode.TextDocument, 'uri' | 'getText'> = {
      uri: vscode.Uri.file('/workspace/template.json'),
      getText: () => '{"hello":"world"}',
    };

    // 2) run your helper
    const result = getCFNFile(fakeDoc);

    // 3) assert it did the base64 conversion correctly
    expect(result).toEqual([
      {
        filePath: '/workspace/template.json',
        fileContent: Buffer.from('{"hello":"world"}', 'utf8').toString(
          'base64',
        ),
      },
    ]);
  });
});
