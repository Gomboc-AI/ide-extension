import * as vscode from 'vscode';

let statusItem: vscode.StatusBarItem | undefined;

export function initScanStatus(context: vscode.ExtensionContext): void {
  if (statusItem) {
    return;
  }
  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000,
  );
  statusItem.name = 'Gomboc Scan Status';
  statusItem.tooltip = 'Shows when a Gomboc scan is running';
  statusItem.text = '$(check) Gomboc: idle';
  statusItem.show();
  context.subscriptions.push(statusItem);
}

export function setScanStatus(args: {
  running: boolean;
  queued?: boolean;
}): void {
  if (!statusItem) {
    return;
  }
  if (!args.running) {
    statusItem.text = '$(check) Gomboc: idle';
    statusItem.tooltip = 'No scan running';
    return;
  }
  const queued = args.queued ? ' (queued)' : '';
  statusItem.text = `$(sync~spin) Gomboc: scanning${queued}`;
  statusItem.tooltip = args.queued
    ? 'Scan running (another scan is queued)'
    : 'Scan running';
}
