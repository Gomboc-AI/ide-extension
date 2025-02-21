/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

/** A Scan Result that originated from a Scan Request */
export type ActionResult = {
  __typename?: 'ActionResult';
  /** The related repository branch name */
  branch?: Maybe<Scalars['String']['output']>;
  /** A general state of the scan result */
  condition?: Maybe<ActionResultCondition>;
  createdAt: Scalars['String']['output'];
  /** The related repository directory */
  directory: Scalars['String']['output'];
  /** The mode in which the scan was requested */
  effect: Effect;
  id: Scalars['ID']['output'];
  /** The related infrastructure tool */
  infrastructureTool: InfrastructureTool;
  /** The linked repository the scan result relates to, if still available */
  link?: Maybe<Link>;
  /**
   * The list of observations in this scan result
   * @deprecated use policyObservations -- paginated
   */
  observations: Array<PolicyObservation>;
  /** Returns the total number of observations in this scan result */
  observationsCount: Scalars['Int']['output'];
  /** Returns a page of alerts from Orca */
  orcaAlerts: OrcaAlertsPage;
  /** The organization ID the scan result is related to */
  organizationId: Scalars['ID']['output'];
  /** The name of the SCM Provider owner of the related repository */
  ownerName: Scalars['String']['output'];
  /** Returns the number of observations that were already compliant */
  passedCount: Scalars['Int']['output'];
  /** A page of policy observations in this scan result */
  policyObservations: PolicyObservationsPage;
  /** The project the scan result relates to, if still available */
  project?: Maybe<Project>;
  /** Project name snapshot in case it was deleted */
  projectName: Scalars['String']['output'];
  /** The Pull Request, if one was created */
  pullRequest?: Maybe<PullRequest>;
  /** Returns the number of observations in violation that were remediated */
  remediationsCount: Scalars['Int']['output'];
  /** The ID of the related repository */
  repositoryId: Scalars['ID']['output'];
  /** The name of the related repository */
  repositoryName: Scalars['String']['output'];
  /** Indicates where the request came from */
  requestOrigin: RequestOrigin;
  /** @deprecated internal use only */
  scanId: Scalars['ID']['output'];
  /** The parent scan request ID */
  scanRequestId: Scalars['ID']['output'];
  /** A markdown formatted summary of the scan result */
  summary: Scalars['String']['output'];
  /** Returns any tickets linked to this scan result */
  tickets: TicketPage;
  /** Returns the number of observations in violation */
  violationsCount: Scalars['Int']['output'];
};


/** A Scan Result that originated from a Scan Request */
export type ActionResultObservationsArgs = {
  exclude?: InputMaybe<Array<Disposition>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


/** A Scan Result that originated from a Scan Request */
export type ActionResultOrcaAlertsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  perPage?: InputMaybe<Scalars['Int']['input']>;
};


/** A Scan Result that originated from a Scan Request */
export type ActionResultPolicyObservationsArgs = {
  exclude?: InputMaybe<Array<Disposition>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


/** A Scan Result that originated from a Scan Request */
export type ActionResultTicketsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export enum ActionResultCondition {
  AllFixed = 'ALL_FIXED',
  Compliant = 'COMPLIANT',
  NoneFixed = 'NONE_FIXED',
  SomeFixed = 'SOME_FIXED'
}

export type ActionResultPage = {
  __typename?: 'ActionResultPage';
  page: Scalars['Int']['output'];
  results: Array<ActionResult>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ActionResultResponse = ActionResult | GombocError;

export type AdoptFrameworkControlsIntoOrganizationInput = {
  policyStatements: Array<CreateMustImplementPolicyStatementInput>;
  resetPolicy: Scalars['Boolean']['input'];
};

export type AdoptFrameworkControlsIntoOrganizationResponse = GombocError | Policy;

export type AppliedMustImplementPolicyStatement = {
  __typename?: 'AppliedMustImplementPolicyStatement';
  capability: Capability;
};

export type AppliedPolicyStatement = {
  __typename?: 'AppliedPolicyStatement';
  description: Scalars['String']['output'];
  framework: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  observations: Array<PolicyObservation>;
  payload: AppliedPolicyStatementPayloadType;
  source: StatementSource;
};

export type AppliedPolicyStatementPayloadType = AppliedMustImplementPolicyStatement;

export type AutoRemediateCfnFileComments = {
  __typename?: 'AutoRemediateCfnFileComments';
  commentMarkdown: Scalars['String']['output'];
  /** @deprecated No longer supported */
  commentPlain?: Maybe<Scalars['String']['output']>;
  line: Scalars['Int']['output'];
};

export type AutoRemediateCfnFileSuccess = {
  __typename?: 'AutoRemediateCfnFileSuccess';
  appliedPolicyStatements: Array<AppliedPolicyStatement>;
  file: AutoRemediatedCfnFile;
  generalCommentMarkdown: Scalars['String']['output'];
  /** @deprecated No longer supported */
  generalCommentPlain?: Maybe<Scalars['String']['output']>;
};

export type AutoRemediateCfnInvalidFileError = {
  __typename?: 'AutoRemediateCfnInvalidFileError';
  filepath: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type AutoRemediateTfHclFileComments = {
  __typename?: 'AutoRemediateTfHCLFileComments';
  commentMarkdown: Scalars['String']['output'];
  /** @deprecated No longer supported */
  commentPlain?: Maybe<Scalars['String']['output']>;
  line: Scalars['Int']['output'];
};

export type AutoRemediateTfHclFilesSuccess = {
  __typename?: 'AutoRemediateTfHCLFilesSuccess';
  appliedPolicyStatements: Array<AppliedPolicyStatement>;
  files: Array<AutoRemediatedTfHclFile>;
  generalCommentMarkdown: Scalars['String']['output'];
  /** @deprecated No longer supported */
  generalCommentPlain?: Maybe<Scalars['String']['output']>;
};

export type AutoRemediatedCfnFile = {
  __typename?: 'AutoRemediatedCfnFile';
  fileComments: Array<AutoRemediateCfnFileComments>;
  filepath: Scalars['String']['output'];
  newContent: Scalars['String']['output'];
};

export type AutoRemediatedTfHclFile = {
  __typename?: 'AutoRemediatedTfHCLFile';
  fileComments: Array<AutoRemediateTfHclFileComments>;
  filepath: Scalars['String']['output'];
  newContent: Scalars['String']['output'];
};

export enum BitBucketApiVersion {
  V2_0 = 'V2_0'
}

export type BulkAllLinkScanRemoteInput = {
  iacTools: Array<InfrastructureTool>;
};

export type BulkLinkScanRemoteInput = {
  iacTools: Array<InfrastructureTool>;
  linkIds: Array<Scalars['ID']['input']>;
};

export type BulkLinkScanRemoteTfHcl2Input = {
  linkIds: Array<Scalars['ID']['input']>;
};

export type Capability = {
  __typename?: 'Capability';
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type CloudResource = {
  __typename?: 'CloudResource';
  id: Scalars['ID']['output'];
  provider: CloudResourceProvider;
  title: Scalars['String']['output'];
};

export type CloudResourcePage = {
  __typename?: 'CloudResourcePage';
  page: Scalars['Int']['output'];
  results: Array<CloudResource>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export enum CloudResourceProvider {
  Aws = 'AWS',
  Azure = 'AZURE',
  Gcp = 'GCP'
}

export type CodeResource = {
  __typename?: 'CodeResource';
  cloudResource: CloudResource;
  documentationUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  infrastructureTool: InfrastructureTool;
};

export type CodeResourcePage = {
  __typename?: 'CodeResourcePage';
  page: Scalars['Int']['output'];
  results: Array<CodeResource>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ConfigOption = {
  __typename?: 'ConfigOption';
  capability: Capability;
  cloudResource?: Maybe<CloudResource>;
  id: Scalars['ID']['output'];
  ontologicalSubgraph: OntologicalSubgraph;
  resourceKey: Scalars['String']['output'];
};

export type CreateAzdoProviderInput = {
  organization: Scalars['String']['input'];
  personalAccessToken: Scalars['String']['input'];
};

export type CreateAzdoProviderOutput = GitProvider | GombocError;

export type CreateBitBucketProviderInput = {
  accessToken: Scalars['String']['input'];
  apiVersion: BitBucketApiVersion;
  gombocAccessToken: Scalars['String']['input'];
  workspaceSlug: Scalars['String']['input'];
};

export type CreateBitBucketProviderOutput = GitProvider | GombocError;

export type CreateGitHubProviderInput = {
  code: Scalars['String']['input'];
  installationId: Scalars['ID']['input'];
};

export type CreateGitHubProviderResponse = GitProvider | GombocError;

export type CreateGitLabProviderInput = {
  apiUrl: Scalars['String']['input'];
  apiVersion: GitLabApiVersion;
  groupAccessToken: Scalars['String']['input'];
};

export type CreateGitLabProviderOutput = GitProvider | GombocError;

export type CreateLinkInput = {
  gitProviderId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  repositoryId: Scalars['ID']['input'];
};

export type CreateMustImplementPolicyStatementInput = {
  capabilityId: Scalars['ID']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  framework?: InputMaybe<Scalars['String']['input']>;
  identifier?: InputMaybe<Scalars['String']['input']>;
};

export type CreateOrcaIntegrationInput = {
  gombocToken: Scalars['String']['input'];
  name: Scalars['String']['input'];
  orcaApiToken: Scalars['String']['input'];
  orcaRegion: OrcaRegion;
};

export type CreatePolicyStatementResponse = GombocError | SetPolicyStatement;

export type CreateProjectResponse = GombocError | Project;

export type CreateTicketInput = {
  actionResultId: Scalars['ID']['input'];
  externalUrl: Scalars['String']['input'];
};

export type CreateTicketOutput = GombocError | Ticket;

export type DeleteGitProviderInput = {
  gitProviderId: Scalars['ID']['input'];
};

export type DeleteOrcaIntegrationInput = {
  integrationId: Scalars['ID']['input'];
};

export type DeletePolicyStatementsInput = {
  policyStatementIds: Array<Scalars['ID']['input']>;
};

export type DeleteTicketInput = {
  ticketId: Scalars['ID']['input'];
};

export enum Disposition {
  AlreadyCompliant = 'ALREADY_COMPLIANT',
  AutoRemediated = 'AUTO_REMEDIATED',
  CannotRemediate = 'CANNOT_REMEDIATE',
  InsufficientInfoToRemediate = 'INSUFFICIENT_INFO_TO_REMEDIATE',
  NotApplicable = 'NOT_APPLICABLE'
}

export type Edge = {
  __typename?: 'Edge';
  label: Scalars['String']['output'];
  source: Node;
  target: Node;
  value?: Maybe<Scalars['String']['output']>;
};

export enum Effect {
  Preview = 'Preview',
  SubmitForReview = 'SubmitForReview'
}

export type FailedScan = {
  __typename?: 'FailedScan';
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  message: Scalars['String']['output'];
};

export enum GitLabApiVersion {
  V4 = 'V4'
}

export type GitMetaDataInput = {
  headName: Scalars['String']['input'];
  lastMergeCommit: Scalars['String']['input'];
  mainName: Scalars['String']['input'];
  remote: Scalars['String']['input'];
};

/**
 * Represents an integration to an SCM provider **owner** entity, such as:
 * - A GitHub **organization**
 * - A GitLab **group**
 * - A Bitbucket **workspace**
 * - An Azure DevOps **organization**
 */
export type GitProvider = {
  __typename?: 'GitProvider';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who integrated the SCM provider */
  createdBy: Scalars['String']['output'];
  /** A URL to the SCM provider integration page */
  externalUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** The name of the integration to be displayed */
  name?: Maybe<Scalars['String']['output']>;
  providerName: ProviderName;
  /** All the repositories this integration has access to */
  repositories: Array<Repository>;
};


/**
 * Represents an integration to an SCM provider **owner** entity, such as:
 * - A GitHub **organization**
 * - A GitLab **group**
 * - A Bitbucket **workspace**
 * - An Azure DevOps **organization**
 */
export type GitProviderRepositoriesArgs = {
  selection?: InputMaybe<RepositorySelection>;
};

export type GitProviderResponse = GitProvider | GombocError;

export type GombocError = {
  __typename?: 'GombocError';
  code?: Maybe<GombocErrorCode>;
  message: Scalars['String']['output'];
};

export enum GombocErrorCode {
  Generic = 'GENERIC',
  InvalidArgument = 'INVALID_ARGUMENT',
  NotFound = 'NOT_FOUND',
  NotImplemented = 'NOT_IMPLEMENTED',
  Unauthorized = 'UNAUTHORIZED'
}

export type IacScanContentInput = {
  fileContents: Scalars['String']['input'];
  filePath: Scalars['String']['input'];
};

export enum InfrastructureTool {
  Cloudformation = 'CLOUDFORMATION',
  Terraform = 'TERRAFORM'
}

export type InheritedAutoRemediateCfnFileResponse = AutoRemediateCfnFileSuccess | AutoRemediateCfnInvalidFileError;

export type InheritedAutoRemediateTfHclFilesResponse = AutoRemediateTfHclFilesSuccess;

export type InheritedPolicyStatementPayloadMustImplementType = {
  capabilityId: Scalars['String']['input'];
  id: Scalars['ID']['input'];
  metadata: InputStatementMetadata;
};

export type InputFile = {
  content: Scalars['String']['input'];
  filepath: Scalars['String']['input'];
};

export type InputStatementMetadata = {
  createdAt: Scalars['String']['input'];
  createdBy: Scalars['String']['input'];
  description: Scalars['String']['input'];
  framework: Scalars['String']['input'];
  identifier: Scalars['String']['input'];
  source: StatementSource;
};

export enum IntegrationParty {
  Orca = 'ORCA',
  Wiz = 'WIZ'
}

export type Link = {
  __typename?: 'Link';
  /** Returns a page of Scan Results related to this linked repository */
  actionResults: ActionResultPage;
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who linked the repository */
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Return the latest Scan Request related to this linked repository */
  lastScanRequest?: Maybe<ScanRequest>;
  /** Returns the project the repository is linked to */
  project: Project;
  /** Returns the name of the SCM Provider */
  providerName: ProviderName;
  /** Returns the repository itself */
  repository: LinkedRepository;
  /** Returns a URL-friendly slug for the linked repository */
  slug: Scalars['ID']['output'];
};


export type LinkActionResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type LinkRepositoriesInput = {
  projectId: Scalars['ID']['input'];
  providers: Array<LinkRepositoriesProviderInput>;
};

export type LinkRepositoriesProviderInput = {
  gitProviderId: Scalars['ID']['input'];
  selectedRepositoryIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type LinkRepositoryResponse = GombocError | Link;

export type LinkResponse = GombocError | Link;

export type LinkScanRemoteInput = {
  branchName?: InputMaybe<Scalars['String']['input']>;
  effect: Effect;
  iacTools: Array<InfrastructureTool>;
  linkId: Scalars['ID']['input'];
  pullRequestTitle?: InputMaybe<Scalars['String']['input']>;
  recurse?: InputMaybe<Scalars['Boolean']['input']>;
  workingDirectory?: InputMaybe<Scalars['String']['input']>;
};

export type LinkScanRemoteTfHcl2Input = {
  branchName?: InputMaybe<Scalars['String']['input']>;
  effect: Effect;
  linkId: Scalars['ID']['input'];
  pullRequestTitle?: InputMaybe<Scalars['String']['input']>;
  recurse?: InputMaybe<Scalars['Boolean']['input']>;
  workingDirectory?: InputMaybe<Scalars['String']['input']>;
};

export type LinkedRepository = Repository | UnreachableRepository;

export type LinksPage = {
  __typename?: 'LinksPage';
  /** Use this to get the next page */
  lastKey?: Maybe<Scalars['ID']['output']>;
  links: Array<Link>;
};

export type LogicalResource = {
  __typename?: 'LogicalResource';
  cloudResource?: Maybe<CloudResource>;
  filepath: Scalars['String']['output'];
  line: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type MetaDataInput = {
  git: GitMetaDataInput;
  os: OsMetaDataInput;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Adopt all policy statements from a security framework */
  adoptFrameworkControlsIntoOrganization: AdoptFrameworkControlsIntoOrganizationResponse;
  /** Scans all linked repositories */
  bulkAllLinkScanRemote: ScanRequestResponseType;
  /** Call scans on a number of linked repository with default settings */
  bulkLinkScanRemote: ScanRequestResponseType;
  createAzdoProvider: CreateAzdoProviderOutput;
  createBitBucketProvider: CreateBitBucketProviderOutput;
  createGitHubProvider: CreateGitHubProviderResponse;
  createGitLabProvider: CreateGitLabProviderOutput;
  /** Create a custom policy statement */
  createMustImplementOrganizationPolicyStatement: CreatePolicyStatementResponse;
  createOrcaIntegration: OrcaIntegrationResponse;
  /** Create a new Gomboc project */
  createProject: CreateProjectResponse;
  /** Link a Ticket to a Scan Result */
  createTicket: CreateTicketOutput;
  /** Remove an SCM provider integration */
  deleteGitProvider?: Maybe<GombocError>;
  /** Unlink a repository from a project */
  deleteLink?: Maybe<GombocError>;
  /** Remove a CPSM Integration */
  deleteOrcaIntegration?: Maybe<GombocError>;
  /** Delete policy statements in bulk */
  deletePolicyStatements?: Maybe<GombocError>;
  /** Delete a Gomboc project */
  deleteProject?: Maybe<GombocError>;
  /** Unlink a Ticket from a Scan Result */
  deleteTicket?: Maybe<GombocError>;
  /** Link repositories to a project */
  linkRepositories: Array<LinkRepositoryResponse>;
  /** Call a scan on a linked repository */
  linkScanRemote: ScanRequestResponseType;
  /** *Internal use only* */
  putSetupCompleted?: Maybe<GombocError>;
  /** @deprecated No longer supported */
  resetOrganizationPolicy?: Maybe<GombocError>;
  /** Scan single file or scenario, sent from vscode */
  scanFileOrScenarioVscode: ScanFileOrScenarioVscodeOutput;
  /** Call a scan from Orca */
  scanFromOrca: ScanRequestResponseType;
  scanOnPullRequest: ScanRequestResponseType;
  scanOnSchedule: ScanRequestResponseType;
  /**
   * *Internal use only*
   * @deprecated Use scanOnSchedule or scanOnPullRequest instead
   */
  scanRemote: Scalars['ID']['output'];
  /** @deprecated No longer in use */
  sendSupportRequest: Scalars['Boolean']['output'];
  /** Set the scan target */
  setScanTarget?: Maybe<GombocError>;
  /** *Internal use only* */
  updatePullRequestStatus?: Maybe<GombocError>;
};


export type MutationAdoptFrameworkControlsIntoOrganizationArgs = {
  input: AdoptFrameworkControlsIntoOrganizationInput;
};


export type MutationBulkAllLinkScanRemoteArgs = {
  input: BulkAllLinkScanRemoteInput;
};


export type MutationBulkLinkScanRemoteArgs = {
  input: BulkLinkScanRemoteInput;
};


export type MutationCreateAzdoProviderArgs = {
  input: CreateAzdoProviderInput;
};


export type MutationCreateBitBucketProviderArgs = {
  input: CreateBitBucketProviderInput;
};


export type MutationCreateGitHubProviderArgs = {
  input: CreateGitHubProviderInput;
};


export type MutationCreateGitLabProviderArgs = {
  input: CreateGitLabProviderInput;
};


export type MutationCreateMustImplementOrganizationPolicyStatementArgs = {
  input: CreateMustImplementPolicyStatementInput;
};


export type MutationCreateOrcaIntegrationArgs = {
  input: CreateOrcaIntegrationInput;
};


export type MutationCreateProjectArgs = {
  projectName: Scalars['String']['input'];
};


export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};


export type MutationDeleteGitProviderArgs = {
  input: DeleteGitProviderInput;
};


export type MutationDeleteLinkArgs = {
  linkId: Scalars['ID']['input'];
};


export type MutationDeleteOrcaIntegrationArgs = {
  input: DeleteOrcaIntegrationInput;
};


export type MutationDeletePolicyStatementsArgs = {
  input: DeletePolicyStatementsInput;
};


export type MutationDeleteProjectArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteTicketArgs = {
  input: DeleteTicketInput;
};


export type MutationLinkRepositoriesArgs = {
  input: LinkRepositoriesInput;
};


export type MutationLinkScanRemoteArgs = {
  input: LinkScanRemoteInput;
};


export type MutationPutSetupCompletedArgs = {
  input: PutSetupCompletedInput;
};


export type MutationScanFileOrScenarioVscodeArgs = {
  input: ScanFileOrScenarioVscodeInput;
};


export type MutationScanFromOrcaArgs = {
  input: ScanFromOrcaInput;
};


export type MutationScanOnPullRequestArgs = {
  input: ScanOnPullRequestInput;
};


export type MutationScanOnScheduleArgs = {
  input: ScanOnScheduleInput;
};


export type MutationScanRemoteArgs = {
  input: ScanRemoteInput;
};


export type MutationSendSupportRequestArgs = {
  input: SendSupportRequestInput;
};


export type MutationSetScanTargetArgs = {
  input: SetScanTargetInput;
};


export type MutationUpdatePullRequestStatusArgs = {
  providerName: ProviderName;
  pullRequestNumber: Scalars['String']['input'];
  pullRequestStatus: PullRequestStatus;
  repositoryId: Scalars['String']['input'];
};

export type Node = {
  __typename?: 'Node';
  id: Scalars['ID']['output'];
  label: Scalars['String']['output'];
};

export type OsMetaDataInput = {
  machineName: Scalars['String']['input'];
  privateIp: Scalars['String']['input'];
  publicIp: Scalars['String']['input'];
  userName: Scalars['String']['input'];
};

export type OntologicalSubgraph = {
  __typename?: 'OntologicalSubgraph';
  edges: Array<Edge>;
  nodes: Array<Node>;
};

export type OrcaAlert = {
  __typename?: 'OrcaAlert';
  actionResults: ActionResultPage;
  assetName: Scalars['String']['output'];
  assetType?: Maybe<Scalars['String']['output']>;
  cloudResource?: Maybe<CloudResource>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastScanRequest?: Maybe<ScanRequest>;
  orcaScore: Scalars['Float']['output'];
  scanTarget?: Maybe<ScanTarget>;
  status: Scalars['String']['output'];
  title: Scalars['String']['output'];
};


export type OrcaAlertActionResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type OrcaAlertResponse = GombocError | OrcaAlert;

export type OrcaAlertScanPageResponse = GombocError | ScanPage;

export type OrcaAlertsPage = {
  __typename?: 'OrcaAlertsPage';
  alerts: Array<OrcaAlert>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  totalItems: Scalars['Int']['output'];
  totalPages: Scalars['Int']['output'];
};

/** Represents an integration to a CSPM provider */
export type OrcaIntegration = {
  __typename?: 'OrcaIntegration';
  /** Alerts for a given CSPM integration */
  alertsPage: OrcaAlertsPage;
  apiKey: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  integrationParty: IntegrationParty;
  name: Scalars['String']['output'];
};


/** Represents an integration to a CSPM provider */
export type OrcaIntegrationAlertsPageArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  perPage?: InputMaybe<Scalars['Int']['input']>;
};

export type OrcaIntegrationResponse = GombocError | OrcaIntegration;

export enum OrcaRegion {
  Australia = 'Australia',
  Brazil = 'Brazil',
  Europe = 'Europe',
  India = 'India',
  Israel = 'Israel',
  Us = 'US'
}

/** A customer organization as represented in the system */
export type Organization = {
  __typename?: 'Organization';
  /** Returns one SCM integration by its ID, or an error if not found */
  gitProvider: GitProviderResponse;
  /** Returns SCM integrations for this organization */
  gitProviders: Array<GitProvider>;
  /** Returns true if the organization has at least one SCM Integration */
  hasGitProviders: Scalars['Boolean']['output'];
  /** Returns true if the organization has at least one Linked Repository */
  hasLinks: Scalars['Boolean']['output'];
  /** Returns true if the organization has at least one Policy Statement */
  hasPolicy: Scalars['Boolean']['output'];
  /** Returns true if the organization has received at least one Scan Request */
  hasScanRequests: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /** Returns CSPM integrations for this organization */
  orcaIntegration?: Maybe<OrcaIntegration>;
  /** Returns the security policy for this organization */
  policy: Policy;
  /** Return one Gomboc project by its slug, or an error if not found */
  project: ProjectResponse;
  /** Returns all Gomboc projects for this organization */
  projects: Array<Project>;
  /** Returns recent scan requests for this organization */
  scans: Array<ScanRequestResponse>;
};


/** A customer organization as represented in the system */
export type OrganizationGitProviderArgs = {
  id: Scalars['ID']['input'];
};


/** A customer organization as represented in the system */
export type OrganizationProjectArgs = {
  slug: Scalars['String']['input'];
};


/** A customer organization as represented in the system */
export type OrganizationScansArgs = {
  before?: InputMaybe<Scalars['String']['input']>;
};

export type OrganizationResponse = GombocError | Organization;

export type Policy = {
  __typename?: 'Policy';
  statements: Array<SetPolicyStatement>;
};

export type PolicyObservation = {
  __typename?: 'PolicyObservation';
  /** The parent scan result */
  actionResult: ActionResult;
  /** The policy statement capability ID involved */
  capabilityId: Scalars['ID']['output'];
  /** The policy statement capability Title involved */
  capabilityTitle: Scalars['String']['output'];
  /** The IaC resource that was observed */
  cloudResource: CloudResource;
  /** The framework control description, if one */
  description: Scalars['String']['output'];
  disposition: Disposition;
  /** A link to the IaC resource documentation if available */
  documentationUrl?: Maybe<Scalars['String']['output']>;
  /** The filepath of the IaC resource that was observed */
  filepath: Scalars['String']['output'];
  /** The framework name the policy statement relates to, if one */
  framework: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** The framework control identifier, if one */
  identifier: Scalars['String']['output'];
  /** The file line number of the IaC resource that was observed */
  lineNumber: Scalars['Int']['output'];
  logicalResource: LogicalResource;
  orcaAlertsPage: OrcaAlertsPage;
  /** The policy statement predicate */
  predicate: Scalars['String']['output'];
  /** The name of the IaC resource instance that was observed */
  resourceName: Scalars['String']['output'];
  /**
   * The type of the IaC resource that was observed
   * @deprecated No longer supported
   */
  resourceType: Scalars['String']['output'];
  /** @deprecated No longer in use */
  source: Scalars['String']['output'];
};


export type PolicyObservationOrcaAlertsPageArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  perPage?: InputMaybe<Scalars['Int']['input']>;
};

export type PolicyObservationResponse = GombocError | PolicyObservation;

export type PolicyObservationsPage = {
  __typename?: 'PolicyObservationsPage';
  page: Scalars['Int']['output'];
  results: Array<PolicyObservation>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type PolicyStatement = {
  __typename?: 'PolicyStatement';
  description?: Maybe<Scalars['String']['output']>;
  framework?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  identifier?: Maybe<Scalars['String']['output']>;
  payload: PolicyStatementPayloadType;
};

export type PolicyStatementPayload = PolicyStatementPayloadMustImplementType;

export type PolicyStatementPayloadMustImplement = {
  __typename?: 'PolicyStatementPayloadMustImplement';
  capability: Capability;
};

export type PolicyStatementPayloadMustImplementType = {
  __typename?: 'PolicyStatementPayloadMustImplementType';
  capability: Capability;
};

export type PolicyStatementPayloadType = PolicyStatementPayloadMustImplement;

export type Project = {
  __typename?: 'Project';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who created the project */
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Returns the most recent Scan Request related to this project */
  lastScanRequest?: Maybe<ScanRequest>;
  /**
   * Returns a single linked repository by its ID, or an error if not found
   * @deprecated Use Query.link(id: ID!)
   */
  link: LinkResponse;
  /** Returns a single linked repository by its slug, or an error if not found */
  linkBySlug: LinkResponse;
  /** Returns the number of linked repositories */
  linkCount: Scalars['Int']['output'];
  /** @deprecated No longer supported */
  links: Array<Link>;
  /** Returns a page of repositories linked to this project */
  linksPage: LinksPage;
  /** Returns the name of the project */
  name: Scalars['String']['output'];
  /** @deprecated No longer supported */
  policy: Policy;
  /** Returns a URL-friendly slug for the project */
  slug: Scalars['String']['output'];
};


export type ProjectLinkArgs = {
  linkId: Scalars['ID']['input'];
};


export type ProjectLinkBySlugArgs = {
  slug: Scalars['ID']['input'];
};


export type ProjectLinksPageArgs = {
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  startKey?: InputMaybe<Scalars['ID']['input']>;
};

export type ProjectResponse = GombocError | Project;

export enum ProviderName {
  Azdo = 'AZDO',
  Bitbucket = 'BITBUCKET',
  Github = 'GITHUB',
  Gitlab = 'GITLAB'
}

export type PullRequest = {
  __typename?: 'PullRequest';
  externalUrl: Scalars['String']['output'];
  identifier: Scalars['String']['output'];
  providerName: ProviderName;
  status: PullRequestStatus;
};

export enum PullRequestStatus {
  Closed = 'CLOSED',
  Expected = 'EXPECTED',
  Merged = 'MERGED',
  Open = 'OPEN'
}

export type PutSetupCompletedInput = {
  setupCompleted: Scalars['Boolean']['input'];
};

export type Query = {
  __typename?: 'Query';
  /** Returns a single Scan Result by its ID, or an error if not found */
  actionResult: ActionResultResponse;
  /** @deprecated No longer supported */
  capabilities: Array<Capability>;
  /** Returns a single linked repository by its ID, or an error if not found */
  link: LinkResponse;
  orcaAlert: OrcaAlertResponse;
  /** Returns the active organization for the current user */
  organization: OrganizationResponse;
  /** Returns a single policy observation by its ID, or an error if not found */
  policyObservation: PolicyObservationResponse;
  /** Returns a single Scan Log by its ID, or an error if not found */
  scan: ScanResponse;
  /** *Internal use only* */
  scanBranch: ScanBranchResponse;
  /** *Internal use only* */
  scanDirectory: ScanDirectoryResponse;
  /** Returns a single Scan Request by its ID, or an error if not found */
  scanRequest: ScanRequestResponse;
  /** Returns a few posible scan targets for a cloud resource */
  searchScanTargets: Array<ScanTarget>;
  /** @deprecated No longer supported */
  securityFramework?: Maybe<SecurityFramework>;
  /** @deprecated No longer supported */
  securityFrameworks: Array<SecurityFramework>;
  /** Get a single comment that relates to a number of policy observations */
  unifiedObservationsComment: Scalars['String']['output'];
  verifyRemediation: Scalars['Boolean']['output'];
};


export type QueryActionResultArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLinkArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOrcaAlertArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPolicyObservationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScanArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScanBranchArgs = {
  scanRequestId: Scalars['ID']['input'];
};


export type QueryScanDirectoryArgs = {
  scanRequestId: Scalars['ID']['input'];
};


export type QueryScanRequestArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySearchScanTargetsArgs = {
  cloudResourceId: Scalars['ID']['input'];
};


export type QuerySecurityFrameworkArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUnifiedObservationsCommentArgs = {
  policyObservationIds: Array<Scalars['ID']['input']>;
};


export type QueryVerifyRemediationArgs = {
  alertId: Scalars['ID']['input'];
};

export type Repository = {
  __typename?: 'Repository';
  /** The list of branches in the repository */
  branches: Array<RepositoryBranch>;
  /** The list of directories in the repository */
  directoryNames: Array<Scalars['String']['output']>;
  /** A URL to the SCM provider repository page */
  externalUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /** The name of the SCM provider owner */
  ownerName: Scalars['String']['output'];
};


export type RepositoryBranchesArgs = {
  isProtected?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};


export type RepositoryDirectoryNamesArgs = {
  branch?: InputMaybe<Scalars['String']['input']>;
};

export type RepositoryBranch = {
  __typename?: 'RepositoryBranch';
  /** Returns additional info on the branch (e.g.  "main", "protected"...) */
  label?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

export enum RepositorySelection {
  All = 'ALL',
  Linked = 'LINKED',
  Unlinked = 'UNLINKED'
}

/** Places from where scan requests can originate */
export enum RequestOrigin {
  OrcaSecurity = 'ORCA_SECURITY',
  Portal = 'PORTAL',
  Workflow = 'WORKFLOW'
}

export type ResultingPolicy = {
  mustImplement: Array<InheritedPolicyStatementPayloadMustImplementType>;
};

export type Scan = {
  __typename?: 'Scan';
  actionResult?: Maybe<ActionResult>;
  children: ScanPage;
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  metadata: Scalars['String']['output'];
  parent?: Maybe<Scan>;
  scanRequestId: Scalars['ID']['output'];
  scanScope: Scalars['String']['output'];
};


export type ScanChildrenArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanBranch = {
  __typename?: 'ScanBranch';
  children: Array<ScanScenarioResponse>;
  childrenCompleted: Scalars['Int']['output'];
  childrenError: Scalars['Int']['output'];
  childrenExpected: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  parent: ScanRepository;
};

export type ScanBranchResponse = FailedScan | GombocError | ScanBranch;

export type ScanDirectory = {
  __typename?: 'ScanDirectory';
  children: Array<ScanScenarioResponse>;
  childrenCompleted: Scalars['Int']['output'];
  childrenError: Scalars['Int']['output'];
  childrenExpected: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  parent: ScanBranch;
};

export type ScanDirectoryResponse = FailedScan | GombocError | ScanDirectory;

export type ScanFileOrScenarioVscode = {
  __typename?: 'ScanFileOrScenarioVscode';
  results: Array<ScanFileOrScenarioVscodeComments>;
};

export type ScanFileOrScenarioVscodeComments = {
  __typename?: 'ScanFileOrScenarioVscodeComments';
  /** We should include a category and description of each fix. */
  category?: Maybe<Scalars['String']['output']>;
  description: Scalars['String']['output'];
  /** We might want to add this later so I'm including it */
  documentationLink?: Maybe<Scalars['String']['output']>;
  fileName: Scalars['String']['output'];
  fixes: Array<ScanFileOrScenarioVscodeFixes>;
  iacTool: InfrastructureTool;
};

export type ScanFileOrScenarioVscodeFixes = {
  __typename?: 'ScanFileOrScenarioVscodeFixes';
  currentValue: Scalars['String']['output'];
  issueType: Scalars['String']['output'];
  lineNumber: Scalars['Int']['output'];
  newValue: Scalars['String']['output'];
};

export type ScanFileOrScenarioVscodeInput = {
  fileContents: Array<IacScanContentInput>;
  iacTool: InfrastructureTool;
  metaData: MetaDataInput;
};

export type ScanFileOrScenarioVscodeOutput = GombocError | ScanFileOrScenarioVscode;

export type ScanFromOrcaInput = {
  /** The effect -- defaults to 'SubmitForReview' */
  effect?: InputMaybe<Effect>;
  /** The Orca alert ID -- it must have a scan target or this will fail */
  orcaAlertId: Scalars['ID']['input'];
  /** The target for the scan */
  scanTarget: ScanTargetInput;
};

export type ScanOnPullRequestInput = {
  effect: Effect;
  iacTools: Array<InfrastructureTool>;
  pullRequestIdentifier: Scalars['String']['input'];
  scenarioPaths: Array<Scalars['String']['input']>;
};

export type ScanOnScheduleInput = {
  directory: Scalars['String']['input'];
  effect: Effect;
  iacTools: Array<InfrastructureTool>;
  recurse: Scalars['Boolean']['input'];
};

export type ScanPage = {
  __typename?: 'ScanPage';
  page: Scalars['Int']['output'];
  results: Array<Scan>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanRemoteInput = {
  effect: Effect;
  iacTool: InfrastructureTool;
  pullRequestIdentifier?: InputMaybe<Scalars['String']['input']>;
  workingDirectories: Array<Scalars['String']['input']>;
};

export type ScanRemoteTfHcl2Input = {
  effect: Effect;
  workingDirectories: Array<Scalars['String']['input']>;
};

export type ScanRepository = {
  __typename?: 'ScanRepository';
  children: Array<ScanBranchResponse>;
  childrenCompleted: Scalars['Int']['output'];
  childrenError: Scalars['Int']['output'];
  childrenExpected: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  parent: ScanRequest;
};

export type ScanRepositoryResponse = FailedScan | GombocError | ScanRepository;

export type ScanRequest = {
  __typename?: 'ScanRequest';
  actionResults: ActionResultPage;
  /** @deprecated No longer supported */
  children: Array<ScanRepositoryResponse>;
  childrenCompleted: Scalars['Int']['output'];
  childrenError: Scalars['Int']['output'];
  childrenExpected: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  effect: Effect;
  /** List of errors encountered during the scan */
  errors: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Orca Security Alert ID -- if there is one */
  orcaAlertId?: Maybe<Scalars['ID']['output']>;
  /** The Pull Request that triggered this scan, if there is one */
  pullRequest?: Maybe<PullRequest>;
  requestOrigin: RequestOrigin;
  scans: ScanPage;
};


export type ScanRequestActionResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


export type ScanRequestScansArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanRequestResponse = FailedScan | GombocError | ScanRequest;

export type ScanRequestResponseType = {
  __typename?: 'ScanRequestResponseType';
  errors: Array<Maybe<GombocError>>;
  scanRequestId: Scalars['ID']['output'];
};

export type ScanResponse = FailedScan | GombocError | Scan;

export type ScanScenario = {
  __typename?: 'ScanScenario';
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  parent: ScanBranch;
  result?: Maybe<ActionResult>;
};

export type ScanScenarioResponse = FailedScan | GombocError | ScanScenario;

export type ScanTarget = {
  __typename?: 'ScanTarget';
  /** The repository branch */
  branch: Scalars['String']['output'];
  /** Maps to a repository */
  link?: Maybe<Link>;
  /** The scenario path: a directory or a filepath */
  path: Scalars['String']['output'];
};

export type ScanTargetInput = {
  /** The repository branch */
  branch: Scalars['String']['input'];
  /** Maps to a repository */
  linkId: Scalars['ID']['input'];
  /** The scenario path: a directory or a filepath */
  path: Scalars['String']['input'];
};

export type SecurityFramework = {
  __typename?: 'SecurityFramework';
  controls: Array<SecurityFrameworkControl>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  tag?: Maybe<Scalars['String']['output']>;
};

export type SecurityFrameworkControl = {
  __typename?: 'SecurityFrameworkControl';
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  statements: Array<PolicyStatement>;
};

export type SendSupportRequestInput = {
  location: Scalars['String']['input'];
  message: Scalars['String']['input'];
};

export type SetPolicyStatement = {
  __typename?: 'SetPolicyStatement';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who added the policy statement */
  createdBy: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  framework?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  identifier?: Maybe<Scalars['String']['output']>;
  payload: PolicyStatementPayload;
};

export type SetScanTargetInput = {
  /** The alert to be updated */
  orcaAlertId: Scalars['ID']['input'];
  /** The scan target to be set */
  scanTarget: ScanTargetInput;
};

export enum StatementSource {
  Organization = 'ORGANIZATION',
  Project = 'PROJECT'
}

export type Success = {
  __typename?: 'Success';
  message: Scalars['String']['output'];
};

export type Ticket = {
  __typename?: 'Ticket';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who linked the ticket */
  createdBy: Scalars['String']['output'];
  /** A link to the external ticketing system */
  externalUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type TicketPage = {
  __typename?: 'TicketPage';
  page: Scalars['Int']['output'];
  results: Array<Ticket>;
  totalCount: Scalars['Int']['output'];
};

/** Represents a repository that was either deleted or is unreachable due to service or integration issues */
export type UnreachableRepository = {
  __typename?: 'UnreachableRepository';
  id: Scalars['ID']['output'];
};

/** A customer user with access to the system */
export type User = {
  __typename?: 'User';
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** All the organizations the user is a member of (usually just one) */
  organizations: Array<Organization>;
  pictureUrl: Scalars['String']['output'];
  username: Scalars['String']['output'];
};

export type TestOrganizationQueryVariables = Exact<{ [key: string]: never; }>;


export type TestOrganizationQuery = { __typename?: 'Query', organization: { __typename?: 'GombocError' } | { __typename?: 'Organization', id: string } };

export type GetSecurityFrameworksQueryVariables = Exact<{ [key: string]: never; }>;


export type GetSecurityFrameworksQuery = { __typename?: 'Query', organization: { __typename?: 'GombocError' } | { __typename?: 'Organization', id: string, name: string, policy: { __typename?: 'Policy', statements: Array<{ __typename?: 'SetPolicyStatement', id: string, framework?: string | null, identifier?: string | null, description?: string | null, createdBy: string, createdAt: string, payload: { __typename?: 'PolicyStatementPayloadMustImplementType', capability: { __typename?: 'Capability', id: string, title: string } } }> } } };

export type ScanFileOrScenarioVscodeMutationVariables = Exact<{
  input: ScanFileOrScenarioVscodeInput;
}>;


export type ScanFileOrScenarioVscodeMutation = { __typename?: 'Mutation', scanFileOrScenarioVscode: { __typename?: 'GombocError', message: string, code?: GombocErrorCode | null } | { __typename?: 'ScanFileOrScenarioVscode', results: Array<{ __typename?: 'ScanFileOrScenarioVscodeComments', category?: string | null, description: string, documentationLink?: string | null, iacTool: InfrastructureTool, fileName: string, fixes: Array<{ __typename?: 'ScanFileOrScenarioVscodeFixes', currentValue: string, newValue: string, lineNumber: number, issueType: string }> }> } };


export const TestOrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"testOrganization"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Organization"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<TestOrganizationQuery, TestOrganizationQueryVariables>;
export const GetSecurityFrameworksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getSecurityFrameworks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Organization"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"policy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"statements"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"payload"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PolicyStatementPayloadMustImplementType"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"capability"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"framework"}},{"kind":"Field","name":{"kind":"Name","value":"identifier"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetSecurityFrameworksQuery, GetSecurityFrameworksQueryVariables>;
export const ScanFileOrScenarioVscodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ScanFileOrScenarioVscode"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ScanFileOrScenarioVscodeInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"scanFileOrScenarioVscode"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ScanFileOrScenarioVscode"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"results"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"category"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"documentationLink"}},{"kind":"Field","name":{"kind":"Name","value":"iacTool"}},{"kind":"Field","name":{"kind":"Name","value":"fileName"}},{"kind":"Field","name":{"kind":"Name","value":"fixes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"currentValue"}},{"kind":"Field","name":{"kind":"Name","value":"newValue"}},{"kind":"Field","name":{"kind":"Name","value":"lineNumber"}},{"kind":"Field","name":{"kind":"Name","value":"issueType"}}]}}]}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GombocError"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"code"}}]}}]}}]}}]} as unknown as DocumentNode<ScanFileOrScenarioVscodeMutation, ScanFileOrScenarioVscodeMutationVariables>;