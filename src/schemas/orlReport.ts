import { z } from 'zod';

/** Coerces YAML FAILSAFE numeric scalars (often strings) into non-negative integers. */
const zOrlCount = z
  .union([z.string(), z.number()])
  .transform((value) => {
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
  .transform((value) => {
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
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  })
  .pipe(z.boolean());

export const zFindingLocation = z.object({
  id: z.string(),
  filePath: z.string(),
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0).optional(),
  startColumn: z.number().int().min(0),
  endColumn: z.number().int().min(0).optional(),
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

export const zOrlRule = z
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
export type OrlRule = z.infer<typeof zOrlRule>;

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

export const zOrlReport = zORLReportContent.extend({
  spec: zOrlReportSpec.optional(),
}).passthrough();
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
