// graphql querieos
// @ts-expect-error
import { gql } from '@apollo/client';

// test query
// renamed query to avoid conflict
export const ALL_SECURITY_FRAMEWORKS = gql`
  query Frameworks {
    securityFrameworks {
      id
      name
      tag
      controls {
        id
        identifier
        description
        statements {
          framework
          identifier
          description
          payload {
            ... on PolicyStatementPayloadMustImplement {
              capability {
                id
                title
              }
            }
          }
        }
      }
    }
  }
`;

export const HEALTH_CHECK = gql`
  query Organization {
    organization {
      ... on Organization {
        id
      }
    }
  }
`;
