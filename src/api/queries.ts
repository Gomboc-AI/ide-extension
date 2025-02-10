// graphql querieos
// @ts-expect-error
import { gql } from '@apollo/client';


// test query
// renamed query to avoid conflict
export const frameworksQuery = gql`
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
