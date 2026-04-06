// Tests api key
import * as vscode from 'vscode';
import { RulesServiceClient } from '../utils/rulesServiceClient';

/**
 * Verifies API key validity by calling rules service with bearer auth.
 */
export async function testApiKeyCommand(_: vscode.ExtensionContext) {
  try {
    const rulesServiceClient = new RulesServiceClient();
    await rulesServiceClient.verifyAccess();
    vscode.window.showInformationMessage('API Key test success!');
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown token verification error';
    vscode.window.showErrorMessage(
      `API Test Failed - ${message}. Check API key / rules service settings.`,
    );
  }
}
