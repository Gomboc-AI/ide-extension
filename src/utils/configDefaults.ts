import * as vscode from 'vscode';
import { z } from 'zod';

export const DEFAULTS = {
  orlRulesServiceUrl: 'https://rules.app.gomboc.ai',
  integrationsServiceUrl: 'https://integrations.app.gomboc.ai',
  orlScanTimeoutSeconds: 90,
  orlDebugKeepTemp: false,
  orlDebugPersistDiagnostics: false,
  // Experimental: run a fast first pass with ORL hooks disabled to discover which rules
  // actually produce changes, then run a second pass with only those rules + hooks enabled.
  // Default off to avoid behavior changes.
  orlTwoPassEnabled: true,
  // DEV ONLY: allow injecting `<workspace>/.orl-dev-rules/` into ORL rulespaces.
  orlLocalDevRulesEnabled: false,
  // DEV ONLY: allows setting a folder that contains ORL Rules that will run a remediation on just those rules
  orlCustomRulesOnly: false,
  orlCustomRulesPath: '',
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

export function getNumberSetting(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  fallback: number,
): number {
  const v = cfg.get(key) as unknown;
  const parsed = z.coerce.number().finite().safeParse(v);
  return parsed.success ? parsed.data : fallback;
}
