// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';

export class CustomerApiClient {
  private client;

  constructor () {
    const _settings = settings();

    if (_settings instanceof Error) {
      logger.error('Invalid settings', _settings);
      throw new Error(_settings.message);
    }
    this.client = new ApolloClient({
      ssrMode: true,
      link: createHttpLink({
        uri: `${_settings.CUSTOMER_API_URL}/graphql`,
        credentials: 'same-origin',
        headers: {
          bazinga: 'true',
        },
      }),
      cache: new InMemoryCache(),
    });
    logger.info('Created a new apollo client .... ');
  }
}
