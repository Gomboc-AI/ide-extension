import * as vscode from 'vscode';
import logger from './logger';
import { CustomerApiClient } from '../api/client';
import { RulesServiceClient } from './rulesServiceClient';

/**
 * Resolves the channel name to use for ORL based on account ID and settings.
 *
 * Logic:
 * 1. If orlChannel setting is non-empty, use it (manual override)
 * 2. Otherwise, use account-based channel: `${accountId}/accounts/default`
 * 3. Check if the resolved channel exists in rules service
 * 4. If account-based channel doesn't exist, fall back to "default"
 */
export class ChannelResolver {
  private static resolvedChannelCache = new Map<
    string,
    { channel: string; expiresAtMs: number }
  >();

  /**
   * Resolve the channel name to use for ORL.
   *
   * @returns The channel name to use
   */
  public static async resolveChannel(): Promise<string> {
    const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    const overrideChannel = (
      config.get('orlChannel') as string | undefined
    )?.trim();

    // If override is set, use it directly (no existence check for overrides)
    if (overrideChannel) {
      logger.info('Using channel override from settings', {
        channel: overrideChannel,
      });
      return overrideChannel;
    }

    // Build cache key based on VS Code config (same approach as CustomerApiClient)
    const apiKey = (config.get('apiKey') as string | undefined) || '';
    const cacheKey = `channel|${apiKey}`;
    const now = Date.now();
    const ttlMs = 60 * 60 * 1000; // 1 hour cache

    // Check cache first
    const cached = ChannelResolver.resolvedChannelCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      logger.debug('Using cached resolved channel', {
        channel: cached.channel,
      });
      return cached.channel;
    }

    try {
      // Get account ID
      const apiClient = new CustomerApiClient();
      const accountId = await apiClient.getAccountId();
      const accountBasedChannel = `${accountId}/accounts/default`;

      logger.info('Resolved account-based channel', {
        accountId,
        channel: accountBasedChannel,
      });

      // Check if account-based channel exists
      const rulesServiceClient = new RulesServiceClient();
      const channelExists = await rulesServiceClient.channelExists({
        channelName: accountBasedChannel,
      });

      let resolvedChannel: string;
      if (channelExists) {
        resolvedChannel = accountBasedChannel;
        logger.info('Using account-based channel', {
          channel: resolvedChannel,
        });
      } else {
        // Fall back to default channel
        resolvedChannel = 'default';
        logger.info(
          'Account-based channel does not exist, falling back to default',
          {
            accountBasedChannel,
            fallbackChannel: resolvedChannel,
          },
        );
      }

      // Cache the result
      ChannelResolver.resolvedChannelCache.set(cacheKey, {
        channel: resolvedChannel,
        expiresAtMs: now + ttlMs,
      });

      return resolvedChannel;
    } catch (error) {
      // If we can't get account ID or check channel, fall back to default
      logger.warn(
        'Failed to resolve account-based channel, falling back to default',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return 'default';
    }
  }

  /**
   * Clear the resolved channel cache (useful for testing or when settings change).
   */
  public static clearCache(): void {
    ChannelResolver.resolvedChannelCache.clear();
  }
}
