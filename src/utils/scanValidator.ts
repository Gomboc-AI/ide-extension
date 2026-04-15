import * as vscode from 'vscode';
import * as path from 'path';
import { getFileType } from './lib';
import {
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from '../generics/languageHandler';

export interface ScanPreparation {
  filePath: string;
  workspacePath: string;
  filetype: string;
  language: string;
}

/**
 * Detect language from file path and content
 * Uses centralized language selector and maps to ORL language values.
 */
export function detectLanguageFromFile(
  filePath: string,
  fileContent: string,
): string | null {
  const languageId = detectLanguageId({ filePath, content: fileContent });
  if (!languageId) {
    return null;
  }
  return mapLanguageIdToOrlLanguage({ languageId, filePath });
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
    const fileContent = document.getText();

    // Detect language from file path and content
    const language = detectLanguageFromFile(filePath, fileContent);

    if (!language) {
      throw new Error(
        'Current file is not a supported file (Terraform, CloudFormation, Docker, Helm, Kubernetes, Maven XML, Gradle, or npm package.json)',
      );
    }

    return {
      filePath,
      workspacePath,
      filetype,
      language,
    };
  }
}
