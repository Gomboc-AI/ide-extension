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
  JSON: { input: any; output: any; }
};

/** A customer account */
export type Account = {
  __typename: 'Account';
  hasFeatureBoolean: Scalars['Boolean']['output'];
  hasFeatureNumber: Scalars['Float']['output'];
  hasFeatureObject: Scalars['JSON']['output'];
  hasFeatureString: Scalars['String']['output'];
  /** Returns a list of known IaC branches (from the account's workspace repositories) */
  iacBranches: Array<Scalars['String']['output']>;
  /**
   * Returns a list of known IaC repositories (from the account's workspaces)
   * @deprecated No longer supported
   */
  iacRepositories: Array<ScmRepository>;
  id: Scalars['ID']['output'];
  license: AccountLicense;
  policyName: Scalars['String']['output'];
  pullRequest: PullRequestResponse;
  pullRequests: PullRequestPage;
  /** Returns a page of runs for the account */
  runs: RunPage;
  /** Returns a page of scan requests for the account */
  scanRequests: ScanRequestPage;
  /** Returns a single SCM integration by its ID, or an error if not found */
  scmIntegration: ScmIntegrationResponse;
  /** Returns a page of SCM integrations for the account */
  scmIntegrations: ScmIntegrationPage;
  scmRepositories: ScmRepositoriesPage;
  /** Returns a page of adopted security benchmark recommendations for the account */
  securityBenchmarkRecommendations: SecurityBenchmarkRecommendationPage;
  workspace: WorkspaceResponse;
  workspaceByName: WorkspaceResponse;
  workspaceScmTypes: Array<Maybe<ScmType>>;
  workspaces: WorkspacePage;
};


/** A customer account */
export type AccountHasFeatureBooleanArgs = {
  default: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
};


/** A customer account */
export type AccountHasFeatureNumberArgs = {
  default: Scalars['Float']['input'];
  name: Scalars['String']['input'];
};


/** A customer account */
export type AccountHasFeatureObjectArgs = {
  default: Scalars['JSON']['input'];
  name: Scalars['String']['input'];
};


/** A customer account */
export type AccountHasFeatureStringArgs = {
  default: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


/** A customer account */
export type AccountIacBranchesArgs = {
  input: IacBranchesInput;
};


/** A customer account */
export type AccountIacRepositoriesArgs = {
  input: IacRepositoriesInput;
};


/** A customer account */
export type AccountPullRequestArgs = {
  id: Scalars['ID']['input'];
};


/** A customer account */
export type AccountPullRequestsArgs = {
  input: AccountPullRequestsInput;
};


/** A customer account */
export type AccountRunsArgs = {
  input: AccountRunsInput;
};


/** A customer account */
export type AccountScanRequestsArgs = {
  input: AccountScanRequestsInput;
};


/** A customer account */
export type AccountScmIntegrationArgs = {
  id: Scalars['ID']['input'];
};


/** A customer account */
export type AccountScmIntegrationsArgs = {
  input: AccountScmIntegrationsInput;
};


/** A customer account */
export type AccountScmRepositoriesArgs = {
  input: AccountScmRepositoriesInput;
};


/** A customer account */
export type AccountSecurityBenchmarkRecommendationsArgs = {
  input: AccountSecurityBenchmarkRecommendationsInput;
};


/** A customer account */
export type AccountWorkspaceArgs = {
  id: Scalars['ID']['input'];
};


/** A customer account */
export type AccountWorkspaceByNameArgs = {
  name: Scalars['String']['input'];
};


/** A customer account */
export type AccountWorkspacesArgs = {
  input: AccountWorkspacesInput;
};

export enum AccountLicense {
  Community = 'COMMUNITY',
  Enterprise = 'ENTERPRISE'
}

export type AccountPullRequestsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountRunsInput = {
  createdAfter?: InputMaybe<Scalars['String']['input']>;
  createdBefore?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountScanRequestsInput = {
  createdAfter?: InputMaybe<Scalars['String']['input']>;
  createdBefore?: InputMaybe<Scalars['String']['input']>;
  createdBy?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  requestOrigin?: InputMaybe<RequestOrigin>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountScmIntegrationsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountScmRepositoriesInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountSecurityBenchmarkRecommendationsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type AccountWorkspacesInput = {
  branch?: InputMaybe<Scalars['String']['input']>;
  infrastructureTool?: InputMaybe<InfrastructureTool>;
  isArchived?: InputMaybe<Scalars['Boolean']['input']>;
  latestNodeResultCreatedAfter?: InputMaybe<Scalars['String']['input']>;
  latestNodeResultCreatedBefore?: InputMaybe<Scalars['String']['input']>;
  latestNodeResultFixesGreaterThan?: InputMaybe<Scalars['Int']['input']>;
  latestNodeResultFixesLessThan?: InputMaybe<Scalars['Int']['input']>;
  latestNodeResultStatuses?: InputMaybe<Array<RunStatus>>;
  latestScanResultConditionIn?: InputMaybe<Array<ScanResultCondition>>;
  latestScanResultCreatedAfter?: InputMaybe<Scalars['String']['input']>;
  latestScanResultCreatedBefore?: InputMaybe<Scalars['String']['input']>;
  latestScanResultFixesGreaterThan?: InputMaybe<Scalars['Int']['input']>;
  latestScanResultFixesLessThan?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  orderBy?: InputMaybe<Array<AccountWorkspacesOrderByInput>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  prStatus?: InputMaybe<Array<PullRequestStatus>>;
  repositoryId?: InputMaybe<Scalars['ID']['input']>;
  scmType?: InputMaybe<ScmType>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export enum AccountWorkspacesOrderByField {
  Branch = 'BRANCH',
  LatestScanResultCondition = 'LATEST_SCAN_RESULT_CONDITION',
  LatestScanResultCreatedAt = 'LATEST_SCAN_RESULT_CREATED_AT',
  LatestScanResultFixes = 'LATEST_SCAN_RESULT_FIXES',
  Name = 'NAME',
  Path = 'PATH',
  RepositoryId = 'REPOSITORY_ID',
  ScmRepositoryId = 'SCM_REPOSITORY_ID'
}

export type AccountWorkspacesOrderByInput = {
  direction: OrderByDirection;
  field: AccountWorkspacesOrderByField;
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
  V2_0 = 'V2_0'
}

export type BitBucketWorkspaceWebhook = {
  __typename: 'BitBucketWorkspaceWebhook';
  active: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
};

export type BitBucketWorkspaceWebhookResponse = BitBucketWorkspaceWebhook | GombocError;

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
  Kubernetes = 'KUBERNETES',
  Oci = 'OCI',
  Unspecified = 'UNSPECIFIED'
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
  /** A valid workspace access token */
  accessToken: Scalars['String']['input'];
  apiVersion: BitBucketApiVersion;
  /** A valid Gomboc Token. If provided, we will attempt to create a webhook for the BitBucket workspace. */
  gombocAccessToken?: InputMaybe<Scalars['String']['input']>;
  workspaceSlug: Scalars['String']['input'];
};

export type CreateBitBucketIntegrationOutput = GombocError | ScmIntegration;

export type CreateBitBucketWorkspaceWebhookInput = {
  gombocAccessToken: Scalars['String']['input'];
  scmIntegrationId: Scalars['ID']['input'];
};

export type CreateCspmIntegrationOutput = CreateCspmIntegrationResponse | GombocError;

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

export type CreateHashicorpIntegrationInput = {
  /** Name of the integration */
  name: Scalars['String']['input'];
};

export type CreateOrcaIntegrationInput = {
  gombocToken: Scalars['String']['input'];
  name: Scalars['String']['input'];
  orcaRegion: OrcaRegion;
  orcaToken: Scalars['String']['input'];
};

export type CreatePresenceBasedCustomRuleInput = {
  comment: Scalars['String']['input'];
  description: Scalars['String']['input'];
  /** The type of rule being applied to the value as CFN sees it: IMPLEMENTS_IF_PRESENT, IMPLEMENTS_IF_ABSENT */
  ruleType: PresenceBasedRule;
  targetName: Scalars['String']['input'];
  /** The type of target that the rule is targeting, tf or cfn */
  targetType: CustomRuleTargetType;
  title: Scalars['String']['input'];
};

export type CreateProjectResponse = GombocError | Project;

export type CreateRunTaskIntegrationOutput = GombocError | RunTaskIntegration;

export type CreateTicketInput = {
  externalUrl: Scalars['String']['input'];
  scanResultId: Scalars['ID']['input'];
};

export type CreateTicketOutput = GombocError | Ticket;

export type CreateValueBasedCustomRuleInput = {
  comment: Scalars['String']['input'];
  description: Scalars['String']['input'];
  /** The type of rule being applied to the value as CFN sees it: IMPLEMENTS_IF_EQUAL_TO, IMPLEMENTS_IF_NOT_EQUAL_TO, IMPLEMENTS_IF_REGEX_MATCHES, IMPLEMENTS_IF_NOT_REGEX_MATCHES */
  ruleType: ValueBasedRule;
  /** The underlying type of value of the custom rule: BOOL, STRING, NUMBER */
  scalarType: CustomRuleScalarType;
  targetName: Scalars['String']['input'];
  /** The type of target that the rule is targeting, tf or cfn */
  targetType: CustomRuleTargetType;
  title: Scalars['String']['input'];
  /** expects a base64 encoded string */
  value: Scalars['String']['input'];
  /** the type of rule that is being created: SCALAR, OTHER */
  valueType: CustomRuleValueType;
};

export type CreateWizIntegrationInput = {
  gombocToken: Scalars['String']['input'];
  name: Scalars['String']['input'];
  wizApiUrl: Scalars['String']['input'];
  wizAuthUrl: Scalars['String']['input'];
  wizClientId: Scalars['ID']['input'];
  wizClientSecret: Scalars['String']['input'];
};

export type CreateWorkspaceInput = {
  branch: Scalars['String']['input'];
  infrastructureTool: InfrastructureTool;
  path: Scalars['String']['input'];
  repositoryId: Scalars['ID']['input'];
  scmIntegrationId: Scalars['ID']['input'];
  scmType: ScmType;
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
  observationProviderName: CspmIntegrationType;
  organizationId: Scalars['String']['output'];
};

export enum CspmIntegrationType {
  Custom = 'CUSTOM',
  Customgomboc = 'CUSTOMGOMBOC',
  Orca = 'ORCA',
  Wiz = 'WIZ'
}

export type CspmObservation = {
  __typename: 'CspmObservation';
  /** The cloud account id if it exists, otherwise an empty string */
  cloudAccountId: Scalars['String']['output'];
  /** The specific unique id of the cloud asset i.e 'vm_215151194724_i-09b8a8f38e1ccebff"' */
  cloudAssetId: Scalars['ID']['output'];
  /** The name of the associated cloud asset type */
  cloudAssetTypeName: Scalars['String']['output'];
  /** The name of the cloud provider (AWS, GCP, Azure) */
  cloudProviderName: Scalars['String']['output'];
  /** The definition of the resource as told by us */
  cloudResource: AssetType;
  /** location of the asset instance if there is one, and it can be reached */
  codeResource?: Maybe<AssetInstanceLocation>;
  id: Scalars['ID']['output'];
  /** Reference to the latest scan request if it exists */
  latestScanRequest?: Maybe<ScanRequest>;
  /** Name of the cspm provider issuing the observation (WIZ, ORCA, ...) */
  observationProviderName: CspmIntegrationType;
  /** Groups all the source types into one object (name, description, id) */
  observationSource: CspmObservationSource;
  /** The array of security benchmarks */
  securityBenchmarkRecommendations: Array<SecurityBenchmarkRecommendation>;
  /** The type of security alert (defaults to "unknown"). */
  securityType: Scalars['String']['output'];
  /** The severity of the alert (defaults to "info"). */
  severity: CspmSeverity;
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
  severity?: InputMaybe<CspmSeverity>;
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

export enum CspmSeverity {
  Critical = 'CRITICAL',
  High = 'HIGH',
  Info = 'INFO',
  Low = 'LOW',
  Medium = 'MEDIUM',
  Unknown = 'UNKNOWN'
}

/** Custom policy, points to a target attribute or property */
export type CustomRule = {
  __typename: 'CustomRule';
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
  target: CustomRuleTarget;
  /** title of the custom rule */
  title: Scalars['String']['output'];
};

export enum CustomRuleScalarType {
  Bool = 'BOOL',
  Number = 'NUMBER',
  String = 'STRING'
}

/** The target of a custom policy, can be either terraform or cloudformation */
export type CustomRuleTarget = CfnProperty | TfAttribute;

export enum CustomRuleTargetType {
  CfnProperty = 'CFN_PROPERTY',
  TfAttribute = 'TF_ATTRIBUTE'
}

export enum CustomRuleValueType {
  Other = 'OTHER',
  Scalar = 'SCALAR'
}

/** @deprecated - please use presencebased or valuebased custom rule */
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

export type DeleteBitBucketWorkspaceWebhookInput = {
  scmIntegrationId: Scalars['ID']['input'];
};

export type DeleteCustomRulesInput = {
  ids: Array<Scalars['ID']['input']>;
};

export type DeleteScmIntegrationInput = {
  integrationId: Scalars['ID']['input'];
};

export type DeleteTicketInput = {
  ticketId: Scalars['ID']['input'];
};

export enum Disposition {
  AlreadyCompliant = 'ALREADY_COMPLIANT',
  AutoRemediated = 'AUTO_REMEDIATED',
  CannotRemediate = 'CANNOT_REMEDIATE',
  InsufficientInfoToRemediate = 'INSUFFICIENT_INFO_TO_REMEDIATE',
  NotApplicable = 'NOT_APPLICABLE',
  RequiresUserInput = 'REQUIRES_USER_INPUT'
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
  SubmitForReview = 'SubmitForReview'
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
  Update = 'UPDATE'
}

export enum GitHubApp {
  Community = 'COMMUNITY',
  Enterprise = 'ENTERPRISE'
}

export enum GitHubInstallationEventAction {
  Created = 'CREATED',
  Deleted = 'DELETED',
  NewPermissionsAccepted = 'NEW_PERMISSIONS_ACCEPTED',
  Suspended = 'SUSPENDED',
  Unsuspended = 'UNSUSPENDED'
}

export enum GitLabApiVersion {
  V4 = 'V4'
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
  Unauthorized = 'UNAUTHORIZED'
}

export type GroupRemediatedFileComment = {
  __typename: 'GroupRemediatedFileComment';
  benchmarkRecommendation: SecurityBenchmarkRecommendation;
  position: CodePosition;
};

export type GroupedFixesInput = {
  fileContents: Array<IacScanContent>;
  iacTool: InfrastructureTool;
  requestOrigin?: InputMaybe<RequestOrigin>;
};

export type GroupedFixesResponse = GombocError | GroupedFixesSuccess;

export type GroupedFixesSuccess = {
  __typename: 'GroupedFixesSuccess';
  remediatedFiles: Array<GroupedRemediatedFile>;
};

export type GroupedRemediatedFile = {
  __typename: 'GroupedRemediatedFile';
  comments: Array<GroupRemediatedFileComment>;
  content: Scalars['String']['output'];
  path: Scalars['String']['output'];
};

export type IacScanContent = {
  fileContent: Scalars['String']['input'];
  filePath: Scalars['String']['input'];
};

export type IacBranchesInput = {
  repositoryId: Scalars['ID']['input'];
  scmType: ScmType;
};

export type IacRepositoriesInput = {
  scmType: ScmType;
};

export type IndividualFixesInput = {
  fileContents: Array<IacScanContent>;
  iacTool: InfrastructureTool;
  requestOrigin?: InputMaybe<RequestOrigin>;
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
  Terraform = 'TERRAFORM'
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
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
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

/** A Local Scan Result that originated from a Scan Request */
export type LocalScanResult = {
  __typename: 'LocalScanResult';
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  /** The duration of the scan request */
  duration: Scalars['String']['output'];
  /** The URL to the Gomboc Portal */
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** The related infrastructure tool */
  infrastructureTool: InfrastructureTool;
  /** A page of policy observations in this scan result */
  policyObservations: PolicyObservationsPage;
  /** Indicates where the request came from */
  requestOrigin: RequestOrigin;
  /** The parent scan request ID */
  scanRequestId: Scalars['ID']['output'];
};


/** A Local Scan Result that originated from a Scan Request */
export type LocalScanResultPolicyObservationsArgs = {
  input: LocalScanResultPolicyObservationsInput;
};

export type LocalScanResultPage = {
  __typename: 'LocalScanResultPage';
  page: Scalars['Int']['output'];
  results: Array<LocalScanResult>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type LocalScanResultPolicyObservationsInput = {
  exclude?: InputMaybe<Array<Disposition>>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type LocalScanResultResponse = GombocError | LocalScanResult;

export type LocalScanResultsInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
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
  /** Scans all linked repositories */
  bulkAllLinkScanRemote: ScanRequestResponseType;
  /** Call scans on a number of linked repository with default settings */
  bulkLinkScanRemote: ScanRequestResponseType;
  createAzdoIntegration: CreateAzdoIntegrationOutput;
  createBitBucketIntegration: CreateBitBucketIntegrationOutput;
  createBitBucketWorkspaceWebhook: BitBucketWorkspaceWebhookResponse;
  createCspmCustomIntegration: CreateCspmIntegrationOutput;
  /** Follow this pattern for adding more cspms, we want them to all return the same type but intake different ones */
  createCspmOrcaIntegration: CreateCspmIntegrationOutput;
  createCspmWizIntegration: CreateCspmIntegrationOutput;
  createGitHubIntegration: CreateGitHubIntegrationResponse;
  createGitLabIntegration: CreateGitLabIntegrationOutput;
  /** Mutation to create a hashicorp run task */
  createHashicorpRunTaskIntegration: CreateRunTaskIntegrationOutput;
  /** Creates a presence based scalar custom rule */
  createPresenceBasedCustomRule?: Maybe<GombocError>;
  /** Create a new Gomboc project */
  createProject: CreateProjectResponse;
  /** Link a Ticket to a Scan Result */
  createTicket: CreateTicketOutput;
  /** Creates a value based scalar custom rule */
  createValueBasedCustomRule?: Maybe<GombocError>;
  /** Create a new workspace */
  createWorkspace: WorkspaceResponse;
  deleteBitBucketWorkspaceWebhook?: Maybe<GombocError>;
  /** deletes any of the cspm integrations based on the id */
  deleteCspmIntegration?: Maybe<GombocError>;
  /** deletes a batch of custom rules */
  deleteCustomRules?: Maybe<GombocError>;
  /** Unlink a repository from a project */
  deleteLink?: Maybe<GombocError>;
  /** Delete a Gomboc project */
  deleteProject?: Maybe<GombocError>;
  /** Delete the hashicorp run task */
  deleteRunTaskIntegration?: Maybe<GombocError>;
  /** Remove an SCM integration */
  deleteScmIntegration?: Maybe<GombocError>;
  /** Unlink a Ticket from a Scan Result */
  deleteTicket?: Maybe<GombocError>;
  /** Link repositories to a project */
  linkRepositories: Array<LinkRepositoryResponse>;
  /** Call a scan on a linked repository */
  linkScanRemote: ScanRequestResponseType;
  /** *Internal use only* */
  onGitHubInstallationEvent?: Maybe<GombocError>;
  /**
   * *Internal use only*
   * @deprecated Use onGitHubInstallationEvent instead
   */
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
  scanScmUrl: ScanRequestResponseType;
  /** Call a scan on a workspace */
  scanWorkspace: ScanRequestResponseType;
  /** Scan a batch of workspaces */
  scanWorkspaceBatch: ScanRequestResponseType;
  /** Sets the location of the code that has the asset instance code */
  setCspmAssetInstanceLocation: AssetInstanceLocationResponse;
  /** Updates the securityBenchmarks held in the observations table */
  setCspmObservationSecurityBenchmarkRecommendations?: Maybe<GombocError>;
  /** Trigger a scan for IAC repositories for a given integration */
  startRepositoryLinking: StartRepositoryLinkingOuput;
  /** Toggle adopt individual security benchmark recommendations */
  toggleAdoptSecurityBenchmarkRecommendations?: Maybe<GombocError>;
  /** Toggle adopt all recommendations from a benchmark version */
  toggleAdoptSecurityBenchmarkVersion?: Maybe<GombocError>;
  /** Unlinks the asset instance location, based on the observation id */
  unlinkCspmAssetInstanceLocation?: Maybe<GombocError>;
  /**
   * Triggers workflow to update branch reports for an organization. The request
   * must originate from an internal service and will use the account from the input.
   */
  updateBranchReports: UpdateBranchReportsOutput;
  /** *Internal use only* */
  updatePullRequestStatus?: Maybe<GombocError>;
  /** Update a workspace */
  updateWorkspace: WorkspaceResponse;
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


export type MutationCreateBitBucketWorkspaceWebhookArgs = {
  input: CreateBitBucketWorkspaceWebhookInput;
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


export type MutationCreateHashicorpRunTaskIntegrationArgs = {
  input: CreateHashicorpIntegrationInput;
};


export type MutationCreatePresenceBasedCustomRuleArgs = {
  input: CreatePresenceBasedCustomRuleInput;
};


export type MutationCreateProjectArgs = {
  projectName: Scalars['String']['input'];
};


export type MutationCreateTicketArgs = {
  input: CreateTicketInput;
};


export type MutationCreateValueBasedCustomRuleArgs = {
  input: CreateValueBasedCustomRuleInput;
};


export type MutationCreateWorkspaceArgs = {
  input: CreateWorkspaceInput;
};


export type MutationDeleteBitBucketWorkspaceWebhookArgs = {
  input: DeleteBitBucketWorkspaceWebhookInput;
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


export type MutationDeleteRunTaskIntegrationArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteScmIntegrationArgs = {
  input: DeleteScmIntegrationInput;
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


export type MutationOnGitHubInstallationEventArgs = {
  input: OnGitHubInstallationEventInput;
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


export type MutationScanScmUrlArgs = {
  input: ScanScmUrlInput;
};


export type MutationScanWorkspaceArgs = {
  input: ScanWorkspaceInput;
};


export type MutationScanWorkspaceBatchArgs = {
  input: ScanWorkspaceBatchInput;
};


export type MutationSetCspmAssetInstanceLocationArgs = {
  input: SetAssetInstanceLocationInput;
};


export type MutationSetCspmObservationSecurityBenchmarkRecommendationsArgs = {
  input: SetCspmObservationSecurityBenchmarkRecommendationsInput;
};


export type MutationStartRepositoryLinkingArgs = {
  input: RepositoryLinkingInput;
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


export type MutationUpdateBranchReportsArgs = {
  input: UpdateBranchReportsInput;
};


export type MutationUpdatePullRequestStatusArgs = {
  pullRequestNumber: Scalars['String']['input'];
  pullRequestStatus: PullRequestStatus;
  repositoryId: Scalars['String']['input'];
  scmType: ScmType;
};


export type MutationUpdateWorkspaceArgs = {
  input: UpdateWorkspaceInput;
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

export type OnGitHubInstallationEventInput = {
  action: GitHubInstallationEventAction;
  app: GitHubApp;
  enterpriseId?: InputMaybe<Scalars['ID']['input']>;
  gitHubAccountId: Scalars['ID']['input'];
  gitHubAccountLogin: Scalars['String']['input'];
  gitHubSenderLogin: Scalars['String']['input'];
  installationId: Scalars['ID']['input'];
};

export type OnGitHubMetaEventInput = {
  app: GitHubApp;
  installationId: Scalars['ID']['input'];
};

export type OnGitHubPullRequestEventInput = {
  app: GitHubApp;
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
  installationId: Scalars['ID']['input'];
  pullRequestEvent: PullRequestEvent;
  pullRequestNumber: Scalars['String']['input'];
  repositoryId: Scalars['String']['input'];
  repositoryOwnerId?: InputMaybe<Scalars['String']['input']>;
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
  Us = 'US'
}

export enum OrderByDirection {
  Asc = 'ASC',
  Desc = 'DESC'
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
  /**
   * Return one Gomboc project by its slug, or an error if not found
   * @deprecated Projects are deprecated
   */
  project: ProjectResponse;
  /**
   * Returns all Gomboc projects for this organization
   * @deprecated Projects are deprecated
   */
  projects: Array<Project>;
  /**
   * Open Pull Requests from remediations
   * @deprecated Use Account.pullRequests instead
   */
  pullRequests: PullRequestPage;
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
  /** Not present for older policy observations */
  codeResource?: Maybe<CodeResource>;
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

export enum PresenceBasedRule {
  ImplementsIfAbsent = 'IMPLEMENTS_IF_ABSENT',
  ImplementsIfPresent = 'IMPLEMENTS_IF_PRESENT'
}

export enum ProcessorType {
  ConfigOption = 'CONFIG_OPTION',
  Orl = 'ORL'
}

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
  parent?: Maybe<PullRequest>;
  scmType: ScmType;
  status: PullRequestStatus;
  title: Scalars['String']['output'];
};

export enum PullRequestEvent {
  Discarded = 'DISCARDED',
  Merged = 'MERGED',
  Opened = 'OPENED',
  Synchronized = 'SYNCHRONIZED'
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
  Open = 'OPEN'
}

export type PutSetupCompletedInput = {
  setupCompleted: Scalars['Boolean']['input'];
};

export type Query = {
  __typename: 'Query';
  /** Returns the active account for the user */
  account: Account;
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
  groupedFixes: GroupedFixesResponse;
  individualFixes: IndividualFixesResponse;
  /**
   * Returns a single linked repository by its ID, or an error if not found
   * @deprecated Links are deprecated
   */
  link: LinkResponse;
  /** Returns a single Local Scan Result by its ID, or an error if not found */
  localScanResult: LocalScanResultResponse;
  /** Returns the active organization for the current user */
  organization: OrganizationResponse;
  /** Returns a single policy observation by its ID, or an error if not found */
  policyObservation: PolicyObservationResponse;
  /** Open Pull Requests from remediations by ID */
  pullRequest: PullRequestResponse;
  run: RunResponse;
  runLog: RunLogResponse;
  runNode: RunNodeResponse;
  /** Gets a list of the run task integrations */
  runTaskIntegrations: Array<RunTaskIntegration>;
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
  scanResultNode: ScanResultNodeResponse;
  /** Returns a single SCM Repository Owner by its ID, or an error if not found */
  scmRepoOwner: ScmRepoOwnerResponse;
  /** Returns a single SCM Repository by its ID, or an error if not found */
  scmRepository: ScmRepositoryResponse;
  /** Internal use only */
  scmRunnerScan: ScmRunnerScanResponse;
  /** Returns a few posible scan targets */
  searchScanTargets: SearchScanTargetsPage;
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


export type QueryGroupedFixesArgs = {
  input: GroupedFixesInput;
};


export type QueryIndividualFixesArgs = {
  input: IndividualFixesInput;
};


export type QueryLinkArgs = {
  id: Scalars['ID']['input'];
};


export type QueryLocalScanResultArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPolicyObservationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryPullRequestArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRunArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRunLogArgs = {
  id: Scalars['ID']['input'];
};


export type QueryRunNodeArgs = {
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


export type QueryScanResultNodeArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScmRepoOwnerArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScmRepositoryArgs = {
  id: Scalars['ID']['input'];
};


export type QueryScmRunnerScanArgs = {
  input: ScmRunnerScanInput;
};


export type QuerySearchScanTargetsArgs = {
  input: SearchScanTargetsInput;
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

export type RepositoryLinkingInput = {
  integrationId: Scalars['ID']['input'];
};

/** Places from where scan requests can originate */
export enum RequestOrigin {
  Community = 'COMMUNITY',
  CspmService = 'CSPM_SERVICE',
  GombocSchedule = 'GOMBOC_SCHEDULE',
  HclTerraformRunTask = 'HCL_TERRAFORM_RUN_TASK',
  Ide = 'IDE',
  Mcp = 'MCP',
  Portal = 'PORTAL',
  ScmPullRequest = 'SCM_PULL_REQUEST',
  ScmSchedule = 'SCM_SCHEDULE',
  Workflow = 'WORKFLOW'
}

export type Run = {
  __typename: 'Run';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  request: ScanRequestNode;
  results: ScanResultNodePage;
  status: RunStatus;
  totalFixes: Scalars['Int']['output'];
};


export type RunResultsArgs = {
  input: RunScanResultNodeInput;
};

export type RunLog = {
  __typename: 'RunLog';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  level: RunLogLevel;
  message: Scalars['String']['output'];
  /** @deprecated Use createdAt instead, for consistency */
  timestamp: Scalars['String']['output'];
};

export enum RunLogLevel {
  Critical = 'CRITICAL',
  Debug = 'DEBUG',
  Error = 'ERROR',
  Info = 'INFO',
  Warning = 'WARNING'
}

export type RunLogPage = {
  __typename: 'RunLogPage';
  page: Scalars['Int']['output'];
  results: Array<RunLog>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type RunLogResponse = GombocError | RunLog;

export type RunNode = {
  __typename: 'RunNode';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  logs: RunLogPage;
  metadata: Scalars['JSON']['output'];
  run: Run;
  status: RunStatus;
  type: RunNodeType;
};

export type RunNodeResponse = GombocError | RunNode;

export enum RunNodeType {
  ScanRequest = 'SCAN_REQUEST',
  ScanResult = 'SCAN_RESULT'
}

export type RunPage = {
  __typename: 'RunPage';
  page: Scalars['Int']['output'];
  results: Array<Run>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type RunResponse = GombocError | Run;

export type RunScanResultNodeInput = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export enum RunStatus {
  Failed = 'FAILED',
  InProgress = 'IN_PROGRESS',
  NotStarted = 'NOT_STARTED',
  Success = 'SUCCESS'
}

export type RunTaskIntegration = {
  __typename: 'RunTaskIntegration';
  createdAt: Scalars['String']['output'];
  /** Name of the user who created the integration */
  createdBy: Scalars['String']['output'];
  /** Key used by hashicorp to create the integration */
  hmacKey: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Name of the integration */
  name: Scalars['String']['output'];
  /** The type of the integration */
  runTaskProviderName: RunTaskIntegrationType;
  /** Webhook url to put in the hashicorp portal when setting up the integration */
  webhookEndpointUrl: Scalars['String']['output'];
};

export enum RunTaskIntegrationType {
  Hashicorp = 'HASHICORP'
}

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
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
  effect: Effect;
  iacTools: Array<InfrastructureTool>;
  pullRequestIdentifier: Scalars['String']['input'];
  scenarioPaths: Array<Scalars['String']['input']>;
};

export type ScanOnScheduleInput = {
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
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

export type ScanReport = {
  __typename: 'ScanReport';
  files: Array<ScanReportFile>;
  footer: Scalars['String']['output'];
  summary: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type ScanReportFile = {
  __typename: 'ScanReportFile';
  summary: Scalars['String']['output'];
  title: Scalars['String']['output'];
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
  /** The URL to the Gomboc Portal */
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  localScanResults: LocalScanResultPage;
  /** Orca Security Alert ID -- if there is one */
  orcaAlertId?: Maybe<Scalars['ID']['output']>;
  /** Processor used to run the scan request */
  processor: ProcessorType;
  /** The Pull Request that triggered this scan, if there is one */
  pullRequest?: Maybe<PullRequest>;
  requestOrigin: RequestOrigin;
  scanResults: ScanResultPage;
  scans: ScanPage;
  status: ScanRequestStatus;
};


export type ScanRequestLocalScanResultsArgs = {
  input: LocalScanResultsInput;
};


export type ScanRequestScanResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


export type ScanRequestScansArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScanRequestNode = {
  __typename: 'ScanRequestNode';
  createdAt: Scalars['String']['output'];
  /** The user who created the scan request */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The mode in which the scan was requested */
  effect?: Maybe<Effect>;
  id: Scalars['ID']['output'];
  logs: RunLogPage;
  /** Indicates where the request came from */
  requestOrigin?: Maybe<RequestOrigin>;
  /** The run this scan request node belongs to */
  run: Run;
  /** The status of the scan request node */
  status: RunStatus;
};

export type ScanRequestPage = {
  __typename: 'ScanRequestPage';
  page: Scalars['Int']['output'];
  results: Array<ScanRequest>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanRequestResponse = FailedScan | GombocError | ScanRequest;

export type ScanRequestResponseType = {
  __typename: 'ScanRequestResponseType';
  errors: Array<Maybe<GombocError>>;
  scanRequestId: Scalars['ID']['output'];
};

export enum ScanRequestStatus {
  Concluded = 'CONCLUDED',
  Failed = 'FAILED',
  Running = 'RUNNING'
}

export type ScanResponse = FailedScan | GombocError | Scan;

/** A Scan Result that originated from a Scan Request */
export type ScanResult = {
  __typename: 'ScanResult';
  /** The related repository branch name */
  branch?: Maybe<Scalars['String']['output']>;
  /** A general state of the scan result */
  condition?: Maybe<ScanResultCondition>;
  createdAt: Scalars['String']['output'];
  createdBy: Scalars['String']['output'];
  /** @deprecated Use ScanResult.path instead */
  directory: Scalars['String']['output'];
  /** The duration of the scan request */
  duration: Scalars['String']['output'];
  /** The mode in which the scan was requested */
  effect: Effect;
  /** Returns the number of fixes found and applied during the scan */
  fixes: Scalars['Int']['output'];
  /** The URL to the Gomboc Portal */
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** The related infrastructure tool */
  infrastructureTool: InfrastructureTool;
  /**
   * The linked repository the scan result relates to, if still available
   * @deprecated Links are deprecated
   */
  link?: Maybe<Link>;
  /**
   * The list of observations in this scan result
   * @deprecated use policyObservations -- paginated
   */
  observations: Array<PolicyObservation>;
  /** Returns the total number of observations in this scan result */
  observationsCount: Scalars['Int']['output'];
  /** The name of the SCM Provider owner of the related repository */
  ownerName: Scalars['String']['output'];
  /** Returns the number of observations that were already compliant */
  passedCount: Scalars['Int']['output'];
  /** The related directory or file path */
  path: Scalars['String']['output'];
  /** A page of policy observations in this scan result */
  policyObservations: PolicyObservationsPage;
  /** Processor used to run the scan result */
  processor: ProcessorType;
  /**
   * The project the scan result relates to, if still available
   * @deprecated Projects are deprecated
   */
  project?: Maybe<Project>;
  /**
   * Project name snapshot in case it was deleted
   * @deprecated Projects are deprecated
   */
  projectName: Scalars['String']['output'];
  /** The Pull Request, if one was created */
  pullRequest?: Maybe<PullRequest>;
  /** Returns the number of observations in violation that were remediated */
  remediationsCount: Scalars['Int']['output'];
  /** The report obtained after a scan is complete, contains multiple sections. */
  report?: Maybe<ScanReport>;
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
  /** The workspace where this scan result took place, if one exists */
  workspace?: Maybe<Workspace>;
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
  SomeFixed = 'SOME_FIXED'
}

export type ScanResultNode = {
  __typename: 'ScanResultNode';
  /** The related repository branch name */
  branch?: Maybe<Scalars['String']['output']>;
  /** A general state of the scan result */
  condition?: Maybe<ScanResultCondition>;
  createdAt: Scalars['String']['output'];
  /** The user who created the scan result */
  createdBy?: Maybe<Scalars['String']['output']>;
  /** The duration of the scan request */
  duration?: Maybe<Scalars['Int']['output']>;
  /** The mode in which the scan was requested */
  effect?: Maybe<Effect>;
  /** The number of fixes found and applied during the scan */
  fixesCount?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  /** The related infrastructure tool */
  infrastructureTool?: Maybe<InfrastructureTool>;
  logs: RunLogPage;
  /** The related directory or file path */
  path?: Maybe<Scalars['String']['output']>;
  /** The Pull Request, if one was created */
  pullRequest?: Maybe<PullRequest>;
  /** Indicates where the request came from */
  requestOrigin?: Maybe<RequestOrigin>;
  /** The run this scan request node belongs to */
  run: Run;
  /** The report obtained after a scan is complete, contains multiple sections. */
  scanReport?: Maybe<ScanReport>;
  /** Repository associated with the scanresult */
  scmRepository?: Maybe<ScmRepository>;
  /** The SCM type of the repository */
  scmType?: Maybe<ScmType>;
  /** The resulting status of the scan node */
  status: RunStatus;
  /** The workspace where this scan result took place, if one exists */
  workspace?: Maybe<Workspace>;
};

export type ScanResultNodePage = {
  __typename: 'ScanResultNodePage';
  page: Scalars['Int']['output'];
  results: Array<ScanResultNode>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanResultNodeResponse = GombocError | ScanResultNode;

export type ScanResultPage = {
  __typename: 'ScanResultPage';
  page: Scalars['Int']['output'];
  results: Array<ScanResult>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type ScanResultPageResponse = GombocError | ScanResultPage;

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

export type ScanScmUrlInput = {
  accountId: Scalars['ID']['input'];
  branchName: Scalars['String']['input'];
  commitUrl?: InputMaybe<Scalars['String']['input']>;
  effect: Effect;
  iacTool: InfrastructureTool;
  pullRequestUrl?: InputMaybe<Scalars['String']['input']>;
  recurse?: InputMaybe<Scalars['Boolean']['input']>;
  repositoryUrl: Scalars['String']['input'];
  requestOrigin: RequestOrigin;
  requestedBy: Scalars['String']['input'];
  workingDirectory: Scalars['String']['input'];
};

export type ScanTarget = {
  __typename: 'ScanTarget';
  /** The repository branch */
  branch: Scalars['String']['output'];
  /** The confidence that this is a matching scan target */
  confidence: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  /** Maps to a repository */
  link?: Maybe<Link>;
  /** The scenario path: a directory or a filepath */
  path: Scalars['String']['output'];
  /** Policy observation attached to this scan target */
  policyObservation: PolicyObservation;
};

export type ScanTargetInput = {
  /** The repository branch */
  branch: Scalars['String']['input'];
  /** Maps to a repository */
  linkId: Scalars['ID']['input'];
  /** The scenario path: a directory or a filepath */
  path: Scalars['String']['input'];
};

export type ScanWorkspaceBatchInput = {
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
  effect: Effect;
  workspaceIds: Array<Scalars['ID']['input']>;
};

export type ScanWorkspaceInput = {
  autoFormat?: InputMaybe<Scalars['Boolean']['input']>;
  effect: Effect;
  workspaceId: Scalars['ID']['input'];
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
  /** Only BitBucket: Returns the related webhook, if it exists. */
  bitBucketWebhook?: Maybe<BitBucketWorkspaceWebhook>;
  createdAt: Scalars['String']['output'];
  /** Returns the email of the user who integrated the SCM provider */
  createdBy: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Use it to access nested repo owners. Might be null if wrong scope or integration expired */
  repoOwner: ScmRepoOwnerResponse;
  scmType: ScmType;
};


/** Integrations grant access to SCM repositories */
export type ScmIntegrationRepoOwnerArgs = {
  scope?: InputMaybe<Scalars['String']['input']>;
};

export type ScmIntegrationPage = {
  __typename: 'ScmIntegrationPage';
  page: Scalars['Int']['output'];
  results: Array<ScmIntegration>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ScmIntegrationResponse = GombocError | ScmIntegration;

export type ScmRepoOwner = {
  __typename: 'ScmRepoOwner';
  avatarUrl: Scalars['String']['output'];
  children: ScmRepoOwnersPage;
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  parentScope?: Maybe<Scalars['String']['output']>;
  path: Scalars['String']['output'];
  repositories: ScmRepositoriesPage;
  scmType: ScmType;
  scope?: Maybe<Scalars['String']['output']>;
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

export type ScmRepoOwnerResponse = GombocError | ScmRepoOwner | UnreachableRepoOwner;

export type ScmRepoOwnersPage = {
  __typename: 'ScmRepoOwnersPage';
  page: Scalars['Int']['output'];
  results: Array<ScmRepoOwner>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ScmRepositoriesPage = {
  __typename: 'ScmRepositoriesPage';
  page: Scalars['Int']['output'];
  results: Array<ScmRepository>;
  size: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ScmRepository = {
  __typename: 'ScmRepository';
  branches: Array<ScmBranch>;
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isPublic: Scalars['Boolean']['output'];
  /** @deprecated This field will be removed soon */
  link?: Maybe<Link>;
  name: Scalars['String']['output'];
  owner: ScmRepoOwnerResponse;
  scmType: ScmType;
  workspaces: WorkspacePage;
};


export type ScmRepositoryBranchesArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};


export type ScmRepositoryWorkspacesArgs = {
  input: ScmRepositoryWorkspacesInput;
};

export type ScmRepositoryResponse = GombocError | ScmRepository | UnreachableRepository;

export type ScmRepositoryWorkspacesInput = {
  branch?: InputMaybe<Scalars['String']['input']>;
  infrastructureTool?: InputMaybe<InfrastructureTool>;
  isArchived?: InputMaybe<Scalars['Boolean']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type ScmRunnerScan = {
  __typename: 'ScmRunnerScan';
  fixesCount: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  logs: Array<ScmRunnerScanLog>;
  status: ScmRunnerScanStatus;
};


export type ScmRunnerScanLogsArgs = {
  input: ScmRunnerScanLogsInput;
};

export type ScmRunnerScanInput = {
  id: Scalars['ID']['input'];
};

export type ScmRunnerScanLog = {
  __typename: 'ScmRunnerScanLog';
  createdAt: Scalars['String']['output'];
  level: ScmRunnerScanLogLevel;
  message: Scalars['String']['output'];
  /** @deprecated Use createdAt instead, for consistency */
  timestamp: Scalars['String']['output'];
};

export enum ScmRunnerScanLogLevel {
  Critical = 'CRITICAL',
  Debug = 'DEBUG',
  Error = 'ERROR',
  Info = 'INFO',
  Warning = 'WARNING'
}

/** Allow consumers to only fetch logs created after a certain time so that they can log as logs come - unix epoch milliseconds */
export type ScmRunnerScanLogsInput = {
  createdAfter?: InputMaybe<Scalars['String']['input']>;
};

export type ScmRunnerScanResponse = GombocError | ScmRunnerScan;

export enum ScmRunnerScanStatus {
  Failed = 'FAILED',
  InProgress = 'IN_PROGRESS',
  SucceededWithoutFixes = 'SUCCEEDED_WITHOUT_FIXES',
  SucceededWithFixes = 'SUCCEEDED_WITH_FIXES'
}

export enum ScmType {
  Azdo = 'AZDO',
  Bitbucket = 'BITBUCKET',
  Github = 'GITHUB',
  Gitlab = 'GITLAB'
}

export type SearchScanTargetsInput = {
  cspmObservationId: Scalars['ID']['input'];
};

export type SearchScanTargetsPage = {
  __typename: 'SearchScanTargetsPage';
  /** A ranked list of the scan target based on the confidence */
  results: Array<ScanTarget>;
};

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

export type SecurityBenchmarkRecommendationPage = {
  __typename: 'SecurityBenchmarkRecommendationPage';
  page: Scalars['Int']['output'];
  results: Array<SecurityBenchmarkRecommendation>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type SecurityBenchmarkRecommendationResponse = GombocError | SecurityBenchmarkRecommendation;

export type SecurityBenchmarkVersion = {
  __typename: 'SecurityBenchmarkVersion';
  benchmark: SecurityBenchmark;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  recommendations: Array<SecurityBenchmarkRecommendation>;
  relatedFrameworkVersions: Array<SecurityFrameworkVersion>;
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
  /** @deprecated Use frameworkVersion instead */
  framework: SecurityFrameworkVersion;
  frameworkVersion: SecurityFrameworkVersion;
  id: Scalars['ID']['output'];
  identifier: Scalars['String']['output'];
  name: Scalars['String']['output'];
  recommendations: Array<SecurityBenchmarkRecommendation>;
};

export type SecurityFrameworkVersion = {
  __typename: 'SecurityFrameworkVersion';
  /** @deprecated Use relatedBenchmarkVersions instead */
  benchmarks: Array<SecurityBenchmarkVersion>;
  controls: Array<SecurityFrameworkControl>;
  framework: SecurityFramework;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  relatedBenchmarkVersions: Array<SecurityBenchmarkVersion>;
  releasedAt?: Maybe<Scalars['String']['output']>;
};

export type SetAssetInstanceLocationInput = {
  branch: Scalars['String']['input'];
  cloudAssetId: Scalars['ID']['input'];
  linkedRepositoryId: Scalars['String']['input'];
  observationId: Scalars['ID']['input'];
  path: Scalars['String']['input'];
  securityBenchmarkRecommendationIds: Array<Scalars['ID']['input']>;
};

export type SetCspmObservationSecurityBenchmarkRecommendationsInput = {
  cspmObservationId: Scalars['ID']['input'];
  securityBenchmarkRecommendationIds: Array<Scalars['ID']['input']>;
};

export type StartRepositoryLinkingOuput = GombocError | WorkflowResponse;

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

/** Represents a repository owner that was either deleted or is unreachable due to service or integration issues */
export type UnreachableRepoOwner = {
  __typename: 'UnreachableRepoOwner';
  id: Scalars['ID']['output'];
  lastKnownName: Scalars['String']['output'];
  scmType: ScmType;
};

/** Represents a repository that was either deleted or is unreachable due to service or integration issues */
export type UnreachableRepository = {
  __typename: 'UnreachableRepository';
  id: Scalars['ID']['output'];
  lastKnownName: Scalars['String']['output'];
  scmType: ScmType;
};

export type UpdateBranchReportsInput = {
  accountId: Scalars['ID']['input'];
};

export type UpdateBranchReportsOutput = GombocError | WorkflowResponse;

export type UpdateWorkspaceInput = {
  isArchived?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  workspaceId: Scalars['ID']['input'];
};

export enum ValueBasedRule {
  ImplementsIfEqualTo = 'IMPLEMENTS_IF_EQUAL_TO',
  ImplementsIfNotEqualTo = 'IMPLEMENTS_IF_NOT_EQUAL_TO',
  ImplementsIfNotRegexMatches = 'IMPLEMENTS_IF_NOT_REGEX_MATCHES',
  ImplementsIfRegexMatches = 'IMPLEMENTS_IF_REGEX_MATCHES'
}

export type WorkflowResponse = {
  __typename: 'WorkflowResponse';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

export type Workspace = {
  __typename: 'Workspace';
  branch: Scalars['String']['output'];
  /** The URL to the Gomboc Portal */
  htmlUrl: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  infrastructureTool: InfrastructureTool;
  isArchived: Scalars['Boolean']['output'];
  lastScanResult?: Maybe<ScanResult>;
  lastScanResultNode?: Maybe<ScanResultNode>;
  /** Name of the workspace, defaults to reponame-branch-path, but is mutable by user */
  name?: Maybe<Scalars['String']['output']>;
  path: Scalars['String']['output'];
  /**
   * Use if repository is deleted or unreachable
   * @deprecated Get it from scmRepository
   */
  repositoryNameFallback: Scalars['String']['output'];
  /**
   * Use if repository is deleted or unreachable
   * @deprecated Get it from scmRepository
   */
  repositoryOwnerNameFallback: Scalars['String']['output'];
  /** Get a page of run nodes for this workspace */
  runNodes: ScanResultNodePage;
  /** Returns a page of Scan Results related to this workspace */
  scanResults: ScanResultPageResponse;
  /** Get the parent SCM repository */
  scmRepository: ScmRepositoryResponse;
};


export type WorkspaceRunNodesArgs = {
  input: WorkspaceRunNodesInput;
};


export type WorkspaceScanResultsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
};

export type WorkspacePage = {
  __typename: 'WorkspacePage';
  page: Scalars['Int']['output'];
  results: Array<Workspace>;
  size: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type WorkspaceResponse = GombocError | Workspace;

export type WorkspaceRunNodesInput = {
  createdAfter?: InputMaybe<Scalars['String']['input']>;
  createdBefore?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  size?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<RunStatus>;
  type?: InputMaybe<RunNodeType>;
};

export type TestOrganizationQueryVariables = Exact<{ [key: string]: never; }>;


export type TestOrganizationQuery = { __typename: 'Query', organization: { __typename: 'GombocError' } | { __typename: 'Organization', id: string } };

export type SecurityBenchmarksQueryVariables = Exact<{ [key: string]: never; }>;


export type SecurityBenchmarksQuery = { __typename: 'Query', securityBenchmarks: Array<{ __typename: 'SecurityBenchmark', id: string, name: string, versions: Array<{ __typename: 'SecurityBenchmarkVersion', id: string, name: string, recommendations: Array<{ __typename: 'SecurityBenchmarkRecommendation', id: string, identifier: string, name: string, description?: string | null, isAdopted: boolean }> }> }> };

export type IndividualFixesQueryVariables = Exact<{
  individualFixesInput: IndividualFixesInput;
  groupedFixesInput: GroupedFixesInput;
}>;


export type IndividualFixesQuery = { __typename: 'Query', individualFixes: { __typename: 'GombocError', code?: GombocErrorCode | null, message: string } | { __typename: 'IndividualFixesSuccess', remediations: Array<{ __typename: 'IndividualRemediation', benchmarkRecommendation: { __typename: 'SecurityBenchmarkRecommendation', id: string, identifier: string, name: string, description?: string | null }, fixes: Array<{ __typename: 'RemediationFix', filepath: string, oldLine: Array<string>, newLine: Array<string>, lineOffset: number, fixType: FixType, codePosition: { __typename: 'CodePosition', line: number, column: number } }>, codeObservation: { __typename: 'CodeObservation', codeResourceInstance: { __typename: 'CodeResourceInstance', name: string, type: string, filepath: string, line: number, codeResource: { __typename: 'CodeResource', id: string, infrastructureTool: InfrastructureTool, documentationUrl?: string | null, cloudResource?: { __typename: 'CloudResource', id: string, provider: CloudResourceProvider, title: string, documentationUrl?: string | null } | null } } } }> }, groupedFixes: { __typename: 'GombocError', code?: GombocErrorCode | null, message: string } | { __typename: 'GroupedFixesSuccess', remediatedFiles: Array<{ __typename: 'GroupedRemediatedFile', path: string, content: string, comments: Array<{ __typename: 'GroupRemediatedFileComment', position: { __typename: 'CodePosition', line: number, column: number }, benchmarkRecommendation: { __typename: 'SecurityBenchmarkRecommendation', id: string, name: string } }> }> } };


export const TestOrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"testOrganization"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Organization"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]} as unknown as DocumentNode<TestOrganizationQuery, TestOrganizationQueryVariables>;
export const SecurityBenchmarksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"securityBenchmarks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"securityBenchmarks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"versions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"recommendations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"identifier"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"isAdopted"}}]}}]}}]}}]}}]} as unknown as DocumentNode<SecurityBenchmarksQuery, SecurityBenchmarksQueryVariables>;
export const IndividualFixesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"individualFixes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"individualFixesInput"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"IndividualFixesInput"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupedFixesInput"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GroupedFixesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"individualFixes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"individualFixesInput"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GombocError"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"IndividualFixesSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"remediations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"benchmarkRecommendation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"identifier"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fixes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"filepath"}},{"kind":"Field","name":{"kind":"Name","value":"oldLine"}},{"kind":"Field","name":{"kind":"Name","value":"newLine"}},{"kind":"Field","name":{"kind":"Name","value":"codePosition"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"column"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lineOffset"}},{"kind":"Field","name":{"kind":"Name","value":"fixType"}}]}},{"kind":"Field","name":{"kind":"Name","value":"codeObservation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"codeResourceInstance"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"filepath"}},{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"codeResource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"infrastructureTool"}},{"kind":"Field","name":{"kind":"Name","value":"documentationUrl"}},{"kind":"Field","name":{"kind":"Name","value":"cloudResource"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"documentationUrl"}}]}}]}}]}}]}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"groupedFixes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupedFixesInput"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GombocError"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"message"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GroupedFixesSuccess"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"remediatedFiles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"line"}},{"kind":"Field","name":{"kind":"Name","value":"column"}}]}},{"kind":"Field","name":{"kind":"Name","value":"benchmarkRecommendation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]}}]}}]}}]} as unknown as DocumentNode<IndividualFixesQuery, IndividualFixesQueryVariables>;