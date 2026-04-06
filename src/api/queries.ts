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
