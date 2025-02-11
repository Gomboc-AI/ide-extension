// types file

import { InfrastructureTool } from './api/__generated__/graphql';
import { Branch, Repository } from './types/git';

export type IACScanContent = {
  filePath: string;
  fileContents: string;
};

export type SecurityPolicy = {
  id: string;
  capabilityId: string;
  metadata: {
    framework: string;
    identifier: string;
    description: string;
    createdBy: string;
    createdAt: string;
  };
};

export type GitMetaData = {
  headName: string;
  mainName: string;
  lastMergeCommit: string;
  remoteUrl: string;
};

export type OSMetaData = {
  userName: string;
  machineName: string;
  privateIp: string;
  publicIp: string;
};

export type MetaData = {
  git: GitMetaData;
  os: OSMetaData;
};

export type SingleScanInput = {
  fileContents: IACScanContent | IACScanContent[];
  tool: InfrastructureTool;
  // policyStatements: SecurityPolicy[]; // shouldn't need this
  metaData: MetaData;
};

export type IIpCurl = {
  ip: string;
};
