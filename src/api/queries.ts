import { GombocError } from './__generated__/graphql';
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

export const SECURITY_FRAMEWORKS = gql`
  query getSecurityFrameworks {
    organization {
      ... on Organization {
        id
        name
        policy {
          statements {
            id
            payload {
              ... on PolicyStatementPayloadMustImplementType {
                capability {
                  id
                  title
                }
              }
            }
            framework
            description
            identifier
            createdBy
            createdAt
          }
        }
      }
    }
  }
`;



export const SINGLE_SCAN = gql`
  mutation scanLocalScenario($input: ScanLocalScenarioInput!) {
    scanLocalScenario(input: $input) {
      ... on ScanLocalScenario {
        results {
          category
          iacTool
          fileName
          logicalResource{
            line
            name
            filepath
            type
          }
          policyStatement{
            id
            payload {
              ... on PolicyStatementPayloadMustImplement {
                capability {
                  id
                  title
                }
              }
            }
            framework
            identifier
            description
          }
          fixes {
            oldValue
            newValue
            issueType
            lineOffset
            fixType
            position {
              column
              line
            }
          }
        }
      }
    }
  }
`;
