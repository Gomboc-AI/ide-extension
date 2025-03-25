// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// has to be ignored because we are compiling to commonjs and typescript complains
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import { HEALTH_CHECK, SECURITY_FRAMEWORKS, SINGLE_SCAN } from './queries';
import {
  GetSecurityFrameworksQuery,
  ScanLocalScenario,
  ScanLocalScenarioInput,
  ScanLocalScenarioMutation,
  ScanLocalScenarioMutationVariables,
  TestOrganizationQuery,
  TestOrganizationQueryVariables,
} from './__generated__/graphql';

export class CustomerApiClient {
  private client;

  constructor() {
    const _settings = settings();
    let customerApiUrl = '';

    if (_settings instanceof Error) {
      logger.error('Invalid settings', _settings);
      // throw new Error(_settings.message);
      customerApiUrl = 'https://app.gomboc.ai/graphql';
    } else {
      customerApiUrl = _settings.CUSTOMER_API_URL;
    }
    const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    const apiKey = config.get('apiKey');
    this.client = new ApolloClient({
      ssrMode: true,
      link: createHttpLink({
        // bad but i don't want to expose this to the user within their settings.json
        uri: `${customerApiUrl}`,
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
      cache: new InMemoryCache(),
    });
    logger.info('Created a new apollo client .... ');
  }

  public async securityFrameworks() {
    try {
      const { data } = await this.client.query<GetSecurityFrameworksQuery>({
        query: SECURITY_FRAMEWORKS,
      });
      logger.info('Fetched security frameworks');
      if (
        data.organization.__typename === 'Organization' &&
        Array.isArray(data.organization.policy.statements)
      ) {
        return data.organization;
      }
      throw new Error('GombocError');
    } catch (error) {
      logger.error('Grabbing security frameworks failed', { error });
      throw error;
    }
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

  public async singleScanMutation(args: {
    inputObject: ScanLocalScenarioInput;
  }): Promise<ScanLocalScenario> {
    logger.info('Sending a single file or scenario scan request');
    try {
      const { data } = await this.client.mutate<
        ScanLocalScenarioMutation,
        ScanLocalScenarioMutationVariables
      >({
        mutation: SINGLE_SCAN,
        variables: {
          input: args.inputObject,
        },
      });
      if (
        data === null ||
        data === undefined ||
        data.scanLocalScenario.__typename === 'GombocError'
      ) {
        throw new Error('GombocError');
      }
      // excluding this for tsc bc apparently the if isn't catching it -_-
      return data.scanLocalScenario as Exclude<
        ScanLocalScenario,
        { __typename: 'GombocError' }
      >;
    } catch (error) {
      logger.error('Sending a single file or scenario failed', { error });
      throw error;
    }
  }
}
