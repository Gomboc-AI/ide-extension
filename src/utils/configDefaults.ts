import * as vscode from 'vscode';

export const DEFAULTS = {
  customerApiUrl: 'https://api.app.gomboc.ai/graphql',
  orlRulesServiceUrl: 'https://rules.app.gomboc.ai',
  integrationsServiceUrl: 'https://integrations.app.gomboc.ai',
  integrationsFixAppliedEndpointPath: '/reporting/orl-fix-applied',
  orlDebugKeepTemp: false,
  orlDebugPersistDiagnostics: false,
  // Experimental: run a fast first pass with ORL hooks disabled to discover which rules
  // actually produce changes, then run a second pass with only those rules + hooks enabled.
  // Default off to avoid behavior changes.
  orlTwoPassEnabled: true,
};

export function getStringSetting(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string,
): string {
  const v = cfg.get(key) as unknown;
  if (typeof v !== 'string') {
    return fallback;
  }
  const s = v.trim();
  return s ? s : fallback;
}

export function getBooleanSetting(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  fallback: boolean,
): boolean {
  const v = cfg.get(key) as unknown;
  return typeof v === 'boolean' ? v : fallback;
}
