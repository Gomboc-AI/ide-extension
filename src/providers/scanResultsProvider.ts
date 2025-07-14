import * as vscode from 'vscode';
import {
  IndividualFixGombocDiagnostic,
  GroupedFixGombocDiagnostic,
} from './gombocDiagnostic';
import {
  Fixes,
  GroupedFixesRemediation,
  IndividualFixesQuerySuccess,
  IndividualFixesRemediation,
} from '../api/client';
import { FixType } from '../api/__generated__/graphql';

type IndividualFix = IndividualFixesRemediation['fixes'][number] &
  Pick<
    Pick<IndividualFixesQuerySuccess, 'remediations'>['remediations'][number],
    'benchmarkRecommendation'
  >;

export class ScanResultsProvider {
  public static codeActionDisposable: vscode.Disposable | undefined;
  private static scanResultsProviderInstance: ScanResultsProvider | null = null;
  private individualRemediations: IndividualFixesRemediation[];
  private groupedRemediations: GroupedFixesRemediation[];

  private constructor(
    private context: vscode.ExtensionContext,
    private diagnosticCollection: vscode.DiagnosticCollection,
  ) {
    this.individualRemediations = [];
    this.groupedRemediations = [];
  }

  static init(
    context: vscode.ExtensionContext,
    diagnosticCollection: vscode.DiagnosticCollection,
  ) {
    if (this.codeActionDisposable !== undefined) {
      this.codeActionDisposable.dispose();
    }
    if (this.scanResultsProviderInstance === null) {
      this.scanResultsProviderInstance = new ScanResultsProvider(
        context,
        diagnosticCollection,
      );
    }
    return this.scanResultsProviderInstance;
  }

  // registers the command so that it can be called
  public registerApplyRemediation() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyIndividualRemediation',
        fixedResults => {
          this.applyIndividualRemediation(fixedResults);
        },
      ),
    );
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'gomboc-results.applyGroupedRemediation',
        fixedResults => {
          this.applyGroupedRemediation(fixedResults);
        },
      ),
    );
  }

  public generateComments(remediations: Fixes) {
    this.individualRemediations = remediations.individualFixes;
    this.groupedRemediations = remediations.groupedFixes;
  }

  // uses the scan response to generate a diagnostic for the diagnostic collection
  createDiagnostic() {
    // clears the diagnostics and quick fixes
    this.diagnosticCollection.clear();
    if (ScanResultsProvider.codeActionDisposable) {
      ScanResultsProvider.codeActionDisposable.dispose();
    }

    // the key represents the file path to the file that needs remediation
    const existingResourceBenchmarkFixes: Record<
      string,
      IndividualFixesRemediation[]
    > = {};
    const existingGroupedFixes: Record<string, GroupedFixesRemediation> = {};
    let diagnosticTotal = 0;

    for (const remediation of this.individualRemediations) {
      const filepath =
        remediation.codeObservation.codeResourceInstance.filepath;
      const existingData = existingResourceBenchmarkFixes[filepath];
      if (!existingData) {
        existingResourceBenchmarkFixes[filepath] = [remediation];
      } else {
        existingResourceBenchmarkFixes[filepath] = [
          remediation,
          ...existingData,
        ];
      }
    }
    // Ensures that each file only has one grouped remediation
    for (const remediation of this.groupedRemediations) {
      const filepath = remediation.path;
      existingGroupedFixes[filepath] = remediation;
    }

    for (const filepath in existingResourceBenchmarkFixes) {
      const uri = vscode.Uri.parse(filepath);
      const currentRemediation = existingResourceBenchmarkFixes[filepath];
      const curDiag: Array<
        IndividualFixGombocDiagnostic | GroupedFixGombocDiagnostic
      > = [];
      const uniqueLines = new Set<number>();
      for (const remediation of currentRemediation) {
        let startLine = remediation.codeObservation.codeResourceInstance.line;
        let containsAddFixType = false;
        for (const fix of remediation.fixes) {
          if (fix.fixType === FixType.Add) {
            containsAddFixType = true;
            break;
          }
        }
        if (!containsAddFixType && remediation.fixes.length > 0) {
          startLine = remediation.fixes[0].codePosition.line;
        }
        const startPosition = new vscode.Position(startLine - 1, 0);
        uniqueLines.add(startLine);
        const endPosition = new vscode.Position(startLine - 1, 999);

        diagnosticTotal++;
        curDiag.push({
          message: `Fix for ${remediation.codeObservation.codeResourceInstance.type} to enforce apply recommendation ${remediation.benchmarkRecommendation.name}`,
          individualFixGombocResult: remediation,
          quickFixMessage: `Enforce ${remediation.benchmarkRecommendation.name} for ${remediation.codeObservation.codeResourceInstance.type}`,
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc ',
        });
      }
      for (const line of uniqueLines) {
        const startPosition = new vscode.Position(line - 1, 0);
        const endPosition = new vscode.Position(line - 1, 999);
        curDiag.push({
          message: 'Apply all fixes',
          groupedFixGombocResult: existingGroupedFixes[filepath],
          quickFixMessage: 'Apply all fixes',
          range: new vscode.Range(startPosition, endPosition),
          severity: vscode.DiagnosticSeverity.Error,
          source: 'Gomboc',
        });
      }
      this.diagnosticCollection.set(uri, curDiag);
    }

    vscode.window.showInformationMessage(
      `We completed a scan of your IaC and found ${diagnosticTotal} fixes to comply with your organization's selected benchmarks.`,
    );
  }

  // Uses the scan result + diagnostic in order to apply a fix
  async applyIndividualRemediation(remediations: IndividualFixesRemediation[]) {
    const edit = new vscode.WorkspaceEdit();
    const allFixes: IndividualFix[] = remediations.reduce((acc, curr) => {
      const currentFixes: IndividualFix[] = curr.fixes.map(fix => ({
        ...fix,
        benchmarkRecommendation: curr.benchmarkRecommendation,
      }));

      return [...acc, ...currentFixes];
    }, [] as IndividualFix[]);

    for (const fix of allFixes) {
      const fixPosition = fix.codePosition.line - 1;
      let startPosition = new vscode.Position(fixPosition, 0);
      let endPosition = new vscode.Position(fix.codePosition.line - 1, 999);
      const file = vscode.Uri.file(fix.filepath);

      const range = new vscode.Range(startPosition, endPosition);
      const newValue = fix.newLine.join('\n');
      const addedLineComment = `# Applied this change to enforce ${fix.benchmarkRecommendation.name}`;
      if (fix.fixType === 'ADD') {
        edit.insert(
          file,
          startPosition,
          `${' '.repeat(fix.codePosition.column)}${newValue} ${addedLineComment}` +
            '\n',
        );
      } else if (fix.fixType === 'UPDATE') {
        edit.replace(file, range, `${newValue} ${addedLineComment}`);
      } else {
        // delete but delete type doesn't exist yet for us
        edit.replace(
          file,
          range,
          `Removed this line to enforce ${fix.benchmarkRecommendation.name}`,
        );
      }
    }
    const success = await vscode.workspace.applyEdit(edit);

    // once we apply a remediation we have to dispose and clear everything and re-run
    this.diagnosticCollection.clear();
    if (ScanResultsProvider.codeActionDisposable) {
      ScanResultsProvider.codeActionDisposable.dispose();
    }
    if (success) {
      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();

        vscode.commands.executeCommand('gomboc-vscode-extension.scanFile');
        return;
      }
    }
  }
  async applyGroupedRemediation(remediations: GroupedFixesRemediation[]) {
    const fixEdit = new vscode.WorkspaceEdit();
    const commentEdit = new vscode.WorkspaceEdit();
    for (const remediation of remediations) {
      const file = vscode.Uri.file(remediation.path);
      const document = await vscode.workspace.openTextDocument(file);
      const decodedContent = Buffer.from(
        remediation.content,
        'base64',
      ).toString('binary');
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );

      fixEdit.replace(document.uri, fullRange, decodedContent);
      const remediationSuccess = await vscode.workspace.applyEdit(fixEdit);

      if (!remediationSuccess) {
        throw new Error('Unable to apply any fixes due to an unexpected error');
      }

      for (const comment of remediation.comments) {
        const commentLine = comment.position.line;
        const existingLine = document.lineAt(commentLine - 1);
        const insertPosition = new vscode.Position(
          commentLine - 1,
          existingLine.text.length,
        );
        commentEdit.insert(
          document.uri,
          insertPosition,
          `# Applied this change to enforce ${comment.benchmarkRecommendation.name}`,
        );
      }
      const commentSuccess = await vscode.workspace.applyEdit(commentEdit);

      if (!commentSuccess) {
        throw new Error(
          'We have applied the remediations, however an unexpected error prevented us from applying the comments on the changes',
        );
      }

      const textEditor = vscode.window.activeTextEditor;
      if (textEditor) {
        await vscode.window.activeTextEditor?.document.save();
      }
      // once we apply a remediation we have to dispose and clear everything and re-run
      this.diagnosticCollection.clear();
      if (ScanResultsProvider.codeActionDisposable) {
        ScanResultsProvider.codeActionDisposable.dispose();
      }
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
