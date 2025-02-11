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
  query Organization {
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
            identifier
            description
            createdBy
            createdAt
          }
        }
      }
    }
  }
`;

export const SEND_SINGLE_SCAN = gql`
  mutation ScanFileOrScenarioVscode {
    ScanFileOrScenarioVscode(input: $input) {
      ... on ScanFileOrScenarioVscode {
        test
      }
      ... on GombocError {
        message
        code
      }
    }
  }
`;
