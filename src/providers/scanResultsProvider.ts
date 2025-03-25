import * as vscode from 'vscode';
import { FixType, RemediationComment } from '../api/__generated__/graphql';
import { GombocDiagnostic } from './gombocDiagnostic';
import { CodeActionProvider } from './codeActionProvider';

export class ScanResultsProvider {
  public codeActionDisposable: vscode.Disposable | undefined;
  constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
    private results: RemediationComment[],
  ) {
    this.results = [];
  }

  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyRemediation',
        fixedResults => {
          this.applyRemediation(fixedResults);
        },
      ),
    );
  }

  public generateComments(comments: RemediationComment[]) {
    this.results = comments;
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    // clears the diagnostics and quick fixes
    this.diagnosticCollection.clear();
    if (this.codeActionDisposable) {
      this.codeActionDisposable.dispose();
    }
    const existingResourcePolicyFixes: Record<
      string,
      Record<string, string[]>
    > = {};

    for (const result of this.results) {
      const uniqueResourceName = `${result.logicalResource.type}.${result.logicalResource.name}`;
      if (!existingResourcePolicyFixes[uniqueResourceName]) {
        existingResourcePolicyFixes[uniqueResourceName] = {};
      }
      // each result is one remediation
      const uri = vscode.Uri.parse(result.fileName);
      const diagnostic: GombocDiagnostic[] = [];
      // Currently, there is an edge case where a single resource
      // may have multiple separate fixes to resolve the
      // to avoid confusion for the customer, we'll only show one of these fixes
      // sometimes will be multiple diagnostics on a single file
      const curDiag = this.diagnosticCollection.get(uri) as GombocDiagnostic[];
      for (const fix of result.fixes) {
        if (
          existingResourcePolicyFixes[uniqueResourceName][fix.position.line]
        ) {
          if (
            existingResourcePolicyFixes[uniqueResourceName][
              fix.position.line
            ].includes(result.policyStatement.id)
          ) {
            continue;
          } else {
            existingResourcePolicyFixes[uniqueResourceName][fix.position.line] =
              [
                ...existingResourcePolicyFixes[uniqueResourceName][
                  fix.position.line
                ],
                result.policyStatement.id,
              ];
          }
          continue;
        } else {
          existingResourcePolicyFixes[uniqueResourceName][fix.position.line] =
            [];
        }
        let startPosition = new vscode.Position(
          fix.position.line - 1,
          fix.position.column,
        );
        let endPosition = new vscode.Position(fix.position.line - 1, 999);

        if (fix.fixType === FixType.Add) {
          const resourceLine = result.logicalResource.line - 1;
          startPosition = new vscode.Position(resourceLine, 0);
          endPosition = new vscode.Position(resourceLine, 999);
        }

        diagnostic.push({
          message: `Fix for ${result.logicalResource.type} to enforce apply recommendation ${result.policyStatement.payload.capability.title}`,
          gombocResult: result,
          quickFixMessage: `Enforce ${result.policyStatement.payload.capability.title} for ${result.logicalResource.type}`,
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc ',
        });
      }
      this.diagnosticCollection.set(uri, curDiag.concat(diagnostic));
    }
    this.addQuickFixes();
  }

  // Registers the code action providers so that they show up under each diagnostic
  async addQuickFixes() {
    if (this.codeActionDisposable) {
      this.codeActionDisposable.dispose;
    }
    const file = await this.getCurrentFile();
    this.codeActionDisposable = vscode.languages.registerCodeActionsProvider(
      {
        language: file.editor.document.languageId,
        scheme: file.editor.document.uri.scheme,
      },
      new CodeActionProvider(this.results, this.diagnosticCollection),
    );
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyRemediation(fixedResults: RemediationComment[]) {
    const edit = new vscode.WorkspaceEdit();
    for (const result of fixedResults) {
      // the filepath might point to a different file
      const file = vscode.Uri.file(result.fileName);
      for (const fix of result.fixes) {
        let startPosition = new vscode.Position(
          fix.position.line - 1,
          fix.position.column,
        );
        let endPosition = new vscode.Position(fix.position.line - 1, 999);

        const range = new vscode.Range(startPosition, endPosition);
        if (fix.fixType === 'ADD') {
          edit.insert(file, startPosition, fix.newValue + '\n');
        } else if (fix.fixType === 'UPDATE') {
          edit.replace(file, range, fix.newValue);
        } else {
          // delete but delete type doesn't exist yet for us
          edit.delete(file, range);
        }
      }
    }
    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();

        // once we apply a remediation we have to dispose and clear everything and re-run
        this.diagnosticCollection.clear();
        if (this.codeActionDisposable) {
          this.codeActionDisposable.dispose();
        }
        vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
      }
    }
    // once we apply a remediation we have to dispose and clear everything and re-run
    this.diagnosticCollection.clear();
    if (this.codeActionDisposable) {
      this.codeActionDisposable.dispose();
    }
  }

  async getCurrentFile(): Promise<{ file: string; editor: vscode.TextEditor }> {
    const opened = vscode.window.activeTextEditor;
    if (opened) {
      const file = opened.document.fileName;
      return { file: file, editor: opened };
    }
    throw new Error('function lacks active editor');
  }

  // async getFileFromPath(filePath: string): Promise<{ file: string; editor: vscode.TextEditor }> {
  //   const uri = vscode.Uri.file(filePath);
  //   const document = await vscode.workspace.openTextDocument(uri);
  //   const editor = await vscode.window.showTextDocument(document);
  //   return { file: document.fileName, editor };
  // }
}
