import { z } from 'zod';
import { PathConverter } from '../utils/pathConverter';

/** Coerces YAML FAILSAFE numeric scalars (often strings) into non-negative integers. */
const zOrlCount = z
  .union([z.string(), z.number()])
  .transform(value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  })
  .pipe(z.number().int().min(0));

/** Coerces YAML FAILSAFE priority scalars (often strings) into integers. */
const zOrlPriority = z
  .union([z.string(), z.number()])
  .transform(value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value);
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  })
  .pipe(z.number().int());

/** Coerces YAML FAILSAFE booleans (often "true"/"false" strings). */
const zOrlBoolean = z
  .union([z.boolean(), z.string()])
  .transform(value => {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  })
  .pipe(z.boolean());

const zOrlLineIndex = z
  .union([z.string(), z.number()])
  .transform(value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  })
  .pipe(z.number().int().min(0));

export const zFindingLocation = z.object({
  id: z.string(),
  filePath: z.string(),
  startLine: zOrlLineIndex,
  endLine: zOrlLineIndex.optional(),
  startColumn: zOrlLineIndex,
  endColumn: zOrlLineIndex.optional(),
});
export type FindingLocation = z.infer<typeof zFindingLocation>;

export const zFindingLocationRow = z.object({
  id: z.string(),
  originalLocation: zFindingLocation.optional(),
  resolvedLocation: zFindingLocation.optional(),
  resolutionStatus: z
    .enum(['unchanged', 'shifted', 'deleted', 'invalidated'])
    .optional(),
});
export type FindingLocationRow = z.infer<typeof zFindingLocationRow>;

/** Normalizes ORL report location objects that may use snake_case keys. */
const normalizeFindingLocationFields = (
  raw: unknown,
): Record<string, unknown> | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  const id = row.id;
  const filePath = row.filePath ?? row.file_path;
  if (typeof id !== 'string' || typeof filePath !== 'string') {
    return undefined;
  }
  return {
    id,
    filePath,
    startLine: row.startLine ?? row.start_line,
    endLine: row.endLine ?? row.end_line,
    startColumn: row.startColumn ?? row.start_column,
    endColumn: row.endColumn ?? row.end_column,
  };
};

/** Normalizes ORL report finding location rows that may use snake_case keys. */
const normalizeFindingLocationRowFields = (
  raw: unknown,
): Record<string, unknown> | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string') {
    return undefined;
  }
  const originalLocation = normalizeFindingLocationFields(
    row.originalLocation ?? row.original_location,
  );
  const resolvedLocation = normalizeFindingLocationFields(
    row.resolvedLocation ?? row.resolved_location,
  );
  const resolutionStatus = row.resolutionStatus ?? row.resolution_status;
  return {
    id: row.id,
    ...(originalLocation ? { originalLocation } : {}),
    ...(resolvedLocation ? { resolvedLocation } : {}),
    ...(typeof resolutionStatus === 'string' ? { resolutionStatus } : {}),
  };
};

/** Merges snake_case `finding_locations` into canonical `findingLocations`. */
const normalizeOrlRuleFindingLocations = (rule: OrlRule): OrlRule => {
  const extra = rule as OrlRule & { finding_locations?: unknown[] };
  if (
    Array.isArray(rule.findingLocations) &&
    rule.findingLocations.length > 0
  ) {
    return rule;
  }
  if (!Array.isArray(extra.finding_locations)) {
    return rule;
  }
  const rows = extra.finding_locations
    .map(normalizeFindingLocationRowFields)
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const parsed = z.array(zFindingLocationRow).safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) {
    return rule;
  }
  return { ...rule, findingLocations: parsed.data };
};

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

const zOrlRuleBase = z
  .object({
    metadata: zOrlRuleMetadata.optional(),
    name: z.string().optional(),
    findings: zOrlCount.optional(),
    fixes: zOrlCount.optional(),
    changes: zOrlCount.optional(),
    errors: z.array(z.unknown()).optional(),
    files: z.array(zOrlRuleFile).optional(),
    findingLocations: z.array(zFindingLocationRow).optional(),
    // Legacy: full-format reports map changed files here instead of findingLocations.
    files_changed: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const zOrlRule = zOrlRuleBase.transform(
  normalizeOrlRuleFindingLocations,
);
export type OrlRule = z.infer<typeof zOrlRuleBase>;

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
export type OrlReport = z.infer<typeof zOrlReport>;

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
