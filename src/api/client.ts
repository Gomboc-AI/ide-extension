// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// has to be ignored because we are compiling to commonjs and typescript complains
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import { ALL_SECURITY_FRAMEWORKS, HEALTH_CHECK } from './queries';

export class CustomerApiClient {
  private client;

  constructor () {
    const _settings = settings();

    if (_settings instanceof Error) {
      logger.error('Invalid settings', _settings);
      throw new Error(_settings.message);
    }
    const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
    const apiKey = config.get('apiKey');

    this.client = new ApolloClient({
      ssrMode: true,
      link: createHttpLink({
        uri: `${_settings.CUSTOMER_API_URL}`,
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }),
      cache: new InMemoryCache(),
    });
    logger.info('Created a new apollo client .... ');
  }

  public async allSecurityFrameworks() {
    try {
      const { data } = await this.client.query({
        query: ALL_SECURITY_FRAMEWORKS,
      });
      return data.securityFrameworks;
    } catch (error) {
      logger.error('Unable to get all the security frameworks', { error });
      throw error;
    }
  }

  public async healthCheck() {
    try {
      const { data } = await this.client.query({
        query: HEALTH_CHECK,
      });
      return data.organization;
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }


}
