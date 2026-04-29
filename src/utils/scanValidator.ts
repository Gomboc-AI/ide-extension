import * as vscode from 'vscode';
import * as path from 'path';
import { getFileType } from './lib';
import {
  detectLanguageId,
  mapLanguageIdToOrlLanguage,
} from '@gomboc-ai/gomboc-node-sdk';

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
        'Current file is not a supported file (Terraform, Hcl, Helm, Kubernetes Yaml, CloudFormation Yaml/Json, Yaml, Toml, Json, Maven Xml, Gradle, Java, Kotlin, Groovy, JavaScript, TypeScript, Python, Go, Bash, C, C++, C#, Rust, Ruby, Php, Scala, Swift, Sql, Html, Css, Markdown, Lua, Ocaml, Elixir, Protobuf, or Bicep)',
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
