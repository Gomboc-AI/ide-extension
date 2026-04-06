// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// has to be ignored because we are compiling to commonjs and typescript complains
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import {
  GET_ACCOUNT_ID,
  HEALTH_CHECK,
} from './queries';
import {
  IndividualFixesQuery,
  SecurityBenchmarksQuery,
  TestOrganizationQuery,
  TestOrganizationQueryVariables,
} from './__generated__/graphql';

export type SecurityBenchmarkQueryBenchmarkArray = Pick<
  SecurityBenchmarksQuery,
  'securityBenchmarks'
>['securityBenchmarks'];
export type SecurityBenchmarkQueryBenchmark =
  SecurityBenchmarkQueryBenchmarkArray[number];
export type SecurityBenchmarkQueryVersionArray = Pick<
  SecurityBenchmarkQueryBenchmark,
  'versions'
>['versions'];
export type SecurityBenchmarkQueryVersion =
  SecurityBenchmarkQueryVersionArray[number];
export type SecurityBenchmarkQueryRecommendationArray = Pick<
  SecurityBenchmarkQueryVersion,
  'recommendations'
>;
export type SecurityBenchmarkQueryRecommendation =
  SecurityBenchmarkQueryRecommendationArray['recommendations'][number];

export type IndividualFixesQueryFixesArray = Pick<
  IndividualFixesQuery,
  'individualFixes'
>['individualFixes'];
export type GroupedFixesQueryFixesArray = Pick<
  IndividualFixesQuery,
  'groupedFixes'
>['groupedFixes'];
export type IndividualFixesQuerySuccess = Extract<
  IndividualFixesQueryFixesArray,
  { __typename: 'IndividualFixesSuccess' }
>;
export type GroupedFixesQuerySuccess = Extract<
  GroupedFixesQueryFixesArray,
  { __typename: 'GroupedFixesSuccess' }
>;
export type IndividualFixesRemediation = Pick<
  IndividualFixesQuerySuccess,
  'remediations'
>['remediations'][number];
export type GroupedFixesRemediation = Pick<
  GroupedFixesQuerySuccess,
  'remediatedFiles'
>['remediatedFiles'][number];

export type Fixes = {
  individualFixes: IndividualFixesRemediation[];
  groupedFixes: GroupedFixesRemediation[];
};

export class CustomerApiClient {
  private static featureBoolCache = new Map<
    string,
    { value: boolean; expiresAtMs: number }
  >();
  private static accountIdCache = new Map<
    string,
    { value: string; expiresAtMs: number }
  >();
  private client;
  private apiKey: string;
  private customerApiUrl: string;

  constructor() {
    const _settings = settings();

    const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    const apiKey = (config.get('apiKey') as string | undefined) || '';
    this.apiKey = apiKey;
    this.customerApiUrl = `${_settings.CUSTOMER_API_URL}`;
    this.client = new ApolloClient({
      ssrMode: true,
      link: createHttpLink({
        uri: this.customerApiUrl,
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
      cache: new InMemoryCache(),
    });
    logger.info('Created a new apollo client .... ');
  }


  public async healthCheck() {
    try {
      const { data } = await this.client.query<
        TestOrganizationQuery,
        TestOrganizationQueryVariables
      >({
        query: HEALTH_CHECK,
      });
      logger.info('Service Healthy ....');
      return data.organization;
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }


  /**
   * Get the account ID for the authenticated user.
   *
   * Cached in-memory for a long TTL since there's no real reason for this to change.
   */
  public async getAccountId(opts?: {
    /**
     * Cache TTL in milliseconds (default: 1 hour).
     * Set to 0 to bypass cache.
     */
    ttlMs?: number;
  }): Promise<string> {
    const ttlMs = opts?.ttlMs ?? 60 * 60 * 1000; // 1 hour default

    const cacheKey = `${this.customerApiUrl}|${this.apiKey}`;
    const now = Date.now();
    if (ttlMs > 0) {
      const cached = CustomerApiClient.accountIdCache.get(cacheKey);
      if (cached && cached.expiresAtMs > now) {
        return cached.value;
      }
    }

    type GetAccountIdData = {
      account: { id: string };
    };

    const { data } = await this.client.query<GetAccountIdData>({
      query: GET_ACCOUNT_ID,
      fetchPolicy: 'no-cache',
    });

    const accountId = data?.account?.id;
    if (!accountId) {
      throw new Error('Failed to retrieve account ID from CustomerAPI');
    }

    if (ttlMs > 0) {
      CustomerApiClient.accountIdCache.set(cacheKey, {
        value: accountId,
        expiresAtMs: now + ttlMs,
      });
    }
    return accountId;
  }
}
