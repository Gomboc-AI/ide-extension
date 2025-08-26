// Tests api key
import * as vscode from 'vscode';
import { CustomerApiClient } from '../api/client';

/**
 * This command will make a request to the customerapi server using the token within client
 * And if it fails, something is configured incorrectly
 */
export async function testApiKeyCommand(
  _: vscode.ExtensionContext,
) {
  try {
    const apiClient = new CustomerApiClient();
    await apiClient.healthCheck();
    vscode.window.showInformationMessage('API Key test success!');
  } catch (error) {
    vscode.window.showErrorMessage(
      'API Test Failed - Check API Key in extension settings',
    );
  }
}
