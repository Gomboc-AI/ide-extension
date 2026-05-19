export type IntegrationsRuntimeConfig = {
  integrationsServiceUrl: string | undefined;
  apiKey: string | undefined;
  orlFixAppliedAnalyticsEnabled: boolean;
};

export type OrlResult = {
  success: boolean;
  modifiedFiles: Record<string, string>;
  report?: string;
  error?: string;
  exitCode?: number;
};

export type OrlRule = {
  findings?: string | number;
  fixes?: string | number;
  changes?: string | number;
  [key: string]: unknown;
};

export type OrlReportMetadata = {
  name?: string;
  description?: string;
  priority?: string | number | boolean | null;
  skip?: string | boolean;
  required_contexts?: unknown[];
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
};

export type OrlReportSpec = {
  metadata?: OrlReportMetadata;
  workspace?: string;
  language?: string;
  rules_applied?: string | number;
  findings?: string | number;
  fixes?: string | number;
  changes?: string | number;
  errors?: unknown[];
  rules?: OrlRule[];
  [key: string]: unknown;
};

export type OrlReport = {
  type: 'Report';
  spec?: OrlReportSpec;
  metadata?: OrlReportMetadata;
  workspace?: string;
  language?: string;
  rules_applied?: string | number;
  findings?: string | number;
  fixes?: string | number;
  changes?: string | number;
  errors?: unknown[];
  rules?: OrlRule[];
  [key: string]: unknown;
};

export type IntegrationsServiceConfig<T> = {
  getIntegrationsConfig: () => IntegrationsRuntimeConfig;
  eventStore: IntegrationsEventStore<T>;
};

export type IntegrationsEventStore<T> = {
  loadQueue: () => Promise<T[]>;
  saveQueue: (items: T[]) => Promise<void>;
  loadSentMap: () => Promise<Record<string, number>>;
  saveSentMap: (sent: Record<string, number>) => Promise<void>;
};

export type OrlFixAppliedEventV1 = {
  type: 'orl_fix_applied';
  idempotencyKey: string;
  occurredAt: string;
  fixKind: 'individual' | 'grouped';
  ruleNames: string[];
  ruleIdentifiers: string[];
  filePaths: string[];
  repoPath?: string;
  branch?: string;
  repoRelativeDir?: string;
  reportGeneratedAt?: string;
};

export type OrlFixAppliedEventQueueItemV1 = {
  event: OrlFixAppliedEventV1;
  attempts: number;
  nextAttemptAt: number;
};

export type NormalizedOrlReport = {
  type: 'Report';
  version: 'v1';
  metadata: {
    name: string;
    description?: string;
    priority?: number;
    skip?: boolean;
    required_contexts: string[];
    annotations: Record<string, string>;
  };
  workspace: string;
  language: string;
  rules_applied: number;
  findings: number;
  fixes: number;
  changes: number;
  errors: string[];
  rules: [];
};

export type IntegrationsRequestBody = {
  version: number;
  requestOrigin: string;
  effect: string;
  reports: Array<{
    path?: string;
    branch?: string;
    orlReport: NormalizedOrlReport;
  }>;
  errors: Array<{ status: number; message: string }>;
};

export type IntegrationsErrorRequestBody = {
  version: number;
  requestOrigin: string;
  effect: string;
  reports: Array<{
    path?: string;
    branch?: string;
  }>;
  errors: Array<{ status: number; message: string }>;
};

export type QueueOrlFixAppliedEventInput = Omit<
  OrlFixAppliedEventV1,
  'idempotencyKey' | 'occurredAt' | 'type'
>;

export type PrepareRequestBodyArgs = {
  orlReport: NormalizedOrlReport;
  repoPath: string | null;
  branch: string | null;
  result: OrlResult;
};
