import { z } from 'zod';
import { PathConverter } from '../utils/pathConverter';

/** FAILSAFE YAML loads unquoted numbers as strings (e.g. fixes: "3"). */
const zOrlCount = z.coerce.number().int().min(0);
const zOrlLineIndex = z.coerce.number().int().min(0);
const zOrlPriority = z.coerce.number().int();

/**
 * FAILSAFE YAML loads booleans as strings too (e.g. skip: "false").
 * Do not use z.coerce.boolean() here — it treats any non-empty string as true.
 */
const zOrlBoolean = z.union([z.boolean(), z.string()]).transform(value => {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
});

const zResolutionStatus = z.enum([
  'unchanged',
  'shifted',
  'deleted',
  'invalidated',
]);

const zFindingLocationShape = z.object({
  id: z.string(),
  filePath: z.string().min(1),
  startLine: zOrlLineIndex,
  endLine: zOrlLineIndex.optional(),
  startColumn: zOrlLineIndex,
  endColumn: zOrlLineIndex.optional(),
});
export type FindingLocation = z.infer<typeof zFindingLocationShape>;

/** ORL emits snake_case location fields; normalize to camelCase for extension code. */
const zFindingLocationSnake = z
  .object({
    id: z.string(),
    file_path: z.string(),
    start_line: zOrlLineIndex.optional(),
    end_line: zOrlLineIndex.optional(),
    start_column: zOrlLineIndex.optional(),
    end_column: zOrlLineIndex.optional(),
  })
  .transform(row => ({
    id: row.id,
    filePath: row.file_path,
    startLine: row.start_line ?? 0,
    startColumn: row.start_column ?? 0,
    ...(row.end_line !== undefined ? { endLine: row.end_line } : {}),
    ...(row.end_column !== undefined ? { endColumn: row.end_column } : {}),
  }))
  .pipe(zFindingLocationShape);

const zFindingLocationRowShape = z.object({
  id: z.string(),
  originalLocation: zFindingLocationShape.optional(),
  resolvedLocation: zFindingLocationShape.optional(),
  resolutionStatus: zResolutionStatus.optional(),
});
export type FindingLocationRow = z.infer<typeof zFindingLocationRowShape>;

/** ORL emits snake_case finding-location rows; normalize to camelCase for extension code. */
export const zFindingLocationRow = z
  .object({
    id: z.string(),
    original_location: zFindingLocationSnake.optional(),
    resolved_location: zFindingLocationSnake.optional(),
    resolution_status: zResolutionStatus.optional(),
  })
  .transform(row => ({
    id: row.id,
    ...(row.original_location
      ? { originalLocation: row.original_location }
      : {}),
    ...(row.resolved_location
      ? { resolvedLocation: row.resolved_location }
      : {}),
    ...(row.resolution_status
      ? { resolutionStatus: row.resolution_status }
      : {}),
  }))
  .pipe(zFindingLocationRowShape);

export const zOrlRuleAnnotations = z.record(z.string(), z.string());
export type OrlRuleAnnotations = z.infer<typeof zOrlRuleAnnotations>;

export const zOrlRuleFile = z.object({
  path: z.string(),
});
export type OrlRuleFile = z.infer<typeof zOrlRuleFile>;

export const zOrlRuleMetadata = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  priority: zOrlPriority.optional(),
  skip: zOrlBoolean.optional(),
  required_contexts: z.array(z.string()).optional(),
  annotations: zOrlRuleAnnotations.optional(),
  classifications: z.array(z.string()).optional(),
  // Legacy report fields still emitted by some ORL versions.
  display_name: z.string().optional(),
  displayName: z.string().optional(),
  annotation: z.record(z.string(), z.unknown()).optional(),
});
export type OrlRuleMetadata = z.infer<typeof zOrlRuleMetadata>;

const zOrlRuleSnake = z.object({
  metadata: zOrlRuleMetadata.optional(),
  name: z.string().optional(),
  findings: zOrlCount.optional(),
  fixes: zOrlCount.optional(),
  changes: zOrlCount.optional(),
  errors: z.array(z.unknown()).optional(),
  files: z.array(zOrlRuleFile).optional(),
  finding_locations: z.array(zFindingLocationRow).optional(),
  files_changed: z.record(z.unknown()).optional(),
});

export type OrlRule = Omit<
  z.infer<typeof zOrlRuleSnake>,
  'finding_locations'
> & {
  findingLocations?: FindingLocationRow[];
};

export const zOrlRule = zOrlRuleSnake
  .passthrough()
  .transform((rule): OrlRule => {
    const { finding_locations, ...rest } = rule;
    const output: OrlRule = rest;
    if (finding_locations?.length) {
      output.findingLocations = finding_locations;
    }
    return output;
  });

/** Canonical name aligned with ORL report producer schema. */
export const zORLReportRule = zOrlRule;
export type ORLReportRule = OrlRule;

export const zOrlReportMetadata = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  priority: zOrlPriority.optional(),
  skip: zOrlBoolean.optional(),
  required_contexts: z.array(z.string()).optional(),
  annotations: zOrlRuleAnnotations.optional(),
});
export type OrlReportMetadata = z.infer<typeof zOrlReportMetadata>;

const zOrlReportBody = z.object({
  version: z.literal('v1').optional(),
  metadata: zOrlReportMetadata.optional(),
  workspace: z.string().optional(),
  language: z.string().optional(),
  rules_applied: zOrlCount.optional(),
  findings: zOrlCount.optional(),
  fixes: zOrlCount.optional(),
  changes: zOrlCount.optional(),
  errors: z.array(z.unknown()).optional(),
  rules: z.array(zOrlRule).optional(),
});

export const zORLReportContent = zOrlReportBody.extend({
  type: z.literal('Report'),
});
export type OrlReportContent = z.infer<typeof zORLReportContent>;

/** Legacy nested shape: fields under `spec` instead of the report root. */
export const zOrlReportSpec = zOrlReportBody.passthrough();
export type OrlReportSpec = z.infer<typeof zOrlReportSpec>;

export const zOrlReport = zORLReportContent
  .extend({
    spec: zOrlReportSpec.optional(),
  })
  .passthrough();
export type OrlReport = z.output<typeof zOrlReport>;

export const zCheckovEvidence = z.object({
  ruleName: z.string(),
  source: z.enum(['annotation', 'usecase']),
  key: z.string(),
});
export type CheckovEvidence = z.infer<typeof zCheckovEvidence>;

/** Returns rules from the flat v1 report body or legacy `spec.rules`. */
export function getOrlReportRules(report: OrlReport): OrlRule[] {
  if (Array.isArray(report.rules)) {
    return report.rules;
  }
  if (Array.isArray(report.spec?.rules)) {
    return report.spec.rules;
  }
  return [];
}

export function parseOrlReportPayload(payload: unknown): OrlReport | null {
  const parsed = zOrlReport.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** Flattened finding row with resolved local file path. */
export type ReportFindingLocation = {
  ruleName: string;
  findingId: string;
  location: FindingLocation;
  actualFilePath: string;
};

/** Returns `originalLocation` for scan diagnostics; skips only `deleted` rows. */
export function selectScanDiagnosticLocation(
  row: FindingLocationRow,
): FindingLocation | undefined {
  if (row.resolutionStatus === 'deleted') {
    return undefined;
  }
  return row.originalLocation;
}

/** ORL report line numbers are already 1-based; clamp to a valid editor line. */
export function toExtensionLine(line1Based: number): number {
  if (!Number.isFinite(line1Based)) {
    return 1;
  }
  return Math.max(1, Math.floor(line1Based));
}

/** Extracts scannable finding locations from a parsed ORL report. */
export function extractFindingLocationsFromReport(args: {
  report: OrlReport | null | undefined;
  currentFilePath: string;
}): ReportFindingLocation[] {
  const report = args.report;
  if (!report) {
    return [];
  }

  const out: ReportFindingLocation[] = [];
  for (const rule of getOrlReportRules(report)) {
    const ruleName =
      (typeof rule.name === 'string' && rule.name.trim()) ||
      (typeof rule.metadata?.name === 'string' && rule.metadata.name.trim()) ||
      '';
    if (!ruleName) {
      continue;
    }

    for (const row of rule.findingLocations || []) {
      const location = selectScanDiagnosticLocation(row);
      if (!location) {
        continue;
      }
      out.push({
        ruleName,
        findingId: row.id,
        location,
        actualFilePath: PathConverter.convertOrlPathToActualPath(
          location.filePath,
          args.currentFilePath,
        ),
      });
    }
  }

  return out;
}
