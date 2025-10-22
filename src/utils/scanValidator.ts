import * as vscode from 'vscode';
import * as path from 'path';
import { getFileType } from './lib';

export interface ScanPreparation {
  filePath: string;
  workspacePath: string;
  filetype: string;
  language: string;
}

/**
 * Utility class for validating and preparing scan operations
 */
export class ScanValidator {
  /**
   * Validate file type and prepare scan parameters
   */
  static validateAndPrepareScan(editor: vscode.TextEditor): ScanPreparation {
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const workspacePath = path.dirname(filePath);
    const filetype = getFileType(filePath);

    // Validate file type
    if (
      filetype !== 'tf' &&
      filetype !== 'yml' &&
      filetype !== 'yaml' &&
      filetype !== 'json'
    ) {
      throw new Error('Current file is not a cloudformation or terraform file');
    }

    // Determine language
    let language: string;
    if (filetype === 'tf') {
      language = 'terraform';
    } else if (filetype === 'json') {
      language = 'cloudformation-json';
    } else {
      language = 'cloudformation-yaml';
    }

    return {
      filePath,
      workspacePath,
      filetype,
      language,
    };
  }
}
