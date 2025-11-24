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
import { createOrlClient } from '../orl/orlClient';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer } from '../utils/fileDiffAnalyzer';
import { OrlResultConverter } from '../orl/orlResultConverter';
import { ScanValidator } from '../utils/scanValidator';

export async function scanFileCommand(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  // Check feature flag for ORL remediation
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const orlEnabled = config.get('remediateOrlEnabled') as boolean;

  if (orlEnabled) {
    logger.info('ORL remediation enabled, using ORL client');
    await scanWithOrl(context, scanResultsProvider);
  } else {
    logger.info('Using traditional API client');
    await scanWithApiClient(scanResultsProvider);
  }
}

async function scanWithOrl(
  context: vscode.ExtensionContext,
  scanResultsProvider: ScanResultsProvider,
) {
  try {
    logger.info('ORL scan starting');
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    // Validate file type and prepare scan parameters
    const { filePath, workspacePath, filetype, language } =
      ScanValidator.validateAndPrepareScan(editor);

    logger.info('ORL scanning scope', {
      currentFile: filePath,
      workspacePath: workspacePath,
      scope: 'workspace-level (all IaC files in directory)',
    });

    // Create ORL client and execute remediation
    // Pass extension path so we know exactly where hooks are
    const orlClient = createOrlClient(context.extensionPath);
    const result = await orlClient.remediate(workspacePath, language);

    if (!result.success) {
      vscode.window.showErrorMessage(`ORL remediation failed: ${result.error}`);
      return;
    }

    // Convert ORL result to IDE extension format
    const scanResponse = await OrlResultConverter.convertToScanResponse(
      result,
      filetype,
      filePath,
    );
    logger.info('ORL scan response converted', {
      individualFixesCount: scanResponse.individualFixes.length,
      groupedFixesCount: scanResponse.groupedFixes.length,
      modifiedFiles: Object.keys(result.modifiedFiles),
    });
    scanResultsProvider.generateComments(scanResponse);
    scanResultsProvider.createDiagnostic();
  } catch (error) {
    logger.error('ORL scan failed', { error });
    vscode.window.showErrorMessage(
      `ORL scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function scanWithApiClient(scanResultsProvider: ScanResultsProvider) {
  const apiClient = new CustomerApiClient();
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
        fileContent: Buffer.from(contentString, 'utf8').toString('base64'),
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
      fileContent: Buffer.from(document.getText(), 'utf8').toString('base64'),
    },
  ];
}
