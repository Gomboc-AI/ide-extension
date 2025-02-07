import * as vscode from 'vscode';
import { testApiKeyCommand } from './commands/testApiKey';
import { scanFileCommand } from './commands/scanFile';
import { scanAllFilesCommand } from './commands/scanAllFiles';
import { showFrameworksCommand } from './commands/showFrameworks';
import { initializeApiClient } from './api/client';

// Extension entry point
export function activate(context: vscode.ExtensionContext) {
	 
	// pass down the api client
	const apiClient = initializeApiClient(context);

  // Register commands with dependency injection
  const commands = [
    {
      name: 'yourExtension.testApiKey',
      handler: () => testApiKeyCommand(context, apiClient)
    },
    {
      name: 'yourExtension.scanFile',
      handler: () => scanFileCommand(context, apiClient)
    },
    {
      name: 'yourExtension.scanAllFiles',
      handler: () => scanAllFilesCommand(context, apiClient)
    },
    {
      name: 'yourExtension.showFrameworks',
      handler: () => showFrameworksCommand(context, apiClient)
    }
  ];

  // Register all commands
  const disposables = commands.map(({ name, handler }) => 
    vscode.commands.registerCommand(name, handler)
  );

  // Add to extension context subscriptions
  context.subscriptions.push(...disposables);
}

export function deactivate() {
  // Cleanup if needed
}