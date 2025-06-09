/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  JSON: { input: any; output: any };
};

export type AssetInstanceLocation = {
  __typename: 'AssetInstanceLocation';
  /** The scenario path: a directory or a filepath */
  branch: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** maps to a repository */
  link: Link;
  /** the repository branch */
  path: Scalars['String']['output'];
};

export type AssetInstanceLocationResponse = AssetInstanceLocation | GombocError;

export type AssetType = {
  __typename: 'AssetType';
  /** The name of the cloud provider (AWS, GCP, Azure) */
  cloudProviderName: Scalars['String']['output'];
  /** This is the internal mapping of what a cloud resource is, originally was in cfn */
  gombocCloudResourceId: Scalars['ID']['output'];
  /** This is the type of the resource as defined by the observation provider */
  providerType: Scalars['String']['output'];
};

export enum BitBucketApiVersion {
  V2_0 = 'V2_0',
}

export type BulkAllLinkScanRemoteInput = {
  iacTools: Array<InfrastructureTool>;
};

export type BulkLinkScanRemoteInput = {
  iacTools: Array<InfrastructureTool>;
  linkIds: Array<Scalars['ID']['input']>;
};

export type Capability = {
  __typename: 'Capability';
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type CfnAttribute = {
  __typename: 'CfnAttribute';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
};

export type CfnProperty = {
  __typename: 'CfnProperty';
  customRules: Array<CustomRule>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  slug: Scalars['String']['output'];
  subproperties: Array<CfnSubProperty>;
};

export type CfnResource = {
  __typename: 'CfnResource';
  attributes: Array<CfnAttribute>;
  codeResource?: Maybe<CodeResource>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  properties: Array<CfnProperty>;
};

export type CfnResourcePage = {
  __typename: 'CfnResourcePage';
  page: Scalars['Int']['output'];
  results: Array<CfnResource>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type CfnResourcePageInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type CfnSubProperty = {
  __typename: 'CfnSubProperty';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  properties: Array<CfnProperty>;
};

export type CloudResource = {
  __typename: 'CloudResource';
  documentationUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  provider: CloudResourceProvider;
  title: Scalars['String']['output'];
};

export enum CloudResourceProvider {
  Aws = 'AWS',
  Azure = 'AZURE',
  Gcp = 'GCP',
}

export type CodeObservation = {
  __typename: 'CodeObservation';
  codeResourceInstance: CodeResourceInstance;
  disposition: Disposition;
};

export type CodePosition = {
  __typename: 'CodePosition';
  column: Scalars['Int']['output'];
  line: Scalars['Int']['output'];
};

export type CodeResource = {
  __typename: 'CodeResource';
  cloudResource?: Maybe<CloudResource>;
  configOptions: ConfigOptionPage;
  documentationUrl?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  infrastructureTool: InfrastructureTool;
};

export type CodeResourceConfigOptionsArgs = {
  input: PageInput;
};

export type CodeResourceInstance = {
  __typename: 'CodeResourceInstance';
  codeResource: CodeResource;
  filepath: Scalars['String']['output'];
  line: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type CodeResourcePage = {
  __typename: 'CodeResourcePage';
  page: Scalars['Int']['output'];
  results: Array<CodeResource>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ConfigOption = {
  __typename: 'ConfigOption';
  capability: Capability;
  /** @deprecated This is moved inside of the CodeResource object. DEV-2330 */
  cloudResource?: Maybe<CloudResource>;
  codeResource: CodeResource;
  id: Scalars['ID']['output'];
  ontologicalSubgraph: OntologicalSubgraph;
  /** @deprecated this is equivalent to the nodeLabel:codeResourceId */
  resourceKey: Scalars['String']['output'];
};

export type ConfigOptionPage = {
  __typename: 'ConfigOptionPage';
  page: Scalars['Int']['output'];
  results: Array<ConfigOption>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type CreateAzdoIntegrationInput = {
  organization: Scalars['String']['input'];
  personalAccessToken: Scalars['String']['input'];
};

export type CreateAzdoIntegrationOutput = GombocError | ScmIntegration;

export type CreateBitBucketIntegrationInput = {
  accessToken: Scalars['String']['input'];
  apiVersion: BitBucketApiVersion;
  gombocAccessToken: Scalars['String']['input'];
  workspaceSlug: Scalars['String']['input'];
};

export type CreateBitBucketIntegrationOutput = GombocError | ScmIntegration;

export type CreateCspmIntegrationOutput =
  | CreateCspmIntegrationResponse
  | GombocError;

export type CreateCspmIntegrationResponse = {
  __typename: 'CreateCspmIntegrationResponse';
  apiKey: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  integration: CspmIntegration;
};

export type CreateCustomIntegrationInput = {
  cloudResourceProviderName: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['JSON']['input']>;
  name: Scalars['String']['input'];
  notificationPassthrough?: InputMaybe<NotificationPassthrough>;
  observationProviderName: Scalars['String']['input'];
};

export type CreateGitHubIntegrationInput = {
  app?: InputMaybe<GitHubApp>;
  code: Scalars['String']['input'];
  installationId: Scalars['ID']['input'];
};

export type CreateGitHubIntegrationResponse = GombocError | ScmIntegration;

export type CreateGitLabIntegrationInput = {
  apiUrl: Scalars['String']['input'];
  apiVersion: GitLabApiVersion;
  groupAccessToken: Scalars['String']['input'];
};

export type CreateGitLabIntegrationOutput = GombocError | ScmIntegration;

export type CreateOrcaIntegrationInput = {
  gombocToken: Scalars['String']['input'];
  name: Scalars['String']['input'];
  orcaRegion: OrcaRegion;
  orcaToken: Scalars['String']['input'];
};

export type CreateProjectResponse = GombocError | Project;

export type CreateScalarCustomRuleInput = {
  comment: Scalars['String']['input'];
  description: Scalars['String']['input'];
  targetName: Scalars['String']['input'];
  targetType: Scalars['String']['input'];
  title: Scalars['String']['input'];
  value: Scalars['String']['input'];
  valueType: Scalars['String']['input'];
};

export type CreateTicketInput = {
  externalUrl: Scalars['String']['input'];
  scanResultId: Scalars['ID']['input'];
};

export type CreateTicketOutput = GombocError | Ticket;

export type CreateWizIntegrationInput = {
  gombocToken: Scalars['String']['input'];
  name: Scalars['String']['input'];
  wizApiUrl: Scalars['String']['input'];
  wizAuthUrl: Scalars['String']['input'];
  wizClientId: Scalars['ID']['input'];
  wizClientSecret: Scalars['String']['input'];
};

export type CspmIntegration = {
  __typename: 'CspmIntegration';
  /** If applicable, this will be the associated cloud provider (AWS, GCP) */
  cloudResourceProviderName?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** The api token given to the user upon creating an integration that they will put in their webhook */
  integrationToken: Scalars['String']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  name: Scalars['String']['output'];
  /** this will be "ORCA" if it's orca, WIZ if wiz, and anything else means it's custom */
  observationProviderName: IntegrationType;
  organizationId: Scalars['String']['output'];
};

export type CspmObservation = {
  __typename: 'CspmObservation';
  /** The cloud account id if it exists, otherwise an empty string */
  cloudAccountId: Scalars['String']['output'];
  /** The specific unique id of the cloud asset i.e 'vm_215151194724_i-09b8a8f38e1ccebff"' */
  cloudAssetId: Scalars['String']['output'];
  /** The name of the associated cloud asset type */
  cloudAssetTypeName: Scalars['String']['output'];
  /** The name of the cloud provider (AWS, GCP, Azure) */
  cloudProviderName: Scalars['String']['output'];
  /** The definition of the resource as told by us */
  cloudResource?: Maybe<AssetType>;
  /** location of the asset instance if there is one, and it can be reached */
  codeResource?: Maybe<AssetInstanceLocation>;
  id: Scalars['ID']['output'];
  /** Name of the cspm provider issuing the observation (WIZ, ORCA, ...) */
  observationProviderName: IntegrationType;
  /** Groups all the source types into one object (name, description, id) */
  observationSource: CspmObservationSource;
  /** The type of security alert (defaults to "unknown"). */
  securityType: Scalars['String']['output'];
  /** The severity of the alert (defaults to "info"). */
  severity: Severity;
  timestamp: Scalars['String']['output'];
};

export type CspmObservationOutput = CspmObservation | GombocError;

export type CspmObservationSource = {
  __typename: 'CspmObservationSource';
  /** A short HTML‑encoded description of the finding. */
  description?: Maybe<Scalars['String']['output']>;
  /** The name or unique ID of the alert, shown to the user. */
  id: Scalars['ID']['output'];
  /** A short name to differentiate the finding */
  name: Scalars['String']['output'];
  /** The direct URL to the alert. */
  url?: Maybe<Scalars['String']['output']>;
};

export type CspmObservationsInput = {
  canBeScanned?: InputMaybe<Scalars['Boolean']['input']>;
  cloudProviderName?: InputMaybe<Scalars['String']['input']>;
  observationProviderName?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  severity?: InputMaybe<Severity>;
  size?: InputMaybe<Scalars['Int']['input']>;
  sourceName?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type CspmObservationsPage = {
  __typename: 'CspmObservationsPage';
  page: Scalars['Int']['output'];
  results: Array<CspmObservation>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

/** Custom policy, stored in remediations. This will be expanded with more types as we start to support them */
export type CustomRule = ScalarRule;

export type CustomRulesInput = {
  order?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  resourceType?: InputMaybe<Scalars['String']['input']>;
  ruleType?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type CustomRulesPage = {
  __typename: 'CustomRulesPage';
  page: Scalars['Int']['output'];
  results: Array<CustomRule>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type CustomRulesResponse = CustomRulesPage | GombocError;

export type DeleteCustomRulesInput = {
  ids: Array<Scalars['ID']['input']>;
};

export type DeleteScmIntegrationInput = {
  integrationId: Scalars['ID']['input'];
};

export type DeleteTicketInput = {
  ticketId: Scalars['ID']['input'];
};

export type DiscoverIacRepositoriesInput = {
  integrationId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};

export type DiscoverIacRepositoriesOuput = GombocError | WorkflowResponse;

export enum Disposition {
  AlreadyCompliant = 'ALREADY_COMPLIANT',
  AutoRemediated = 'AUTO_REMEDIATED',
  CannotRemediate = 'CANNOT_REMEDIATE',
  InsufficientInfoToRemediate = 'INSUFFICIENT_INFO_TO_REMEDIATE',
  NotApplicable = 'NOT_APPLICABLE',
}

export type Edge = {
  __typename: 'Edge';
  label: Scalars['String']['output'];
  source: Node;
  target: Node;
  value?: Maybe<Scalars['String']['output']>;
};

export enum Effect {
  Preview = 'Preview',
  SubmitForReview = 'SubmitForReview',
}

export type FailedScan = {
  __typename: 'FailedScan';
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  message: Scalars['String']['output'];
};

export enum FixType {
  Add = 'ADD',
  Delete = 'DELETE',
  Update = 'UPDATE',
}

export enum GitHubApp {
  Community = 'COMMUNITY',
  Enterprise = 'ENTERPRISE',
}

export enum GitLabApiVersion {
  V4 = 'V4',
}

export type GitMetaDataInput = {
  defaultName?: InputMaybe<Scalars['String']['input']>;
  headName?: InputMaybe<Scalars['String']['input']>;
  lastMergeCommit?: InputMaybe<Scalars['String']['input']>;
  remote?: InputMaybe<Scalars['String']['input']>;
};

export type GombocError = {
  __typename: 'GombocError';
  code?: Maybe<GombocErrorCode>;
  message: Scalars['String']['output'];
};

export enum GombocErrorCode {
  Generic = 'GENERIC',
  InvalidArgument = 'INVALID_ARGUMENT',
  NotFound = 'NOT_FOUND',
  NotImplemented = 'NOT_IMPLEMENTED',
  Unauthorized = 'UNAUTHORIZED',
}

export type IacScanContent = {
  fileContent: Scalars['String']['input'];
  filePath: Scalars['String']['input'];
};

export type IndividualFixesInput = {
  fileContents: Array<IacScanContent>;
  iacTool: InfrastructureTool;
};

export type IndividualFixesResponse = GombocError | IndividualFixesSuccess;

export type IndividualFixesSuccess = {
  __typename: 'IndividualFixesSuccess';
  remediations: Array<IndividualRemediation>;
};

export type IndividualRemediation = {
  __typename: 'IndividualRemediation';
  benchmarkRecommendation: SecurityBenchmarkRecommendation;
  codeObservation: CodeObservation;
  fixes: Array<RemediationFix>;
};

export enum InfrastructureTool {
  Cloudformation = 'CLOUDFORMATION',
  Terraform = 'TERRAFORM',
}

export enum IntegrationType {
  Custom = 'CUSTOM',
  Customgomboc = 'CUSTOMGOMBOC',
  Orca = 'ORCA',
  Wiz = 'WIZ',
}

export type LineFix = {
  __typename: 'LineFix';
  fixType: FixType;
  issueType: Scalars['String']['output'];
  lineOffset: Scalars['Int']['output'];
  newValue: Scalars['String']['output'];
  oldValue: Scalars['String']['output'];
  position: Position;
};

export type Link = {
  __typename: 'Link';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who linked the repository */
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Return the latest Scan Request related to this linked repository */
  lastScanRequest?: Maybe<ScanRequest>;
  /** Returns the project the repository is linked to */
  project: Project;
  /** Open Pull Requests from remediations */
  pullRequests: PullRequestPage;
  /** Returns a page of Scan Results related to this linked repository */
  scanResults: ScanResultPage;
  /** Returns the repository itself */
  scmRepository: LinkedScmRepository;
  /** Returns the name of the SCM Provider */
  scmType: ScmType;
  /** Returns a URL-friendly slug for the linked repository */
  slug: Scalars['ID']['output'];
};

export type LinkPullRequestsArgs = {
  input: LinkPullRequestsInput;
};

export type LinkScanResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type LinkPullRequestsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type LinkRepositoriesInput = {
  integrations: Array<LinkRepositoriesIntegrationInput>;
  projectId: Scalars['ID']['input'];
};

export type LinkRepositoriesIntegrationInput = {
  scmIntegrationId: Scalars['ID']['input'];
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

export type LinkedScmRepository = ScmRepository | UnreachableRepository;

export type LinksPage = {
  __typename: 'LinksPage';
  /** Use this to get the next page */
  lastKey?: Maybe<Scalars['ID']['output']>;
  links: Array<Link>;
};

export type LogicalResource = {
  __typename: 'LogicalResource';
  /** @deprecated This has been relocated into codeResource. DEV-2330 */
  cloudResource?: Maybe<CloudResource>;
  codeResource?: Maybe<CodeResource>;
  filepath: Scalars['String']['output'];
  line: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type MetaDataInput = {
  git?: InputMaybe<GitMetaDataInput>;
  os?: InputMaybe<OsMetaDataInput>;
};

export type Mutation = {
  __typename: 'Mutation';
  /**
   * Adopt all security benchmarkversions and all of their recommendations -> on initial creation of account
   * during onboarding wizard
   */
  adoptAllSecurityBenchmarkRecommendations?: Maybe<GombocError>;
  /** Scans all linked repositories */
  bulkAllLinkScanRemote: ScanRequestResponseType;
  /** Call scans on a number of linked repository with default settings */
  bulkLinkScanRemote: ScanRequestResponseType;
  createAzdoIntegration: CreateAzdoIntegrationOutput;
  createBitBucketIntegration: CreateBitBucketIntegrationOutput;
  createCspmCustomIntegration: CreateCspmIntegrationOutput;
  /** Follow this pattern for adding more cspms, we want them to all return the same type but intake different ones */
  createCspmOrcaIntegration: CreateCspmIntegrationOutput;
  createCspmWizIntegration: CreateCspmIntegrationOutput;
  createGitHubIntegration: CreateGitHubIntegrationResponse;
  createGitLabIntegration: CreateGitLabIntegrationOutput;
  /** Create a new Gomboc project */
  createProject: CreateProjectResponse;
  /** Create a custom rule for an account */
  createScalarCustomRule?: Maybe<GombocError>;
  /** Link a Ticket to a Scan Result */
  createTicket: CreateTicketOutput;
  /** deletes any of the cspm integrations based on the id */
  deleteCspmIntegration?: Maybe<GombocError>;
  /** deletes a batch of custom rules */
  deleteCustomRules?: Maybe<GombocError>;
  /** Unlink a repository from a project */
  deleteLink?: Maybe<GombocError>;
  /** Delete a Gomboc project */
  deleteProject?: Maybe<GombocError>;
  /** Remove an SCM integration */
  deleteScmIntegration?: Maybe<GombocError>;
  /** Unlink a Ticket from a Scan Result */
  deleteTicket?: Maybe<GombocError>;
  /** Trigger a scan for IAC repositories for a given integration */
  discoverIacRepositories?: Maybe<DiscoverIacRepositoriesOuput>;
  /** Link repositories to a project */
  linkRepositories: Array<LinkRepositoryResponse>;
  /** Call a scan on a linked repository */
  linkScanRemote: ScanRequestResponseType;
  /** *Internal use only* */
  onGitHubMetaEvent?: Maybe<GombocError>;
  /** *Internal use only* */
  onGitHubPullRequestEvent?: Maybe<GombocError>;
  /** *Internal use only* */
  putSetupCompleted?: Maybe<GombocError>;
  /**
   * A generalized scan request that has less options then the
   * normal one from the normal scan request modal
   */
  scanFromCspm: ScanRequestResponseType;
  /** Scan single file or scenario, sent from vscode */
  scanLocalScenario: ScanLocalScenarioOutput;
  scanOnPullRequest: ScanRequestResponseType;
  /** *Internal use only* */
  scanOnSchedule: ScanRequestResponseType;
  /** Sets the location of the code that has the asset instance code */
  setCspmAssetInstanceLocation: AssetInstanceLocationResponse;
  /** Toggle adopt individual security benchmark recommendations */
  toggleAdoptSecurityBenchmarkRecommendations?: Maybe<GombocError>;
  /** Toggle adopt all recommendations from a benchmark version */
  toggleAdoptSecurityBenchmarkVersion?: Maybe<GombocError>;
  /** Unlinks the asset instance location */
  unlinkCspmAssetInstanceLocation?: Maybe<GombocError>;
  /** *Internal use only* */
  updatePullRequestStatus?: Maybe<GombocError>;
};

export type MutationBulkAllLinkScanRemoteArgs = {
  input: BulkAllLinkScanRemoteInput;
};

export type MutationBulkLinkScanRemoteArgs = {
  input: BulkLinkScanRemoteInput;
};

export type MutationCreateAzdoIntegrationArgs = {
  input: CreateAzdoIntegrationInput;
};

export type MutationCreateBitBucketIntegrationArgs = {
  input: CreateBitBucketIntegrationInput;
};

export type MutationCreateCspmCustomIntegrationArgs = {
  input: CreateCustomIntegrationInput;
};

export type MutationCreateCspmOrcaIntegrationArgs = {
  input: CreateOrcaIntegrationInput;
};

export type MutationCreateCspmWizIntegrationArgs = {
  input: CreateWizIntegrationInput;
};

export type MutationCreateGitHubIntegrationArgs = {
  input: CreateGitHubIntegrationInput;
};

export type MutationCreateGitLabIntegrationArgs = {
  input: CreateGitLabIntegrationInput;
};

export type MutationCreateProjectArgs = {
  projectName: Scalars['String']['input'];
};

export type MutationCreateScalarCustomRuleArgs = {
  input: CreateScalarCustomRuleInput;
};

export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};

export type MutationDeleteCspmIntegrationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCustomRulesArgs = {
  input: DeleteCustomRulesInput;
};

export type MutationDeleteLinkArgs = {
  linkId: Scalars['ID']['input'];
};

export type MutationDeleteProjectArgs = {
  projectId: Scalars['ID']['input'];
};

export type MutationDeleteScmIntegrationArgs = {
  input: DeleteScmIntegrationInput;
};

export type MutationDeleteTicketArgs = {
  input: DeleteTicketInput;
};

export type MutationDiscoverIacRepositoriesArgs = {
  input: DiscoverIacRepositoriesInput;
};

export type MutationLinkRepositoriesArgs = {
  input: LinkRepositoriesInput;
};

export type MutationLinkScanRemoteArgs = {
  input: LinkScanRemoteInput;
};

export type MutationOnGitHubMetaEventArgs = {
  input: OnGitHubMetaEventInput;
};

export type MutationOnGitHubPullRequestEventArgs = {
  input: OnGitHubPullRequestEventInput;
};

export type MutationPutSetupCompletedArgs = {
  input: PutSetupCompletedInput;
};

export type MutationScanFromCspmArgs = {
  input: ScanFromCspmInput;
};

export type MutationScanLocalScenarioArgs = {
  input: ScanLocalScenarioInput;
};

export type MutationScanOnPullRequestArgs = {
  input: ScanOnPullRequestInput;
};

export type MutationScanOnScheduleArgs = {
  input: ScanOnScheduleInput;
};

export type MutationSetCspmAssetInstanceLocationArgs = {
  input: SetAssetInstanceLocationInput;
};

export type MutationToggleAdoptSecurityBenchmarkRecommendationsArgs = {
  input: ToggleAdoptSecurityBenchmarkRecommendationsInput;
};

export type MutationToggleAdoptSecurityBenchmarkVersionArgs = {
  input: ToggleAdoptSecurityBenchmarkVersionInput;
};

export type MutationUnlinkCspmAssetInstanceLocationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationUpdatePullRequestStatusArgs = {
  pullRequestNumber: Scalars['String']['input'];
  pullRequestStatus: PullRequestStatus;
  repositoryId: Scalars['String']['input'];
  scmType: ScmType;
};

export type Node = {
  __typename: 'Node';
  id: Scalars['ID']['output'];
  label: Scalars['String']['output'];
};

export type NotificationPassthrough = {
  auth: Scalars['JSON']['input'];
  url: Scalars['String']['input'];
};

export type OsMetaDataInput = {
  machineName?: InputMaybe<Scalars['String']['input']>;
  privateIp?: InputMaybe<Scalars['String']['input']>;
  publicIp?: InputMaybe<Scalars['String']['input']>;
  userName?: InputMaybe<Scalars['String']['input']>;
};

export type OnGitHubMetaEventInput = {
  app: GitHubApp;
  installationId: Scalars['ID']['input'];
};

export type OnGitHubPullRequestEventInput = {
  app: GitHubApp;
  installationId: Scalars['ID']['input'];
  pullRequestEvent: PullRequestEvent;
  pullRequestNumber: Scalars['String']['input'];
  repositoryId: Scalars['String']['input'];
};

export type OntologicalSubgraph = {
  __typename: 'OntologicalSubgraph';
  edges: Array<Edge>;
  nodes: Array<Node>;
};

export enum OrcaRegion {
  Australia = 'AUSTRALIA',
  Brazil = 'BRAZIL',
  Europe = 'EUROPE',
  India = 'INDIA',
  Israel = 'ISRAEL',
  Us = 'US',
}

/** A customer organization as represented in the system */
export type Organization = {
  __typename: 'Organization';
  /**
   * CSPM Integrations associated with the account
   * @deprecated Use Query.cspmIntegrations instead
   */
  cspmIntegrations: Array<CspmIntegration>;
  /** Returns true if the organization has at least one Linked Repository */
  hasLinks: Scalars['Boolean']['output'];
  /** Returns true if the organization has at least one Policy Statement */
  hasPolicy: Scalars['Boolean']['output'];
  /** Returns true if the organization has received at least one Scan Request */
  hasScanRequests: Scalars['Boolean']['output'];
  /** Returns true if the organization has at least one SPM Integration */
  hasScmIntegrations: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  /** Return one Gomboc project by its slug, or an error if not found */
  project: ProjectResponse;
  /** Returns all Gomboc projects for this organization */
  projects: Array<Project>;
  /** Open Pull Requests from remediations */
  pullRequests: PullRequestPage;
  /**
   * Returns recent scan requests for this organization
   * @deprecated not implemented
   */
  scans: Array<ScanRequestResponse>;
  /** Returns one SCM integration by its ID, or an error if not found */
  scmIntegration: ScmIntegrationResponse;
  /** Returns SCM integrations for this organization */
  scmIntegrations: Array<ScmIntegration>;
};

/** A customer organization as represented in the system */
export type OrganizationProjectArgs = {
  slug: Scalars['String']['input'];
};

/** A customer organization as represented in the system */
export type OrganizationPullRequestsArgs = {
  input: OrganizationPullRequestsInput;
};

/** A customer organization as represented in the system */
export type OrganizationScansArgs = {
  before?: InputMaybe<Scalars['String']['input']>;
};

/** A customer organization as represented in the system */
export type OrganizationScmIntegrationArgs = {
  id: Scalars['ID']['input'];
};

export type OrganizationPullRequestsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type OrganizationResponse = GombocError | Organization;

export type PageInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type PolicyObservation = {
  __typename: 'PolicyObservation';
  /**
   * The policy statement capability ID involved
   * @deprecated Deprecated in favor of recommendation
   */
  capabilityId?: Maybe<Scalars['ID']['output']>;
  /**
   * The policy statement capability Title involved
   * @deprecated Deprecated in favor of recommendation
   */
  capabilityTitle?: Maybe<Scalars['String']['output']>;
  /** The IaC resource that was observed */
  cloudResource: CloudResource;
  codeResourceInstance: CodeResourceInstance;
  /**
   * The framework control description, if one
   * @deprecated No longer in use
   */
  description?: Maybe<Scalars['String']['output']>;
  disposition: Disposition;
  /** A link to the IaC resource documentation if available */
  documentationUrl?: Maybe<Scalars['String']['output']>;
  /** The filepath of the IaC resource that was observed */
  filepath: Scalars['String']['output'];
  /**
   * The framework name the policy statement relates to, if one
   * @deprecated No longer in use
   */
  framework?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /**
   * The framework control identifier, if one
   * @deprecated No longer in use
   */
  identifier?: Maybe<Scalars['String']['output']>;
  /** The file line number of the IaC resource that was observed */
  lineNumber: Scalars['Int']['output'];
  /** @deprecated Changing to CodeResourceInstance */
  logicalResource: LogicalResource;
  /**
   * The policy statement predicate
   * @deprecated No longer in use
   */
  predicate?: Maybe<Scalars['String']['output']>;
  /** The related benchmark recommendation (for new observations) */
  recommendation?: Maybe<SecurityBenchmarkRecommendation>;
  /** The name of the IaC resource instance that was observed */
  resourceName: Scalars['String']['output'];
  /**
   * The type of the IaC resource that was observed
   * @deprecated No longer supported
   */
  resourceType: Scalars['String']['output'];
  /** The parent scan result */
  scanResult: ScanResult;
  /** @deprecated No longer in use */
  source: Scalars['String']['output'];
};

export type PolicyObservationResponse = GombocError | PolicyObservation;

export type PolicyObservationsPage = {
  __typename: 'PolicyObservationsPage';
  page: Scalars['Int']['output'];
  results: Array<PolicyObservation>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type PolicyStatement = {
  __typename: 'PolicyStatement';
  description?: Maybe<Scalars['String']['output']>;
  framework?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  identifier?: Maybe<Scalars['String']['output']>;
  payload: PolicyStatementPayloadType;
};

export type PolicyStatementPayloadMustImplement = {
  __typename: 'PolicyStatementPayloadMustImplement';
  capability: Capability;
};

export type PolicyStatementPayloadType = PolicyStatementPayloadMustImplement;

export type Position = {
  __typename: 'Position';
  /** @deprecated Use type CodePosition */
  column: Scalars['Int']['output'];
  /** @deprecated Use type CodePosition */
  line: Scalars['Int']['output'];
};

export type Project = {
  __typename: 'Project';
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

export type PullRequest = {
  __typename: 'PullRequest';
  externalUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  scmType: ScmType;
  status: PullRequestStatus;
};

export enum PullRequestEvent {
  Discarded = 'DISCARDED',
  Merged = 'MERGED',
  Opened = 'OPENED',
  Synchronized = 'SYNCHRONIZED',
}

export type PullRequestPage = {
  __typename: 'PullRequestPage';
  page: Scalars['Int']['output'];
  results: Array<PullRequest>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type PullRequestResponse = GombocError | PullRequest;

export enum PullRequestStatus {
  Closed = 'CLOSED',
  Expected = 'EXPECTED',
  Merged = 'MERGED',
  Open = 'OPEN',
}

export type PutSetupCompletedInput = {
  setupCompleted: Scalars['Boolean']['input'];
};

export type Query = {
  __typename: 'Query';
  /** @deprecated No longer supported */
  capabilities: Array<Capability>;
  cfnProperty?: Maybe<CfnProperty>;
  cfnResource?: Maybe<CfnResource>;
  cfnResources: CfnResourcePage;
  cfnSubProperty?: Maybe<CfnSubProperty>;
  codeResource?: Maybe<CodeResource>;
  codeResources: CodeResourcePage;
  /** Gets a list of the current cspm integration */
  cspmIntegrations: Array<CspmIntegration>;
  /** Gets a single observation based on the observation Id */
  cspmObservation: CspmObservationOutput;
  /** Gets observations for a given organization */
  cspmObservations: CspmObservationsPage;
  /** Get a single custom rule based on the id */
  customRule: CustomRule;
  /** Gets paginated list of custom rules for an account */
  customRules: CustomRulesResponse;
  individualFixes: IndividualFixesResponse;
  /** Returns a single linked repository by its ID, or an error if not found */
  link: LinkResponse;
  /** Returns the active organization for the current user */
  organization: OrganizationResponse;
  /** Returns a single policy observation by its ID, or an error if not found */
  policyObservation: PolicyObservationResponse;
  /** Open Pull Requests from remediations by ID */
  pullRequest: PullRequestResponse;
  /** Returns a single Scan Log by its ID, or an error if not found */
  scan: ScanResponse;
  /** *Internal use only* */
  scanBranch: ScanBranchResponse;
  /** *Internal use only* */
  scanDirectory: ScanDirectoryResponse;
  /** Returns a single Scan Request by its ID, or an error if not found */
  scanRequest: ScanRequestResponse;
  /** Returns a single Scan Result by its ID, or an error if not found */
  scanResult: ScanResultResponse;
  /** Returns a few posible scan targets for a cloud resource */
  searchScanTargets: Array<ScanTarget>;
  securityBenchmark?: Maybe<SecurityBenchmark>;
  securityBenchmarkRecommendation?: Maybe<SecurityBenchmarkRecommendationResponse>;
  securityBenchmarkVersion?: Maybe<SecurityBenchmarkVersion>;
  securityBenchmarks: Array<SecurityBenchmark>;
  securityFramework?: Maybe<SecurityFramework>;
  securityFrameworkVersion?: Maybe<SecurityFrameworkVersion>;
  securityFrameworks: Array<SecurityFramework>;
  tfAttribute?: Maybe<TfAttribute>;
  tfNestedBlock?: Maybe<TfNestedBlock>;
  tfResource?: Maybe<TfResource>;
  tfResources: TfResourcePage;
};

export type QueryCfnPropertyArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCfnResourceArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCfnResourcesArgs = {
  input: CfnResourcePageInput;
};

export type QueryCfnSubPropertyArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCodeResourceArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCodeResourcesArgs = {
  infrastructureTool?: InputMaybe<InfrastructureTool>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryCspmObservationArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCspmObservationsArgs = {
  input: CspmObservationsInput;
};

export type QueryCustomRuleArgs = {
  id: Scalars['ID']['input'];
};

export type QueryCustomRulesArgs = {
  input: CustomRulesInput;
};

export type QueryIndividualFixesArgs = {
  input: IndividualFixesInput;
};

export type QueryLinkArgs = {
  id: Scalars['ID']['input'];
};

export type QueryPolicyObservationArgs = {
  id: Scalars['ID']['input'];
};

export type QueryPullRequestArgs = {
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

export type QueryScanResultArgs = {
  id: Scalars['ID']['input'];
};

export type QuerySearchScanTargetsArgs = {
  cloudResourceId: Scalars['ID']['input'];
};

export type QuerySecurityBenchmarkArgs = {
  id: Scalars['ID']['input'];
};

export type QuerySecurityBenchmarkRecommendationArgs = {
  id: Scalars['String']['input'];
};

export type QuerySecurityBenchmarkVersionArgs = {
  id: Scalars['ID']['input'];
};

export type QuerySecurityFrameworkArgs = {
  id: Scalars['ID']['input'];
};

export type QuerySecurityFrameworkVersionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTfAttributeArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTfNestedBlockArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTfResourceArgs = {
  id: Scalars['ID']['input'];
};

export type QueryTfResourcesArgs = {
  input: TfResourcePageInput;
};

export type RemediationComment = {
  __typename: 'RemediationComment';
  /** We should include a category and description of each fix. */
  category?: Maybe<Scalars['String']['output']>;
  fileName: Scalars['String']['output'];
  fixes: Array<LineFix>;
  iacTool: InfrastructureTool;
  logicalResource: LogicalResource;
  policyStatement: PolicyStatement;
};

export type RemediationFix = {
  __typename: 'RemediationFix';
  codePosition: CodePosition;
  filepath: Scalars['String']['output'];
  fixType: FixType;
  lineOffset: Scalars['Int']['output'];
  newLine: Array<Scalars['String']['output']>;
  oldLine: Array<Scalars['String']['output']>;
};

/** Places from where scan requests can originate */
export enum RequestOrigin {
  Community = 'COMMUNITY',
  CspmService = 'CSPM_SERVICE',
  Portal = 'PORTAL',
  Workflow = 'WORKFLOW',
}

/** Custom policy, points to a target attribute or property */
export type ScalarRule = {
  __typename: 'ScalarRule';
  /** the comment that will show up in a PR when a remediation is found */
  comment: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  /** custom description of the custom rule provided by the user */
  description: Scalars['String']['output'];
  /** standard iac tool variable */
  iacTool: InfrastructureTool;
  id: Scalars['ID']['output'];
  /** this is a string exposing what the actual rule is implementing, */
  internalDescription: Scalars['String']['output'];
  target: ScalarRuleTarget;
  /** title of the custom rule */
  title: Scalars['String']['output'];
};

/** The target of a custom policy, can be either terraform or cloudformation */
export type ScalarRuleTarget = CfnProperty | TfAttribute;

export type Scan = {
  __typename: 'Scan';
  children: ScanPage;
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  metadata: Scalars['String']['output'];
  parent?: Maybe<Scan>;
  scanRequestId: Scalars['ID']['output'];
  scanResult?: Maybe<ScanResult>;
  scanScope: Scalars['String']['output'];
};

export type ScanChildrenArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanBranch = {
  __typename: 'ScanBranch';
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
  __typename: 'ScanDirectory';
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

export type ScanFromCspmInput = {
  /** the effect --- defaults to 'SubmitForReview' */
  effect?: InputMaybe<Effect>;
  /** the observation id, the associated alertId */
  observationId: Scalars['ID']['input'];
  /** The target for the scan */
  scanTarget: ScanTargetInput;
};

export type ScanLocalScenario = {
  __typename: 'ScanLocalScenario';
  results: Array<RemediationComment>;
};

export type ScanLocalScenarioInput = {
  fileContents: Array<IacScanContent>;
  iacTool: InfrastructureTool;
  metaData?: InputMaybe<MetaDataInput>;
};

export type ScanLocalScenarioOutput = GombocError | ScanLocalScenario;

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
  __typename: 'ScanPage';
  page: Scalars['Int']['output'];
  results: Array<Scan>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanRepository = {
  __typename: 'ScanRepository';
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
  __typename: 'ScanRequest';
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
  scanResults: ScanResultPage;
  scans: ScanPage;
};

export type ScanRequestScanResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanRequestScansArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanRequestResponse = FailedScan | GombocError | ScanRequest;

export type ScanRequestResponseType = {
  __typename: 'ScanRequestResponseType';
  errors: Array<Maybe<GombocError>>;
  scanRequestId: Scalars['ID']['output'];
};

export type ScanResponse = FailedScan | GombocError | Scan;

/** A Scan Result that originated from a Scan Request */
export type ScanResult = {
  __typename: 'ScanResult';
  /** The related repository branch name */
  branch?: Maybe<Scalars['String']['output']>;
  /** A general state of the scan result */
  condition?: Maybe<ScanResultCondition>;
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
export type ScanResultObservationsArgs = {
  exclude?: InputMaybe<Array<Disposition>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

/** A Scan Result that originated from a Scan Request */
export type ScanResultPolicyObservationsArgs = {
  exclude?: InputMaybe<Array<Disposition>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

/** A Scan Result that originated from a Scan Request */
export type ScanResultTicketsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export enum ScanResultCondition {
  AllFixed = 'ALL_FIXED',
  Compliant = 'COMPLIANT',
  NoneFixed = 'NONE_FIXED',
  SomeFixed = 'SOME_FIXED',
}

export type ScanResultPage = {
  __typename: 'ScanResultPage';
  page: Scalars['Int']['output'];
  results: Array<ScanResult>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanResultResponse = GombocError | ScanResult;

export type ScanScenario = {
  __typename: 'ScanScenario';
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  parent: ScanBranch;
  result?: Maybe<ScanResult>;
};

export type ScanScenarioResponse = FailedScan | GombocError | ScanScenario;

export type ScanTarget = {
  __typename: 'ScanTarget';
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

export type ScmBranch = {
  __typename: 'ScmBranch';
  /** Returns additional info on the branch (e.g.  "main", "protected"...) */
  label?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

/** Integrations grant access to SCM repositories */
export type ScmIntegration = {
  __typename: 'ScmIntegration';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who integrated the SCM provider */
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Use it to access nested repo owners. Might be null if wrong scope or integration expired */
  repoOwner?: Maybe<ScmRepoOwner>;
  scmType: ScmType;
};

/** Integrations grant access to SCM repositories */
export type ScmIntegrationRepoOwnerArgs = {
  scope?: InputMaybe<Scalars['String']['input']>;
};

export type ScmIntegrationResponse = GombocError | ScmIntegration;

export type ScmRepoOwner = {
  __typename: 'ScmRepoOwner';
  children: ScmRepoOwnersPage;
  htmlUrl: Scalars['String']['output'];
  name: Scalars['String']['output'];
  parentScope?: Maybe<Scalars['String']['output']>;
  path: Scalars['String']['output'];
  repositories: ScmRepositoriesPage;
  scope: Scalars['String']['output'];
  searchRepositories: ScmRepositoriesPage;
  type: Scalars['String']['output'];
};

export type ScmRepoOwnerChildrenArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScmRepoOwnerRepositoriesArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScmRepoOwnerSearchRepositoriesArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  search: Scalars['String']['input'];
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScmRepoOwnersPage = {
  __typename: 'ScmRepoOwnersPage';
  page: Scalars['Int']['output'];
  results: Array<ScmRepoOwner>;
  size: Scalars['Int']['output'];
  total?: Maybe<Scalars['Int']['output']>;
};

export type ScmRepositoriesPage = {
  __typename: 'ScmRepositoriesPage';
  page: Scalars['Int']['output'];
  results: Array<ScmRepository>;
  size: Scalars['Int']['output'];
  total?: Maybe<Scalars['Int']['output']>;
};

export type ScmRepository = {
  __typename: 'ScmRepository';
  branches: Array<ScmBranch>;
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  link?: Maybe<Link>;
  name: Scalars['String']['output'];
  owner: ScmRepoOwner;
};

export type ScmRepositoryBranchesArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export enum ScmType {
  Azdo = 'AZDO',
  Bitbucket = 'BITBUCKET',
  Github = 'GITHUB',
  Gitlab = 'GITLAB',
}

export type SecurityBenchmark = {
  __typename: 'SecurityBenchmark';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  versions: Array<SecurityBenchmarkVersion>;
};

export type SecurityBenchmarkRecommendation = {
  __typename: 'SecurityBenchmarkRecommendation';
  benchmarkVersion: SecurityBenchmarkVersion;
  controls: Array<SecurityFrameworkControl>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  isAdopted: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
};

export type SecurityBenchmarkRecommendationResponse =
  | GombocError
  | SecurityBenchmarkRecommendation;

export type SecurityBenchmarkVersion = {
  __typename: 'SecurityBenchmarkVersion';
  benchmark: SecurityBenchmark;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  recommendations: Array<SecurityBenchmarkRecommendation>;
};

export type SecurityFramework = {
  __typename: 'SecurityFramework';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  versions: Array<SecurityFrameworkVersion>;
};

export type SecurityFrameworkControl = {
  __typename: 'SecurityFrameworkControl';
  description: Scalars['String']['output'];
  framework: SecurityFrameworkVersion;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  name: Scalars['String']['output'];
  recommendations: Array<SecurityBenchmarkRecommendation>;
};

export type SecurityFrameworkVersion = {
  __typename: 'SecurityFrameworkVersion';
  benchmarks: Array<SecurityBenchmarkVersion>;
  controls: Array<SecurityFrameworkControl>;
  framework: SecurityFramework;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  releasedAt?: Maybe<Scalars['String']['output']>;
};

export type SetAssetInstanceLocationInput = {
  branch: Scalars['String']['input'];
  cloudAssetId: Scalars['String']['input'];
  linkedRepositoryId: Scalars['String']['input'];
  observationId: Scalars['ID']['input'];
  path: Scalars['String']['input'];
};

export enum Severity {
  Critical = 'CRITICAL',
  High = 'HIGH',
  Info = 'INFO',
  Low = 'LOW',
  Medium = 'MEDIUM',
  Unknown = 'UNKNOWN',
}

export type TfAttribute = {
  __typename: 'TfAttribute';
  computed?: Maybe<Scalars['Boolean']['output']>;
  customRules: Array<CustomRule>;
  deprecated?: Maybe<Scalars['Boolean']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  required?: Maybe<Scalars['Boolean']['output']>;
  sensitive?: Maybe<Scalars['Boolean']['output']>;
  slug: Scalars['String']['output'];
  type?: Maybe<Scalars['String']['output']>;
};

export type TfNestedBlock = {
  __typename: 'TfNestedBlock';
  attributes: Array<TfAttribute>;
  id: Scalars['ID']['output'];
  nestedBlocks: Array<TfNestedBlock>;
};

export type TfResource = {
  __typename: 'TfResource';
  attributes: Array<TfAttribute>;
  codeResource?: Maybe<CodeResource>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  nestedBlocks: Array<TfNestedBlock>;
};

export type TfResourcePage = {
  __typename: 'TfResourcePage';
  page: Scalars['Int']['output'];
  results: Array<TfResource>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type TfResourcePageInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type Ticket = {
  __typename: 'Ticket';
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who linked the ticket */
  createdBy: Scalars['String']['output'];
  /** A link to the external ticketing system */
  externalUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type TicketPage = {
  __typename: 'TicketPage';
  page: Scalars['Int']['output'];
  results: Array<Ticket>;
  totalCount: Scalars['Int']['output'];
};

export type ToggleAdoptSecurityBenchmarkRecommendationsInput = {
  securityBenchmarkRecommendationId: Scalars['ID']['input'];
  value: Scalars['Boolean']['input'];
};

export type ToggleAdoptSecurityBenchmarkVersionInput = {
  securityBenchmarkVersionId: Scalars['ID']['input'];
  value: Scalars['Boolean']['input'];
};

/** Represents a repository that was either deleted or is unreachable due to service or integration issues */
export type UnreachableRepository = {
  __typename: 'UnreachableRepository';
  id: Scalars['ID']['output'];
};

export type WorkflowResponse = {
  __typename: 'WorkflowResponse';
  id: Scalars['ID']['output'];
};

export type TestOrganizationQueryVariables = Exact<{ [key: string]: never }>;

export type TestOrganizationQuery = {
  __typename: 'Query';
  organization:
    | { __typename: 'GombocError' }
    | { __typename: 'Organization'; id: string };
};

export type SecurityBenchmarksQueryVariables = Exact<{ [key: string]: never }>;

export type SecurityBenchmarksQuery = {
  __typename: 'Query';
  securityBenchmarks: Array<{
    __typename: 'SecurityBenchmark';
    id: string;
    name: string;
    versions: Array<{
      __typename: 'SecurityBenchmarkVersion';
      id: string;
      name: string;
      recommendations: Array<{
        __typename: 'SecurityBenchmarkRecommendation';
        id: string;
        identifier: string;
        name: string;
        description?: string | null;
        isAdopted: boolean;
      }>;
    }>;
  }>;
};

export type IndividualFixesQueryVariables = Exact<{
  input: IndividualFixesInput;
}>;

export type IndividualFixesQuery = {
  __typename: 'Query';
  individualFixes:
    | {
        __typename: 'GombocError';
        code?: GombocErrorCode | null;
        message: string;
      }
    | {
        __typename: 'IndividualFixesSuccess';
        remediations: Array<{
          __typename: 'IndividualRemediation';
          benchmarkRecommendation: {
            __typename: 'SecurityBenchmarkRecommendation';
            id: string;
            identifier: string;
            name: string;
            description?: string | null;
          };
          fixes: Array<{
            __typename: 'RemediationFix';
            filepath: string;
            oldLine: Array<string>;
            newLine: Array<string>;
            lineOffset: number;
            fixType: FixType;
            codePosition: {
              __typename: 'CodePosition';
              line: number;
              column: number;
            };
          }>;
          codeObservation: {
            __typename: 'CodeObservation';
            codeResourceInstance: {
              __typename: 'CodeResourceInstance';
              name: string;
              type: string;
              filepath: string;
              line: number;
              codeResource: {
                __typename: 'CodeResource';
                id: string;
                infrastructureTool: InfrastructureTool;
                documentationUrl?: string | null;
                cloudResource?: {
                  __typename: 'CloudResource';
                  id: string;
                  provider: CloudResourceProvider;
                  title: string;
                  documentationUrl?: string | null;
                } | null;
              };
            };
          };
        }>;
      };
};

export const TestOrganizationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'testOrganization' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'organization' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Organization' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  TestOrganizationQuery,
  TestOrganizationQueryVariables
>;
export const SecurityBenchmarksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'securityBenchmarks' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'securityBenchmarks' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'versions' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'recommendations' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'identifier' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'name' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'description' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'isAdopted' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SecurityBenchmarksQuery,
  SecurityBenchmarksQueryVariables
>;
export const IndividualFixesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'individualFixes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'IndividualFixesInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'individualFixes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'GombocError' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'code' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'IndividualFixesSuccess' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'remediations' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'benchmarkRecommendation',
                              },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'id' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'identifier' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'name' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'description',
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'fixes' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'filepath' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'oldLine' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'newLine' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'codePosition',
                                    },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'line' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'column',
                                          },
                                        },
                                      ],
                                    },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'lineOffset' },
                                  },
                                  {
                                    kind: 'Field',
                                    name: { kind: 'Name', value: 'fixType' },
                                  },
                                ],
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'codeObservation' },
                              selectionSet: {
                                kind: 'SelectionSet',
                                selections: [
                                  {
                                    kind: 'Field',
                                    name: {
                                      kind: 'Name',
                                      value: 'codeResourceInstance',
                                    },
                                    selectionSet: {
                                      kind: 'SelectionSet',
                                      selections: [
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'name' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'type' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'filepath',
                                          },
                                        },
                                        {
                                          kind: 'Field',
                                          name: { kind: 'Name', value: 'line' },
                                        },
                                        {
                                          kind: 'Field',
                                          name: {
                                            kind: 'Name',
                                            value: 'codeResource',
                                          },
                                          selectionSet: {
                                            kind: 'SelectionSet',
                                            selections: [
                                              {
                                                kind: 'Field',
                                                name: {
                                                  kind: 'Name',
                                                  value: 'id',
                                                },
                                              },
                                              {
                                                kind: 'Field',
                                                name: {
                                                  kind: 'Name',
                                                  value: 'infrastructureTool',
                                                },
                                              },
                                              {
                                                kind: 'Field',
                                                name: {
                                                  kind: 'Name',
                                                  value: 'documentationUrl',
                                                },
                                              },
                                              {
                                                kind: 'Field',
                                                name: {
                                                  kind: 'Name',
                                                  value: 'cloudResource',
                                                },
                                                selectionSet: {
                                                  kind: 'SelectionSet',
                                                  selections: [
                                                    {
                                                      kind: 'Field',
                                                      name: {
                                                        kind: 'Name',
                                                        value: 'id',
                                                      },
                                                    },
                                                    {
                                                      kind: 'Field',
                                                      name: {
                                                        kind: 'Name',
                                                        value: 'provider',
                                                      },
                                                    },
                                                    {
                                                      kind: 'Field',
                                                      name: {
                                                        kind: 'Name',
                                                        value: 'title',
                                                      },
                                                    },
                                                    {
                                                      kind: 'Field',
                                                      name: {
                                                        kind: 'Name',
                                                        value:
                                                          'documentationUrl',
                                                      },
                                                    },
                                                  ],
                                                },
                                              },
                                            ],
                                          },
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  IndividualFixesQuery,
  IndividualFixesQueryVariables
>;
