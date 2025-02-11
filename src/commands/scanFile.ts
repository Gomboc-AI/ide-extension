// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
import {
  generateRequestMetadata,
  generateSecurityPolicies,
  getFileType,
} from '../utils/lib';
import { InfrastructureTool } from '../api/__generated__/graphql';
import { IACScanContent, SingleScanInput } from '../types';

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

  let fileContents: IACScanContent | IACScanContent[];
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

  const policyStatements = await generateSecurityPolicies(apiClient);
  const metaData = await generateRequestMetadata();

  // ----- Send data to customerapi ------ //
  const inputObject: SingleScanInput = {
    fileContents,
    tool,
    metaData,
  };
  console.log('..:: INPUT - ', inputObject);

  const scanResponse = await apiClient.sendSingleScan({ inputObject });

  // TODO
  // ----- add a progress bar that possible measures the length of time? ------ //

  // TODO
  // -------  Process diagnostic collection ------- //
}

async function getTFScenarioFiles(
  document: vscode.TextDocument,
): Promise<IACScanContent[]> {
  const currentFileUri = document.uri;
  const directoryUri = currentFileUri.with({
    path: currentFileUri.path.replace(/\/[^/]*$/, '/'),
  });

  const entries = await vscode.workspace.fs.readDirectory(directoryUri);

  const contents: IACScanContent[] = [];
  for (const [name, fileType] of entries) {
    if (fileType === vscode.FileType.File) {
      const fileUri = vscode.Uri.joinPath(directoryUri, name);
      const data = await vscode.workspace.fs.readFile(fileUri);
      const contentString = new TextDecoder().decode(data); // cant convert from unit8array to base64 directly
      contents.push({
        filePath: fileUri.fsPath,
        fileContents: btoa(contentString),
      });
    }
  }
  return contents;
}

/**
 * Only care about the current file, just return base64 of it
 */
function getCFNFile(document: vscode.TextDocument): IACScanContent {
  return {
    filePath: document.uri.fsPath,
    fileContents: btoa(document.getText()),
  };
}
