import * as vscode from 'vscode';
import path from 'path';

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

  /**
   * Clears diagnostics using the scope provided by the language handler.
   */
  clearDiagnosticCollection(
    scope: 'file' | 'directory',
    updatedFileUri: vscode.Uri,
  ): void {
    switch (scope) {
      case 'directory':
        this.clearDirectoryCollection(updatedFileUri);
        break;
      case 'file':
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
