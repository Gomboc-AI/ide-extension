import * as vscode from 'vscode';
import * as path from 'path';
import logger from './logger';

/**
 * Utility class for converting ORL Docker paths to actual file system paths
 */
export class PathConverter {
  /**
   * Convert ORL Docker path to actual file system path
   */
  static convertOrlPathToActualPath(
    orlPath: string,
    currentFilePath?: string,
  ): string {
    logger.info('Converting ORL path', { orlPath, currentFilePath });

    // If we have the current file path, use its directory as the base
    if (currentFilePath) {
      const currentDir = path.dirname(currentFilePath);
      const fileName = orlPath.includes('/') ? path.basename(orlPath) : orlPath;
      const actualPath = path.join(currentDir, fileName);
      logger.info('Using current file directory', {
        currentDir,
        fileName,
        actualPath,
      });
      return actualPath;
    }

    // Fallback to workspace root detection
    // ORL returns paths like "/workspace/main.tf" or just "main.tf"
    // We need to convert this to the actual file path
    let fileName = orlPath;

    if (orlPath.startsWith('/workspace/')) {
      fileName = orlPath.replace('/workspace/', '');
    } else if (orlPath.startsWith('/')) {
      // Handle absolute paths by extracting just the filename
      fileName = path.basename(orlPath);
    }

    logger.info('Extracted filename from ORL path', { fileName });

    // Get the current workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    logger.info('Workspace root', { workspaceRoot });

    if (workspaceRoot) {
      const actualPath = path.join(workspaceRoot, fileName);
      logger.info('Converted to actual path', { actualPath });
      return actualPath;
    }

    logger.warn('Could not convert ORL path, using original', { orlPath });
    return orlPath;
  }
}
