import { ScanLocalScenarioInput } from './../api/__generated__/graphql';
// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import { generateRequestMetadata, getFileType } from '../utils/lib';
import {
  InfrastructureTool,
  IacScanContent,
} from '../api/__generated__/graphql';
import { ScanResultsProvider } from '../providers/scanResultsProvider';

/**
 * Scans a single file and sens to customerapi
 * 
 * needs:
 * fileContent: string | string[]
 * filetype: TERRAFORM | CLOUDFORMATION
 * git info: {
 *  external link: string,
 *  branch name: string,
 * }
 * policy statements
 * {
 * input PolicyStatementPayloadMustImplementType {
  id: ID!
  capabilityId: String!
  metadata: InputStatementMetadata!
}
 * }
 */
export async function scanFileCommand(
  context: vscode.ExtensionContext,
  apiClient: CustomerApiClient,
  scanResultsProvider: ScanResultsProvider,
) {
  // ----- Gather input ------- //
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
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

  const scanResponse = await apiClient.getIndividualFixes({ inputObject });

  scanResultsProvider.generateComments(scanResponse);
  scanResultsProvider.createDiagnostic();

  // TODO
  // ----- add a progress bar that possible measures the length of time? ------ //
}

async function getTFScenarioFiles(
  document: vscode.TextDocument,
): Promise<IacScanContent[]> {
  const currentFileUri = document.uri;
  const directoryUri = currentFileUri.with({
    path: currentFileUri.path.replace(/\/[^/]*$/, '/'),
  });

  const entries = await vscode.workspace.fs.readDirectory(directoryUri);

  const contents: IacScanContent[] = [];
  for (const [name, fileType] of entries) {
    if (fileType === vscode.FileType.File) {
      const fileUri = vscode.Uri.joinPath(directoryUri, name);
      const data = await vscode.workspace.fs.readFile(fileUri);
      const contentString = new TextDecoder().decode(data); // cant convert from unit8array to base64 directly
      contents.push({
        filePath: fileUri.fsPath,
        fileContent: btoa(contentString),
      });
    }
  }
  return contents;
}

/**
 * Only care about the current file, just return base64 of it
 */
function getCFNFile(document: vscode.TextDocument): IacScanContent[] {
  return [
    {
      filePath: document.uri.fsPath,
      fileContent: btoa(document.getText()),
    },
  ];
}
