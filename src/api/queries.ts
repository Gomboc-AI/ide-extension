// graphql querieos
// @ts-expect-error
import { gql } from '@apollo/client';

// test query
// renamed query to avoid conflict
export const HEALTH_CHECK = gql`
  query testOrganization {
    organization {
      ... on Organization {
        id
      }
    }
  }
`;

export const SECURITY_BENCHMARKS = gql`
  query securityBenchmarks {
    securityBenchmarks {
      id
      name
      versions {
        id
        name
        recommendations {
          id
          identifier
          name
          description
          isAdopted
        }
      }
    }
  }
`;

export const INDIVIDUAL_FIXES = gql`
  query individualFixes(
    $individualFixesInput: IndividualFixesInput!
    $groupedFixesInput: GroupedFixesInput!
  ) {
    individualFixes(input: $individualFixesInput) {
      ... on GombocError {
        code
        message
      }
      ... on IndividualFixesSuccess {
        remediations {
          benchmarkRecommendation {
            id
            identifier
            name
            description
          }
          fixes {
            filepath
            oldLine
            newLine
            codePosition {
              line
              column
            }
            lineOffset
            fixType
          }
          codeObservation {
            codeResourceInstance {
              name
              type
              filepath
              line
              codeResource {
                id
                infrastructureTool
                documentationUrl
                cloudResource {
                  id
                  provider
                  title
                  documentationUrl
                }
              }
            }
          }
        }
      }
    }
    groupedFixes(input: $groupedFixesInput) {
      ... on GombocError {
        code
        message
      }
      ... on GroupedFixesSuccess {
        remediatedFiles {
          path
          content
          comments {
            position {
              line
              column
            }
            benchmarkRecommendation {
              id
              name
            }
          }
        }
      }
    }
  }
`;

/**
 * Feature flag evaluation (server-side via CustomerAPI/OpenFeature)
 * We expose a generic Account.hasFeatureBoolean(name, default) and use that here.
 */
export const ACCOUNT_HAS_FEATURE_BOOLEAN = gql`
  query accountHasFeatureBoolean($name: String!, $default: Boolean!) {
    account {
      hasFeatureBoolean(name: $name, default: $default)
    }
  }
`;

/**
 * Get the account ID for the authenticated user.
 */
export const GET_ACCOUNT_ID = gql`
  query getAccountId {
    account {
      id
    }
  }
`;
