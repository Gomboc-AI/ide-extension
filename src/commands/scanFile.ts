import { ScanLocalScenarioInput } from './../api/__generated__/graphql';
// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { getFileType } from '../utils/lib';
import {
  InfrastructureTool,
  IacScanContent,
} from '../api/__generated__/graphql';
import { ScanResultsProvider } from '../providers/scanResultsProvider';
import * as path from 'path';

export async function scanFileCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
  scanResultsProvider: ScanResultsProvider,
) {
  // ----- Gather input ------- //
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const filePath = document.uri.fsPath;
  const filetype = getFileType(filePath);

  let fileContents: IacScanContent[];
  let tool: InfrastructureTool;

  if (filetype === 'tf') {
    tool = InfrastructureTool.Terraform;
    fileContents = await getTFScenarioFiles(document);
  } else if (filetype === 'yml' || filetype === 'yaml') {
    tool = InfrastructureTool.Cloudformation;
    fileContents = getCFNFile(document);
  } else {
    vscode.window.showErrorMessage(
      'Current file is not a cloudformation or terraform file',
    );
    throw new Error('Current file is not a cloudformation or terraform file');
  }

  // const metaData = await generateRequestMetadata();

  // ----- Send data to customerapi ------ //
  const inputObject: ScanLocalScenarioInput = {
    fileContents,
    iacTool: tool,
  };

  const scanResponse = await apiClient.getFixes({ inputObject });

  scanResultsProvider.generateComments(scanResponse);
  scanResultsProvider.createDiagnostic();

  // TODO
  // ----- add a progress bar that possible measures the length of time? ------ //
}

async function getTFScenarioFiles(
  document: vscode.TextDocument,
): Promise<IacScanContent[]> {
  // updating this to use native os path so we can support windows
  // fsPath is the native reading path, and .path is the unix style vscode path
  // Note, we most likely just want to use fsPath for most purposes 
  const currentFilePath = document.uri.fsPath;

  const directoryPath = path.dirname(currentFilePath);
  const entries = await vscode.workspace.fs.readDirectory(
    vscode.Uri.file(directoryPath),
  );

  const contents: IacScanContent[] = [];
  for (const [name, fileType] of entries) {
    if (fileType === vscode.FileType.File && name.endsWith('.tf')) {
      const filePath = path.join(directoryPath, name);
      const fileUri = vscode.Uri.file(filePath);

      const data = await vscode.workspace.fs.readFile(fileUri);
      const contentString = new TextDecoder().decode(data);

      contents.push({
        filePath: filePath, // Use the native OS path directly
        fileContent: btoa(contentString),
      });
    }
  }
  return contents;
}

/**
 * Only care about the current file, just return base64 of it
 */
export function getCFNFile(document: vscode.TextDocument): IacScanContent[] {
  return [
    {
      filePath: document.uri.fsPath,
      fileContent: btoa(document.getText()),
    },
  ];
}
