jest.mock('@gomboc-ai/gomboc-node-sdk', () => ({
  detectLanguageId: jest.fn(),
  mapLanguageIdToOrlLanguage: jest.fn(),
}));

import * as vscode from 'vscode';
import { detectLanguageId, mapLanguageIdToOrlLanguage } from '@gomboc-ai/gomboc-node-sdk';
import { ScanValidator, detectLanguageFromFile } from '../scanValidator';

const mockDetectLanguageId = detectLanguageId as jest.Mock;
const mockMapLanguage = mapLanguageIdToOrlLanguage as jest.Mock;

describe('detectLanguageFromFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when SDK detectLanguageId returns null', () => {
    mockDetectLanguageId.mockReturnValue(null);

    const result = detectLanguageFromFile('/repo/main.tf', 'resource "x" {}');

    expect(result).toBeNull();
    expect(mockMapLanguage).not.toHaveBeenCalled();
  });

  it('maps terraform language id and returns mapped result', () => {
    mockDetectLanguageId.mockReturnValue('terraform');
    mockMapLanguage.mockReturnValue('terraform');

    const result = detectLanguageFromFile('/repo/main.tf', 'resource "x" {}');

    expect(mockMapLanguage).toHaveBeenCalledWith({
      languageId: 'terraform',
      filePath: '/repo/main.tf',
    });
    expect(result).toBe('terraform');
  });

  it('returns mapped kubernetes language for yaml', () => {
    mockDetectLanguageId.mockReturnValue('yaml');
    mockMapLanguage.mockReturnValue('kubernetes');

    const result = detectLanguageFromFile('/repo/main.yaml', 'apiVersion: v1');

    expect(result).toBe('kubernetes');
  });

  it('returns null when mapLanguageIdToOrlLanguage returns null', () => {
    mockDetectLanguageId.mockReturnValue('yaml');
    mockMapLanguage.mockReturnValue(null);

    const result = detectLanguageFromFile('/repo/main.yaml', 'apiVersion: v1');

    expect(result).toBeNull();
  });
});

describe('ScanValidator.validateAndPrepareScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns scan preparation details when language is detected', () => {
    mockDetectLanguageId.mockReturnValue('terraform');
    mockMapLanguage.mockReturnValue('terraform');

    const editor = {
      document: {
        uri: { fsPath: '/home/user/project/main.tf' },
        getText: () => 'resource "aws_s3_bucket" "x" {}',
      },
    } as unknown as vscode.TextEditor;

    const result = ScanValidator.validateAndPrepareScan(editor);

    expect(result).toEqual(
      expect.objectContaining({
        filePath: '/home/user/project/main.tf',
        workspacePath: '/home/user/project',
        filetype: 'tf',
        language: 'terraform',
      }),
    );
  });

  it('throws supported-formats error when language detection returns null', () => {
    mockDetectLanguageId.mockReturnValue(null);
    mockMapLanguage.mockReturnValue(null);

    const editor = {
      document: {
        uri: { fsPath: '/home/user/project/main.unknown' },
        getText: () => 'content',
      },
    } as unknown as vscode.TextEditor;

    expect(() => ScanValidator.validateAndPrepareScan(editor)).toThrow(
      /Current file is not a supported file/,
    );
  });
});
