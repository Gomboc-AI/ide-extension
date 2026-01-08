import * as vscode from 'vscode';
import path from 'path';
import { InfrastructureTool } from './api/__generated__/graphql';

enum COLLECTION_SCOPE_LEVEL {
  DIRECTORY = 'DIRECTORY',
  FILE = 'FILE',
}

const INFRASTRUCTURE_TOOL_COLLECTION_SCOPE: Record<
  keyof typeof InfrastructureTool,
  COLLECTION_SCOPE_LEVEL
> = {
  Cloudformation: COLLECTION_SCOPE_LEVEL.FILE,
  Docker: COLLECTION_SCOPE_LEVEL.FILE,
  Terraform: COLLECTION_SCOPE_LEVEL.DIRECTORY,
};

export class DiagnosticCollectionManager {
  static diagnosticCollectionManager: DiagnosticCollectionManager;
  private diagnosticCollection: vscode.DiagnosticCollection;

  private constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('Gomboc-Results');
  }
  static get() {
    if (!DiagnosticCollectionManager.diagnosticCollectionManager) {
      DiagnosticCollectionManager.diagnosticCollectionManager =
        new DiagnosticCollectionManager();
    }
    return DiagnosticCollectionManager.diagnosticCollectionManager;
  }

  getDiagnosticCollection() {
    return this.diagnosticCollection;
  }

  private clearDirectoryCollection(updatedFileUri: vscode.Uri) {
    const directory = path.dirname(updatedFileUri.path);
    this.diagnosticCollection.forEach(collection => {
      const [_, ...rest] = collection.path.split(directory);
      if (rest.length === 1 && rest.join('').split('/').length === 2) {
        this.diagnosticCollection.set(vscode.Uri.file(collection.path), []);
      }
    });
  }

  private clearFileCollection(updatedFileUri: vscode.Uri) {
    this.diagnosticCollection.set(updatedFileUri, []);
  }

  clearDiagnosticCollection(
    iac: keyof typeof InfrastructureTool,
    updatedFileUri: vscode.Uri,
  ): void {
    const scope = INFRASTRUCTURE_TOOL_COLLECTION_SCOPE[iac];
    switch (scope) {
      case COLLECTION_SCOPE_LEVEL.DIRECTORY:
        this.clearDirectoryCollection(updatedFileUri);
        break;
      case COLLECTION_SCOPE_LEVEL.FILE:
        this.clearFileCollection(updatedFileUri);
        break;
    }
  }

  updateDiagnosticCollection(
    updatedFileUri: vscode.Uri,
    diagnosticCollection: vscode.Diagnostic[],
  ) {
    this.diagnosticCollection.set(updatedFileUri, diagnosticCollection);
  }
}
