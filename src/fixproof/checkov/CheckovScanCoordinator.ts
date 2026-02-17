import * as vscode from 'vscode';

/**
 * Global (extension-wide) coordinator to prevent multiple Checkov runs
 * from executing concurrently in the Extension Host.
 *
 * We intentionally serialize across all workspaces/scopes because Checkov runs
 * are heavy and the UX is better than competing docker scans.
 */
export class CheckovScanCoordinator {
  private static running = false;

  static isRunning(): boolean {
    return CheckovScanCoordinator.running;
  }

  static async runExclusive<T>(args: {
    title: string;
    task: () => Promise<T>;
  }): Promise<T | undefined> {
    if (CheckovScanCoordinator.running) {
      await vscode.window.showInformationMessage(
        'A Checkov scan is already running. Please wait for it to finish.',
      );
      return undefined;
    }

    CheckovScanCoordinator.running = true;
    try {
      return await args.task();
    } finally {
      CheckovScanCoordinator.running = false;
    }
  }
}
