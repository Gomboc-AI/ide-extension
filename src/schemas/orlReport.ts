import { z } from 'zod';

/** FAILSAFE_SCHEMA parses YAML booleans as strings; coerce those explicitly. */
const zOrlBoolean = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    return Boolean(value);
  });

/** FAILSAFE_SCHEMA represents YAML null as the string "null", not JavaScript null. */
const nullishToUndefined = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') {
    return undefined;
  }
  return value;
};

const zOrlCount = z.preprocess(
  nullishToUndefined,
  z.coerce.number().int().nonnegative().optional(),
);

const zOrlPriority = z.preprocess(
  nullishToUndefined,
  z.coerce.number().int().optional(),
);

const zOrlHookInvocation = z.object({
  command_path: z.string().optional(),
  args: z.array(z.union([z.string(), z.number()])).optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exit_code: z.coerce.number().int().optional(),
});

const zOrlHooks = z.record(z.string(), zOrlHookInvocation);

const zOrlFileRef = z.object({
  path: z.string(),
});

const zOrlRuleAnnotations = z.record(z.string(), z.string());

const zOrlRuleMetadata = z.object({
  name: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  priority: zOrlPriority.optional(),
  skip: zOrlBoolean.optional(),
  annotations: zOrlRuleAnnotations.optional(),
  classifications: z.array(z.string()).optional(),
});

export type OrlRuleMetadata = z.infer<typeof zOrlRuleMetadata>;

const zFindingLocationSnake = z.object({
  id: z.string().optional(),
  file_path: z.string().optional(),
  start_line: zOrlCount.optional(),
  end_line: zOrlCount.optional(),
  start_column: zOrlCount.optional(),
  end_column: zOrlCount.optional(),
});

export type FindingLocation = {
  id?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
};

const zFindingLocationRowSnake = z.object({
  id: z.string().optional(),
  original_location: zFindingLocationSnake.optional(),
  resolved_location: zFindingLocationSnake.optional(),
  resolution_status: z.string().optional(),
});

export type FindingLocationRow = {
  id?: string;
  originalLocation?: FindingLocation;
  resolvedLocation?: FindingLocation;
  resolutionStatus?: string;
};

const toFindingLocation = (
  loc: z.infer<typeof zFindingLocationSnake> | undefined,
): FindingLocation | undefined => {
  if (!loc) {
    return undefined;
  }
  return {
    id: loc.id,
    filePath: loc.file_path,
    startLine: loc.start_line,
    endLine: loc.end_line,
    startColumn: loc.start_column,
    endColumn: loc.end_column,
  };
};

const toFindingLocationRow = (
  row: z.infer<typeof zFindingLocationRowSnake>,
): FindingLocationRow => ({
  id: row.id,
  originalLocation: toFindingLocation(row.original_location),
  resolvedLocation: toFindingLocation(row.resolved_location),
  resolutionStatus: row.resolution_status,
});

const zOrlRuleSnake = z.object({
  name: z.string().optional(),
  metadata: zOrlRuleMetadata.optional(),
  findings: zOrlCount.optional(),
  fixes: zOrlCount.optional(),
  changes: zOrlCount.optional(),
  skipped: zOrlBoolean.optional(),
  error_count: zOrlCount.optional(),
  errors: z.array(z.unknown()).optional(),
  duration: z.string().optional(),
  files: z.array(zOrlFileRef).optional(),
  file_count: zOrlCount.optional(),
  paths_with_findings: z.record(z.string(), z.unknown()).optional(),
  files_changed: z.record(z.string(), z.unknown()).optional(),
  hooks: zOrlHooks.optional(),
  finding_locations: z.array(zFindingLocationRowSnake).optional(),
});

export type OrlRule = {
  name?: string;
  metadata?: OrlRuleMetadata;
  findings?: number;
  fixes?: number;
  changes?: number;
  skipped?: boolean;
  error_count?: number;
  errors?: unknown[];
  duration?: string;
  files?: { path: string }[];
  file_count?: number;
  paths_with_findings?: Record<string, unknown>;
  files_changed?: Record<string, unknown>;
  hooks?: Record<string, z.infer<typeof zOrlHookInvocation>>;
  findingLocations?: FindingLocationRow[];
};

const zOrlRule = zOrlRuleSnake.transform(
  (rule): OrlRule => ({
    name: rule.name,
    metadata: rule.metadata,
    findings: rule.findings,
    fixes: rule.fixes,
    changes: rule.changes,
    skipped: rule.skipped,
    error_count: rule.error_count,
    errors: rule.errors,
    duration: rule.duration,
    files: rule.files,
    file_count: rule.file_count,
    paths_with_findings: rule.paths_with_findings,
    files_changed: rule.files_changed,
    hooks: rule.hooks,
    findingLocations: rule.finding_locations?.map(toFindingLocationRow),
  }),
);

export const zOrlReportMetadata = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  priority: zOrlPriority.optional(),
  skip: zOrlBoolean.optional(),
  annotations: z.record(z.string(), z.string()).optional(),
});

export type OrlReportMetadata = z.infer<typeof zOrlReportMetadata>;

export const zOrlReportSpec = z.object({
  workspace: z.string().optional(),
  language: z.string().optional(),
  duration: z.string().optional(),
  error_count: zOrlCount.optional(),
  errors: z.array(z.unknown()).optional(),
  files_changed: z.record(z.string(), z.unknown()).optional(),
  findings: zOrlCount.optional(),
  fixes: zOrlCount.optional(),
  changes: zOrlCount.optional(),
  hooks: zOrlHooks.optional(),
  resolved_location_count: zOrlCount.optional(),
  rules_applied: zOrlCount.optional(),
  rules_skipped: zOrlCount.optional(),
  rules: z.array(zOrlRule).optional(),
});

export type OrlReportSpec = z.infer<typeof zOrlReportSpec>;

export const zOrlReport = z.object({
  type: z.literal('Report'),
  version: z.literal('v1'),
  metadata: zOrlReportMetadata.optional(),
  spec: zOrlReportSpec,
});

export type OrlReport = z.output<typeof zOrlReport>;

/** @deprecated Use OrlRule */
export type ORLReportRule = OrlRule;

export type OrlRuleAnnotations = OrlRuleMetadata['annotations'];

export const zCheckovEvidence = z.object({
  ruleName: z.string(),
  source: z.enum(['annotation', 'usecase']),
  key: z.string(),
});
export type CheckovEvidence = z.infer<typeof zCheckovEvidence>;

export function getOrlReportRules(report: OrlReport): OrlRule[] {
  return report.spec.rules ?? [];
}

export function parseOrlReportPayload(payload: unknown): OrlReport | null {
  const parsed = zOrlReport.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function selectScanDiagnosticLocation(
  row: FindingLocationRow,
): FindingLocation | undefined {
  if (row.resolutionStatus === 'deleted') {
    return undefined;
  }
  return row.originalLocation;
}

export function toExtensionLine(line: number | undefined): number {
  if (typeof line !== 'number' || !Number.isFinite(line) || line < 1) {
    return 1;
  }
  return line;
}

export type ExtractedFindingLocation = {
  ruleName: string;
  findingId: string;
  actualFilePath: string;
  location: FindingLocation;
};

export function extractFindingLocationsFromReport(args: {
  report: OrlReport | null | undefined;
  currentFilePath: string;
}): ExtractedFindingLocation[] {
  const { report, currentFilePath } = args;
  if (!report) {
    return [];
  }

  const out: ExtractedFindingLocation[] = [];
  for (const rule of getOrlReportRules(report)) {
    const ruleName = rule.name?.trim();
    if (!ruleName) {
      continue;
    }

    const rows = rule.findingLocations ?? [];
    for (const row of rows) {
      const location = selectScanDiagnosticLocation(row);
      if (!location?.filePath) {
        continue;
      }

      const findingId = row.id?.trim() || location.id?.trim();
      if (!findingId) {
        continue;
      }

      const normalizedReportPath = location.filePath.replace(/\\/g, '/');
      const normalizedCurrentPath = currentFilePath.replace(/\\/g, '/');
      const reportBasename = normalizedReportPath.split('/').pop() ?? '';
      const currentBasename = normalizedCurrentPath.split('/').pop() ?? '';
      const pathsMatch =
        normalizedReportPath === normalizedCurrentPath ||
        normalizedReportPath.endsWith(`/${currentBasename}`) ||
        normalizedCurrentPath.endsWith(`/${reportBasename}`);

      if (!pathsMatch) {
        continue;
      }

      out.push({
        ruleName,
        findingId,
        actualFilePath: currentFilePath,
        location,
      });
    }
  }

  return out;
}
