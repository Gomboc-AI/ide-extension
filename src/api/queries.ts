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
  query individualFixes($input: IndividualFixesInput!) {
    individualFixes(input: $input) {
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
  }
`;
