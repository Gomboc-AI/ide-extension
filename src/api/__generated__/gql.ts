/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n': typeof types.TestOrganizationDocument;
  '\n  query getSecurityFrameworks {\n    organization {\n      ... on Organization {\n        id\n        name\n        policy {\n          statements {\n            id\n            payload {\n              ... on PolicyStatementPayloadMustImplementType {\n                capability {\n                  id\n                  title\n                }\n              }\n            }\n            framework\n            identifier\n            description\n            createdBy\n            createdAt\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetSecurityFrameworksDocument;
  '\n  mutation scanLocalScenario($input: ScanLocalScenarioInput!) {\n    scanLocalScenario(input: $input) {\n      ... on GombocError {\n        message\n        code\n      }\n      ... on ScanLocalScenario {\n        results {\n          fixes {\n            oldValue\n            newValue\n            lineNumber\n            issueType\n          }\n          category\n          description\n          iacTool\n          documentationLink\n          fileName\n        }\n      }\n    }\n  }\n': typeof types.ScanLocalScenarioDocument;
};
const documents: Documents = {
  '\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n':
    types.TestOrganizationDocument,
  '\n  query getSecurityFrameworks {\n    organization {\n      ... on Organization {\n        id\n        name\n        policy {\n          statements {\n            id\n            payload {\n              ... on PolicyStatementPayloadMustImplementType {\n                capability {\n                  id\n                  title\n                }\n              }\n            }\n            framework\n            identifier\n            description\n            createdBy\n            createdAt\n          }\n        }\n      }\n    }\n  }\n':
    types.GetSecurityFrameworksDocument,
  '\n  mutation scanLocalScenario($input: ScanLocalScenarioInput!) {\n    scanLocalScenario(input: $input) {\n      ... on GombocError {\n        message\n        code\n      }\n      ... on ScanLocalScenario {\n        results {\n          fixes {\n            oldValue\n            newValue\n            lineNumber\n            issueType\n          }\n          category\n          description\n          iacTool\n          documentationLink\n          fileName\n        }\n      }\n    }\n  }\n':
    types.ScanLocalScenarioDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: '\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n',
): (typeof documents)['\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n'];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: '\n  query getSecurityFrameworks {\n    organization {\n      ... on Organization {\n        id\n        name\n        policy {\n          statements {\n            id\n            payload {\n              ... on PolicyStatementPayloadMustImplementType {\n                capability {\n                  id\n                  title\n                }\n              }\n            }\n            framework\n            identifier\n            description\n            createdBy\n            createdAt\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query getSecurityFrameworks {\n    organization {\n      ... on Organization {\n        id\n        name\n        policy {\n          statements {\n            id\n            payload {\n              ... on PolicyStatementPayloadMustImplementType {\n                capability {\n                  id\n                  title\n                }\n              }\n            }\n            framework\n            identifier\n            description\n            createdBy\n            createdAt\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(
  source: '\n  mutation scanLocalScenario($input: ScanLocalScenarioInput!) {\n    scanLocalScenario(input: $input) {\n      ... on GombocError {\n        message\n        code\n      }\n      ... on ScanLocalScenario {\n        results {\n          fixes {\n            oldValue\n            newValue\n            lineNumber\n            issueType\n          }\n          category\n          description\n          iacTool\n          documentationLink\n          fileName\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation scanLocalScenario($input: ScanLocalScenarioInput!) {\n    scanLocalScenario(input: $input) {\n      ... on GombocError {\n        message\n        code\n      }\n      ... on ScanLocalScenario {\n        results {\n          fixes {\n            oldValue\n            newValue\n            lineNumber\n            issueType\n          }\n          category\n          description\n          iacTool\n          documentationLink\n          fileName\n        }\n      }\n    }\n  }\n'];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
