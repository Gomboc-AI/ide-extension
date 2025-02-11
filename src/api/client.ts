// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// has to be ignored because we are compiling to commonjs and typescript complains
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import { HEALTH_CHECK, SECURITY_FRAMEWORKS } from './queries';
import { Organization } from './__generated__/graphql';
import { SingleScanInput } from '../types';

export class CustomerApiClient {
  private client;

  constructor() {
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

  public async securityFrameworks(): Promise<Organization> {
    try {
      const { data } = await this.client.query({
        query: SECURITY_FRAMEWORKS,
      });
      logger.info('Fetched security frameworks');
      return data.organization;
    } catch (error) {
      logger.error('Grabbing security frameworks failed', { error });
      throw error;
    }
  }

  public async healthCheck() {
    try {
      const { data } = await this.client.query({
        query: HEALTH_CHECK,
      });
      logger.info('Service Healthy ....');
      return data.organization;
    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }

  public async sendSingleScan(args: { inputObject: SingleScanInput }) {
    try {
      // const { data } = await this.client.query({
      //   query: SEND_SINGLE_SCAN,
      // });
      const data = 3;
      // TODO update
      return data;
    } catch (error) {
      logger.error('Sending a single file or scenario failed');
      throw error;
    }
  }
}
