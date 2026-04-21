import * as vscode from 'vscode';
import axios from 'axios';
import logger from './logger';
import { initClient } from './RestClient';
import { DEFAULTS, getStringSetting } from './configDefaults';

function getErrorStatusCode(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }
  return undefined;
}

/**
 * Client for interacting with the rules service API.
 * TODO: Replace with the gomboc-node-sdk
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
   * Verify that the configured token can authenticate against rules service.
   *
   * Uses a lightweight authenticated channel read and treats 401/403 as
   * invalid token. Other failures are surfaced as connectivity/server issues.
   */
  public async verifyAccess(): Promise<void> {
    try {
      const client = initClient(this.rulesServiceUrl, 'rules-service', {
        Authorization: `Bearer ${this.rulesServiceToken}`,
        Accept: 'application/json',
      });

      await client.get<{ name: string }>('/api/v1/channels/get', undefined, {
        name: 'default',
      });
    } catch (error) {
      const statusCode = getErrorStatusCode(error);

      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Invalid rules service token');
      }

      throw error;
    }
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
      // 404 means channel doesn't exist.
      // Other errors (401/403/5xx/network) should be treated as transient and MUST NOT
      // be interpreted as "channel doesn't exist" (otherwise we'd cache a false negative).
      const statusCode = getErrorStatusCode(error);

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

      // For other errors, surface to caller so it can decide how to fall back.
      throw error;
    }
  }
}


// docker run --rm \
//   -v "$(pwd)/rules:/output" \
//   -e RULE_SERVICE_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNiMTg1OGFkIn0.eyJzdWIiOiI2NDVjYThhNC0xNmQ5LTQ3MzktYmRiZS00ZjA0NjM3ZDMwMGMiLCJ0eXBlIjoidXNlckFjY2Vzc1Rva2VuIiwidGVuYW50SWQiOiJjNjUwMWM1Yy00ZGIzLTQxMWMtOTE2OC1kZjMxYTQ1NTA1NWQiLCJ1c2VySWQiOiJlMGI5ZWYxYi05NGQ5LTQwMzUtODYyZi0yMjE5MGRhMWU4NDgiLCJhcHBsaWNhdGlvbklkIjoiMjMzZjIxOWMtZjhkMC00MDI4LTliYzItODFkNzRmMjhlNDU2Iiwicm9sZXMiOlsiRkVUQ0gtUk9MRVMtQlktQVBJIl0sInBlcm1pc3Npb25zIjpbIkZFVENILVBFUk1JU1NJT05TLUJZLUFQSSJdLCJhdWQiOiIzYjE4NThhZC0zOTExLTQ5YmItOGVkZi1lNDUzODI1YmY0YjciLCJpc3MiOiJodHRwczovL2F1dGguYXBwLmdvbWJvYy5haSIsImlhdCI6MTc3MzI2NjQ1Nn0.ANmIWMgbxKPJNLY3abDvj3NvWa8W-gUSSY8zcGCneAUo5mw0xiwlIG0riIU2c0H4UWW7HxcCl4xESbbwOe4zpHeB7cy7igBwtCkp-I2lZkU7LuAKkWCCcoSBSrWvqEdG_5yHUGJRHx8mF0T_HfmkBDXkjKW3joTyVJiT1v8UM0dhUiicUsxE2SsQK1_TNJhejvOiLLmvh0yZeNU6YJPBI1OZ1K7g453TiRcXlqjZ7Rv3b0PSWe4I-dukCt6QRoDRN0isEPY_HN1y9HzEWfrQUfi_1iIMouSXOvegEbvRh-iXjLytsVZmP4C8dk-Gpe59Q0fVwcgRgVkFX1u_QPC1PQ" \
//   gombocai/orl:v1.3.0-latest rules pull \
//   --url="https://rules.app.gomboc.ai" \
//   --out=/output \
//   --channel="c6501c5c-4db3-411c-9168-df31a455055d/set/default"
