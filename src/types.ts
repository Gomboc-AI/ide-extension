// types file

export enum Language {
  BASH = 'BASH',
  BICEP = 'BICEP',
  C = 'C',
  CLOUDFORMATION_JSON = 'CLOUDFORMATION_JSON',
  CLOUDFORMATION_YAML = 'CLOUDFORMATION_YAML',
  CPP = 'CPP',
  CSHARP = 'CSHARP',
  CSS = 'CSS',
  DOCKER = 'DOCKER',
  ELIXIR = 'ELIXIR',
  GO = 'GO',
  GOTEMPLATE = 'GOTEMPLATE',
  GROOVY = 'GROOVY',
  HCL = 'HCL',
  HELM = 'HELM',
  HTML = 'HTML',
  JAVA = 'JAVA',
  JAVASCRIPT = 'JAVASCRIPT',
  JSON = 'JSON',
  KOTLIN = 'KOTLIN',
  KUBERNETES = 'KUBERNETES',
  LUA = 'LUA',
  MARKDOWN = 'MARKDOWN',
  OCAML = 'OCAML',
  ORL = 'ORL',
  PHP = 'PHP',
  PROTOBUF = 'PROTOBUF',
  PYTHON = 'PYTHON',
  RUBY = 'RUBY',
  RUST = 'RUST',
  SCALA = 'SCALA',
  SQL = 'SQL',
  SWIFT = 'SWIFT',
  TERRAFORM = 'TERRAFORM',
  TOML = 'TOML',
  TYPESCRIPT = 'TYPESCRIPT',
  XML = 'XML',
  YAML = 'YAML',
}

export type IacScanContent = {
  filePath: string;
  fileContent: string;
};

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
  language: Language;
  // policyStatements: SecurityPolicy[]; // shouldn't need this
  metaData: MetaData;
};

export type IIpCurl = {
  ip: string;
};

export type {
  FindingLocation,
  FindingLocationRow,
  OrlReport,
  OrlReportContent,
  OrlReportSpec,
  OrlRule,
  OrlRuleAnnotations,
  ORLReportRule,
  CheckovEvidence,
} from './schemas/orlReport';

export type {
  ReportPayload,
  ReportPayloadWorkflowMetadata,
  ReportPayloadWorkflowStatus,
} from './schemas/reportPayload';
