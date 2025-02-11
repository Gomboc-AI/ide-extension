// scans current working file or scenarioimport * as vscode from 'vscode';
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';
// @ts-expect-error
import { fileTypeFromFile } from 'file-type';
import { GitExtension } from '../types/git';
import { getFileType } from '../utils/lib';
import { InfrastructureTool } from '../api/__generated__/graphql';
import { IACScanContent } from '../types';

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
  }
  if (filetype === 'yml' || filetype === 'yaml') {
    tool = InfrastructureTool.Cloudformation;
    fileContents = getCFNFile(document);
  }

  // generate security policies

  // generate git meta data
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

function generateSecurityPolicies() {}
