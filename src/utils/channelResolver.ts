import * as vscode from 'vscode';
import logger from './logger';
import { RulesServiceClient } from './rulesServiceClient';
import { DEFAULTS, getStringSetting } from './configDefaults';
import { getTenantIdFromApiKey } from './apiKeyClaims';

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

  private static logResolvedChannel(args: {
    channel: string;
    source: 'override' | 'cache' | 'account' | 'fallback';
    accountBasedChannel?: string;
  }): void {
    // Intentionally do not log api keys / tokens.
    logger.info('ORL channel resolved', {
      channel: args.channel,
      source: args.source,
      ...(args.accountBasedChannel
        ? { accountBasedChannel: args.accountBasedChannel }
        : {}),
    });
  }

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
      ChannelResolver.logResolvedChannel({
        channel: overrideChannel,
        source: 'override',
      });
      return overrideChannel;
    }

    // Build cache key from the settings that affect resolution.
    // Note: these caches are in-memory only; a VS Code reload clears them.
    const apiKey = (config.get('apiKey') as string | undefined) || '';
    const rulesServiceUrl = getStringSetting(
      config,
      'orlRulesServiceUrl',
      DEFAULTS.orlRulesServiceUrl,
    );
    const rulesServiceToken =
      (config.get('orlRulesServiceToken') as string | undefined) ||
      apiKey ||
      '';
    const cacheKey = `channel|${apiKey}|${rulesServiceUrl}|${rulesServiceToken}`;
    const now = Date.now();
    const ttlMs = 2 * 24 * 60 * 60 * 1000; // 2 days cache

    // Check cache first
    const cached = ChannelResolver.resolvedChannelCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      ChannelResolver.logResolvedChannel({
        channel: cached.channel,
        source: 'cache',
      });
      return cached.channel;
    }

    try {
      // Get account ID from API key JWT tenant claim
      const accountId = getTenantIdFromApiKey(apiKey);
      if (!accountId) {
        throw new Error('Missing tenantId claim in apiKey JWT payload');
      }
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
        ChannelResolver.logResolvedChannel({
          channel: resolvedChannel,
          source: 'account',
          accountBasedChannel,
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
        ChannelResolver.logResolvedChannel({
          channel: resolvedChannel,
          source: 'fallback',
          accountBasedChannel,
        });
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
      ChannelResolver.logResolvedChannel({
        channel: 'default',
        source: 'fallback',
      });
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
