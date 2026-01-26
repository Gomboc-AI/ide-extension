import * as vscode from 'vscode';
import axios from 'axios';
import logger from './logger';
import { initClient } from './RestClient';
import { DEFAULTS, getStringSetting } from './configDefaults';

/**
 * Client for interacting with the rules service API.
 */
export class RulesServiceClient {
  private rulesServiceUrl: string;
  private rulesServiceToken: string;
  private static channelExistsCache = new Map<
    string,
    { exists: boolean; expiresAtMs: number }
  >();

  constructor() {
    const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    this.rulesServiceUrl = getStringSetting(
      config,
      'orlRulesServiceUrl',
      DEFAULTS.orlRulesServiceUrl,
    );
    this.rulesServiceToken =
      (config.get('orlRulesServiceToken') as string | undefined) ||
      (config.get('apiKey') as string | undefined) ||
      '';
  }

  /**
   * Check if a channel exists in the rules service.
   *
   * Cached in-memory for a short TTL to avoid repeated API calls.
   */
  public async channelExists(args: {
    channelName: string;
    /**
     * Cache TTL in milliseconds (default: 5 minutes).
     * Set to 0 to bypass cache.
     */
    ttlMs?: number;
  }): Promise<boolean> {
    const { channelName, ttlMs: ttlMsOpt } = args;
    const ttlMs = ttlMsOpt ?? 5 * 60 * 1000; // 5 minutes default

    const cacheKey = `${this.rulesServiceUrl}|${this.rulesServiceToken}|${channelName}`;
    const now = Date.now();
    if (ttlMs > 0) {
      const cached = RulesServiceClient.channelExistsCache.get(cacheKey);
      if (cached && cached.expiresAtMs > now) {
        return cached.exists;
      }
    }

    try {
      const client = initClient(this.rulesServiceUrl, 'rules-service', {
        Authorization: `Bearer ${this.rulesServiceToken}`,
        Accept: 'application/json',
      });

      // GET /api/v1/channels/get?name=<channelName>
      await client.get<{ name: string }>('/api/v1/channels/get', undefined, {
        name: channelName,
      });

      // If we get here, the channel exists (no error thrown)
      const exists = true;
      if (ttlMs > 0) {
        RulesServiceClient.channelExistsCache.set(cacheKey, {
          exists,
          expiresAtMs: now + ttlMs,
        });
      }
      return exists;
    } catch (error) {
      // 404 means channel doesn't exist, other errors are unexpected
      let statusCode: number | undefined;
      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status;
      } else if (error && typeof error === 'object' && 'response' in error) {
        statusCode = (error as any).response?.status;
      }

      if (statusCode === 404) {
        const exists = false;
        if (ttlMs > 0) {
          RulesServiceClient.channelExistsCache.set(cacheKey, {
            exists,
            expiresAtMs: now + ttlMs,
          });
        }
        return exists;
      }

      // For other errors, log and assume channel doesn't exist (safer fallback)
      logger.warn('Error checking channel existence in rules service', {
        channelName,
        error: error instanceof Error ? error.message : String(error),
        statusCode,
      });
      return false;
    }
  }
}
