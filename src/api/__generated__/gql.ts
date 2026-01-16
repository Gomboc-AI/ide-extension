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
    "\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n": typeof types.TestOrganizationDocument,
    "\n  query securityBenchmarks {\n    securityBenchmarks {\n      id\n      name\n      versions {\n        id\n        name\n        recommendations {\n          id\n          identifier\n          name\n          description\n          isAdopted\n        }\n      }\n    }\n  }\n": typeof types.SecurityBenchmarksDocument,
    "\n  query individualFixes(\n    $individualFixesInput: IndividualFixesInput!\n    $groupedFixesInput: GroupedFixesInput!\n  ) {\n    individualFixes(input: $individualFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on IndividualFixesSuccess {\n        remediations {\n          benchmarkRecommendation {\n            id\n            identifier\n            name\n            description\n          }\n          fixes {\n            filepath\n            oldLine\n            newLine\n            codePosition {\n              line\n              column\n            }\n            lineOffset\n            fixType\n          }\n          codeObservation {\n            codeResourceInstance {\n              name\n              type\n              filepath\n              line\n              codeResource {\n                id\n                infrastructureTool\n                documentationUrl\n                cloudResource {\n                  id\n                  provider\n                  title\n                  documentationUrl\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n    groupedFixes(input: $groupedFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on GroupedFixesSuccess {\n        remediatedFiles {\n          path\n          content\n          comments {\n            position {\n              line\n              column\n            }\n            benchmarkRecommendation {\n              id\n              name\n            }\n          }\n        }\n      }\n    }\n  }\n": typeof types.IndividualFixesDocument,
};
const documents: Documents = {
    "\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n": types.TestOrganizationDocument,
    "\n  query securityBenchmarks {\n    securityBenchmarks {\n      id\n      name\n      versions {\n        id\n        name\n        recommendations {\n          id\n          identifier\n          name\n          description\n          isAdopted\n        }\n      }\n    }\n  }\n": types.SecurityBenchmarksDocument,
    "\n  query individualFixes(\n    $individualFixesInput: IndividualFixesInput!\n    $groupedFixesInput: GroupedFixesInput!\n  ) {\n    individualFixes(input: $individualFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on IndividualFixesSuccess {\n        remediations {\n          benchmarkRecommendation {\n            id\n            identifier\n            name\n            description\n          }\n          fixes {\n            filepath\n            oldLine\n            newLine\n            codePosition {\n              line\n              column\n            }\n            lineOffset\n            fixType\n          }\n          codeObservation {\n            codeResourceInstance {\n              name\n              type\n              filepath\n              line\n              codeResource {\n                id\n                infrastructureTool\n                documentationUrl\n                cloudResource {\n                  id\n                  provider\n                  title\n                  documentationUrl\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n    groupedFixes(input: $groupedFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on GroupedFixesSuccess {\n        remediatedFiles {\n          path\n          content\n          comments {\n            position {\n              line\n              column\n            }\n            benchmarkRecommendation {\n              id\n              name\n            }\n          }\n        }\n      }\n    }\n  }\n": types.IndividualFixesDocument,
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
export function gql(source: "\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n"): (typeof documents)["\n  query testOrganization {\n    organization {\n      ... on Organization {\n        id\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query securityBenchmarks {\n    securityBenchmarks {\n      id\n      name\n      versions {\n        id\n        name\n        recommendations {\n          id\n          identifier\n          name\n          description\n          isAdopted\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query securityBenchmarks {\n    securityBenchmarks {\n      id\n      name\n      versions {\n        id\n        name\n        recommendations {\n          id\n          identifier\n          name\n          description\n          isAdopted\n        }\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query individualFixes(\n    $individualFixesInput: IndividualFixesInput!\n    $groupedFixesInput: GroupedFixesInput!\n  ) {\n    individualFixes(input: $individualFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on IndividualFixesSuccess {\n        remediations {\n          benchmarkRecommendation {\n            id\n            identifier\n            name\n            description\n          }\n          fixes {\n            filepath\n            oldLine\n            newLine\n            codePosition {\n              line\n              column\n            }\n            lineOffset\n            fixType\n          }\n          codeObservation {\n            codeResourceInstance {\n              name\n              type\n              filepath\n              line\n              codeResource {\n                id\n                infrastructureTool\n                documentationUrl\n                cloudResource {\n                  id\n                  provider\n                  title\n                  documentationUrl\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n    groupedFixes(input: $groupedFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on GroupedFixesSuccess {\n        remediatedFiles {\n          path\n          content\n          comments {\n            position {\n              line\n              column\n            }\n            benchmarkRecommendation {\n              id\n              name\n            }\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query individualFixes(\n    $individualFixesInput: IndividualFixesInput!\n    $groupedFixesInput: GroupedFixesInput!\n  ) {\n    individualFixes(input: $individualFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on IndividualFixesSuccess {\n        remediations {\n          benchmarkRecommendation {\n            id\n            identifier\n            name\n            description\n          }\n          fixes {\n            filepath\n            oldLine\n            newLine\n            codePosition {\n              line\n              column\n            }\n            lineOffset\n            fixType\n          }\n          codeObservation {\n            codeResourceInstance {\n              name\n              type\n              filepath\n              line\n              codeResource {\n                id\n                infrastructureTool\n                documentationUrl\n                cloudResource {\n                  id\n                  provider\n                  title\n                  documentationUrl\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n    groupedFixes(input: $groupedFixesInput) {\n      ... on GombocError {\n        code\n        message\n      }\n      ... on GroupedFixesSuccess {\n        remediatedFiles {\n          path\n          content\n          comments {\n            position {\n              line\n              column\n            }\n            benchmarkRecommendation {\n              id\n              name\n            }\n          }\n        }\n      }\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;