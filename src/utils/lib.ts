// api key retrieval helper and other utils

import { CustomerApiClient } from '../api/client';
import { GitMetaData, IIpCurl, OSMetaData, SecurityPolicy } from '../types';
import * as vscode from 'vscode';
import { GitExtension } from '../types/git';
import * as os from 'os';
import logger from './logger';
import { initClient } from './RestClient';

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
      // is it fine to null these!
      framework: item.framework!,
      identifier: item.identifier!,
      description: item.description!,
      // source: ORGANIZATION
      createdBy: item.createdBy,
      createdAt: item.createdAt,
    },
  }));
};

export const generateRequestMetadata = async () => {
  const gitMetaData = await generateGitMetaData();
  const osMetaData = await generateOSMetadata();
  return {
    git: gitMetaData,
    os: osMetaData,
  };
};

/**
 * Gathers git meta data using the vscode.git extension.
 * Theres not much documentation on this.
 * implementation:
 * https://github.com/microsoft/vscode-pull-request-github/blob/0068c135d1c3e5ce601c1d5c7f7007904e59901e/src/typings/git.d.ts
 *
 * stackoverflow
 * http://stackoverflow.com/questions/46511595/how-to-access-the-api-for-git-in-visual-studio-code
 * @returns GitMetaData
 */
const generateGitMetaData = async (): Promise<GitMetaData> => {
  try {
    const gitExtension =
      vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension) {
      vscode.window.showErrorMessage('Failed to load git extension');
      throw new Error('Failed to load git extension');
    }
    const gitImport = gitExtension.exports;
    const api = gitImport.getAPI(1);

    const repo = api.repositories[0];
    const remote = repo.state.remotes[0];
    const remoteUrl = remote.fetchUrl;
    const head = repo.state.HEAD; // points to the branch

    const branch = head?.name ? head.name : 'ERROR';

    const mainBranch = 'main';
    const branchDetails = await repo.getBranch(mainBranch);
    const lastMergeCommit = await repo.getMergeBase(branch, mainBranch);
    const status = await repo.status();

    return {
      repo,
      headName: branch,
      headBranch: head,
      mainName: mainBranch,
      mainBranch: branchDetails,
      lastMergeCommit,
      remoteUrl: remoteUrl ?? '', // could be null?
      status,
    };
  } catch (error) {
    vscode.window.showErrorMessage('Error grabbing git data');
    throw new Error('Error grabbing git data');
  }
};

/**
 * This grabs various metadata information from the host machine. namely user and hostmachine names
 * and the public and private ip addresses of the machine
 * @returns OSMetaData
 */
export const generateOSMetadata = async (): Promise<OSMetaData> => {
  try {
    const userInfo = os.userInfo();
    const userName = userInfo.username;
    const machineName = os.hostname();
    // private ip -- Don't know if there is a better way to handle this
    // https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
    const networkInterfaces = os.networkInterfaces();
    let privateIp = '';
    for (const interfaceName of Object.keys(networkInterfaces)) {
      const netInterface = networkInterfaces[interfaceName];
      if (!netInterface) {
        continue;
      }
      for (const net of netInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`Local IP on ${interfaceName}:`, net.address);
          privateIp = net.address;
        }
      }
    }
    // public ip - just have to hit a website that returns the connection
    // going to use ipify
    const restClient = initClient(
      'https://api64.ipify.org?format=json',
      'bazinga',
      {
        Accept: 'application/json',
      },
    );
    const publicIp = await restClient.get<string>('');
    return {
      userName,
      machineName,
      privateIp,
      publicIp,
    };
  } catch (error) {
    logger.info('Error fetching os metadata');
    throw new Error('Error fetching user metada');
  }
};
