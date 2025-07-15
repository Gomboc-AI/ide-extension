// Centralized API client (axios/fetch wrapper)
import * as vscode from 'vscode';
import logger from '../utils/logger';
import settings from '../settings';
// has to be ignored because we are compiling to commonjs and typescript complains
// @ts-expect-error
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import { HEALTH_CHECK, SECURITY_BENCHMARKS, INDIVIDUAL_FIXES } from './queries';
import {
  IndividualFixesQuery,
  IndividualFixesQueryVariables,
  ScanLocalScenarioInput,
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
  private client;

  constructor() {
    const _settings = settings();

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

  public async securityAdoptedBenchmarkRecommendations() {
    try {
      const { data } = await this.client.query<SecurityBenchmarksQuery>({
        query: SECURITY_BENCHMARKS,
      });
      logger.info('Fetched security benchmarks');
      const retval: SecurityBenchmarkQueryBenchmarkArray = [];
      for (const benchmark of data.securityBenchmarks) {
        const filteredBenchmark = {
          ...benchmark,
        };
        const adoptedVersions: SecurityBenchmarkQueryVersion[] = [];
        for (const version of benchmark.versions) {
          const filteredVersion = {
            ...version,
          };
          const adoptedSecurityBenchmarks: SecurityBenchmarkQueryRecommendation[] =
            [];
          for (const recommendation of version.recommendations) {
            if (!recommendation.isAdopted) {
              continue;
            }
            adoptedSecurityBenchmarks.push(recommendation);
          }
          filteredVersion['recommendations'] = adoptedSecurityBenchmarks;
          adoptedVersions.push(version);
        }
        filteredBenchmark['versions'] = adoptedVersions;
        retval.push(filteredBenchmark);
      }
      return retval;
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

  public async getFixes(args: {
    inputObject: ScanLocalScenarioInput;
  }): Promise<Fixes> {
    logger.info('Sending a single file or scenario scan request');
    try {
      const { data } = await this.client.query<
        IndividualFixesQuery,
        IndividualFixesQueryVariables
      >({
        query: INDIVIDUAL_FIXES,
        variables: {
          individualFixesInput: args.inputObject,
          groupedFixesInput: args.inputObject,
        },
      });
      if (
        data.individualFixes.__typename === 'IndividualFixesSuccess' &&
        data.groupedFixes.__typename === 'GroupedFixesSuccess'
      ) {
        return {
          individualFixes: data.individualFixes.remediations,
          groupedFixes: data.groupedFixes.remediatedFiles,
        };
      } else {
        throw new Error(
          'Please ensure that you have provided a valid Terraform template',
        );
      }
    } catch (error) {
      logger.error('Sending a single file or scenario failed', { error });
      throw error;
    }
  }
}
