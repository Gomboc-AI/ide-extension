// api key retrieval helper and other utils

import { CustomerApiClient } from '../api/client';
import { SecurityPolicy } from '../types';

// stolen from stackoverflow
// https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
export const getFileType = (filename: string) => {
  return (
    filename.substring(filename.lastIndexOf('.') + 1, filename.length) ||
    filename
  );
};

/**
 * Generates the security policies in the correct format
 *  input PolicyStatementPayloadMustImplementType {
      id: ID!
      capabilityId: String!
      metadata: InputStatementMetadata!
    }
 * 
 * @param apiClient 
 */
export const generateSecurityPolicies = async (
  apiClient: CustomerApiClient,
): Promise<SecurityPolicy[]> => {
  // this just needs to be reformatted for some reason?

  const organization = await apiClient.securityFrameworks();
  return organization.policy.statements.map(item => ({
    id: item.id,
    capabilityId: item.payload.capability.id,
    metadata: {
      framework: item.framework,
      identifier: item.identifier,
      description: item.description,
      // source: ORGANIZATION
      createdBy: item.createdBy,
      createdAt: item.createdAt,
    },
  }));
};
