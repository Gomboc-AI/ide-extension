import * as vscode from 'vscode';
import {
  DEFAULTS,
  getBooleanSetting,
  getStringSetting,
} from '../configDefaults';
import { IntegrationsService } from './IntegrationsService';
import type {
  IntegrationsEventStore,
  IntegrationsRuntimeConfig,
  OrlFixAppliedEventQueueItemV1,
} from './types';

const FIX_APPLIED_QUEUE_KEY = 'gomboc.orlFixAppliedQueueV1';
const FIX_APPLIED_SENT_KEY = 'gomboc.orlFixAppliedSentV1';

/**
 * Bound during extension activation via `initializeIntegrationsService`.
 *
 * Why this exists:
 * - `IntegrationsService` is intentionally decoupled from VS Code APIs.
 * - This file is the VS Code-specific adapter layer that bridges to `globalState`.
 *
 * Lifecycle note:
 * - Before initialization, reads return safe empty defaults and writes are no-ops.
 * - After initialization, queue/sent data persists in `ExtensionContext.globalState`.
 */
let globalStateRef: vscode.Memento | undefined;

/**
 * Typed helper for array-backed globalState entries.
 *
 * Maintainers:
 * - `vscode.Memento#get` is untyped at runtime, so we guard with `Array.isArray`.
 * - The generic `T` gives compile-time type intent for callers while preserving
 *   runtime safety with a conservative empty-array fallback.
 */
const loadArrayFromGlobalState = <T>(key: string): T[] => {
  const value = globalStateRef?.get(key) as unknown;
  return Array.isArray(value) ? (value as T[]) : [];
};

/**
 * Get configuration values for integrations service
 */
export const getIntegrationsConfig = (): IntegrationsRuntimeConfig => {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  return {
    integrationsServiceUrl: getStringSetting(
      config,
      'integrationsServiceUrl',
      DEFAULTS.integrationsServiceUrl,
    ),
    apiKey: config.get('apiKey') as string | undefined,
    orlFixAppliedAnalyticsEnabled: getBooleanSetting(
      config,
      'orlFixAppliedAnalyticsEnabled',
      true,
    ),
    integrationsFixAppliedEndpointPath: getStringSetting(
      config,
      'integrationsFixAppliedEndpointPath',
      DEFAULTS.integrationsFixAppliedEndpointPath,
    ),
  };
};

/**
 * VS Code-backed `IntegrationsEventStore` implementation.
 *
 * This is the only place that knows about `globalState` keys and storage shape.
 * Keep key names and fallback behavior stable for backward compatibility.
 */
const eventStore: IntegrationsEventStore<OrlFixAppliedEventQueueItemV1> = {
  async loadQueue(): Promise<OrlFixAppliedEventQueueItemV1[]> {
    return loadArrayFromGlobalState<OrlFixAppliedEventQueueItemV1>(
      FIX_APPLIED_QUEUE_KEY,
    );
  },

  async saveQueue(items: OrlFixAppliedEventQueueItemV1[]): Promise<void> {
    if (!globalStateRef) {
      return;
    }
    await globalStateRef.update(FIX_APPLIED_QUEUE_KEY, items);
  },

  async loadSentMap(): Promise<Record<string, number>> {
    const value = globalStateRef?.get(FIX_APPLIED_SENT_KEY) as
      | Record<string, number>
      | undefined;
    return value && typeof value === 'object' ? value : {};
  },

  async saveSentMap(sent: Record<string, number>): Promise<void> {
    if (!globalStateRef) {
      return;
    }
    await globalStateRef.update(FIX_APPLIED_SENT_KEY, sent);
  },
};

export const initializeIntegrationsService = (
  context: vscode.ExtensionContext,
): void => {
  // Called from `activate` to attach VS Code storage after extension startup.
  globalStateRef = context.globalState;
};

export const vsCodeIntegrationsService = new IntegrationsService({
  getIntegrationsConfig,
  eventStore,
});
