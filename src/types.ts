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
  repo: Repository;
  headName: string;
  headBranch: Branch | undefined;
  mainName: string;
  mainBranch: Branch;
  lastMergeCommit: string;
  status: void; // idk about this one
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
  policyStatements: SecurityPolicy[];
  metaData: MetaData;
};

export type IIpCurl = {
  ip: string;
};
