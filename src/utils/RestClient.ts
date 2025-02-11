/* eslint-disable eqeqeq */
import axios, { AxiosRequestConfig } from 'axios';
import { LRUCache } from 'lru-cache';
import logger from './logger';

export type RESTClient = {
  get: <T>(
    path: string,
    headers?: Record<string, any>,
    params?: Record<string, any>,
  ) => Promise<T>;
  put: <T>(
    path: string,
    body: Record<string, any>,
    headers?: Record<string, any>,
    params?: Record<string, any>,
  ) => Promise<T>;
  post: <T>(
    path: string,
    body: Record<string, any>,
    headers?: Record<string, any>,
    params?: Record<string, any>,
  ) => Promise<T>;
  delete: <T>(
    path: string,
    headers?: Record<string, any>,
    params?: Record<string, any>,
  ) => Promise<T>;
};

/**
 * @param baseUrl The base URL for the REST API
 * @param cacheKey A key to use for caching GET requests
 * @param baseHeaders Specific headers to include in all requests
 * @returns
 */
export const initClient = (
  baseUrl: string,
  cacheKey: string,
  baseHeaders?: Record<string, string>,
): RESTClient => {
  baseUrl = removeTrailingSlashes(baseUrl);
  const requestsCache = new LRUCache({ max: 100 });

  return {
    get: async <T>(
      path: string,
      headers?: Record<string, any>,
      params?: Record<string, any>,
    ) => {
      const url = `${baseUrl}/${removePreceedingSlashes(path)}`;

      const _cacheKey = `${cacheKey}-${url}-${JSON.stringify(params)}`;
      if (requestsCache.has(_cacheKey)) {
        // logger.debug(`Cache hit for ${_cacheKey}`);
        // logger.info(`GET ${url} -- CACHE HIT`);
        return requestsCache.get(_cacheKey) as Promise<T>;
      }

      logger.info(`GET ${url}`);
      const config: AxiosRequestConfig = {
        headers: { ...baseHeaders, ...headers },
        params,
      };
      const r = await axios.get<T>(url, config);
      if (r.data != null) {
        requestsCache.set(_cacheKey, r.data);
      }
      return r.data;
    },
    put: async <T>(
      path: string,
      body: Record<string, any>,
      headers?: Record<string, any>,
      params?: Record<string, any>,
    ) => {
      const url = `${baseUrl}/${removePreceedingSlashes(path)}`;
      logger.info(`PUT ${url}`);
      const config: AxiosRequestConfig = {
        headers: { ...baseHeaders, ...headers },
        params,
      };
      const r = await axios.put<T>(url, body, config);
      return r.data;
    },
    post: async <T>(
      path: string,
      body: Record<string, any>,
      headers?: Record<string, any>,
      params?: Record<string, any>,
    ) => {
      const url = `${baseUrl}/${removePreceedingSlashes(path)}`;
      logger.info(`POST ${url}`);
      const config: AxiosRequestConfig = {
        headers: { ...baseHeaders, ...headers },
        params,
      };
      const r = await axios.post<T>(url, body, config);
      return r.data;
    },
    delete: async <T>(
      path: string,
      headers?: Record<string, any>,
      params?: Record<string, any>,
    ) => {
      const url = `${baseUrl}/${removePreceedingSlashes(path)}`;
      logger.info(`DELETE ${url}`);
      const config: AxiosRequestConfig = {
        headers: { ...baseHeaders, ...headers },
        params,
      };
      const r = await axios.delete<T>(url, config);
      return r.data;
    },
  };
};

export const removePreceedingSlashes = (path: string) => {
  while (path.startsWith('/')) {
    path = path.slice(1);
  }
  return path;
};

const removeTrailingSlashes = (path: string) => {
  while (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
};
