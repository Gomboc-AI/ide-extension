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

export const SINGLE_SCAN = gql`
  mutation ScanFileOrScenarioVscode($input: ScanFileOrScenarioVscodeInput!) {
    scanFileOrScenarioVscode(input: $input) {
      ... on ScanFileOrScenarioVscode {
        results {
          category
          description
          documentationLink
          iacTool
          fileName
          fixes {
            currentValue
            newValue
            lineNumber
            issueType
          }
        }
      }
      ... on GombocError {
        message
        code
      }
    }
  }
`;
