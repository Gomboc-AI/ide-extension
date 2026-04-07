import { z } from 'zod';

const zOrlPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const zOrlRuleAnnotations = z.record(z.unknown());
export type OrlRuleAnnotations = z.infer<typeof zOrlRuleAnnotations>;

export const zOrlRuleFile = z
  .object({
    path: z.string().optional(),
  })
  .passthrough();
export type OrlRuleFile = z.infer<typeof zOrlRuleFile>;

export const zOrlRuleMetadata = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    display_name: z.string().optional(),
    displayName: z.string().optional(),
    annotations: zOrlRuleAnnotations.optional(),
    annotation: zOrlRuleAnnotations.optional(),
  })
  .passthrough();
export type OrlRuleMetadata = z.infer<typeof zOrlRuleMetadata>;

export const zOrlRule = z
  .object({
    name: z.string().optional(),
    metadata: zOrlRuleMetadata.optional(),
    fixes: z.union([z.string(), z.number()]).optional(),
    changes: z.union([z.string(), z.number()]).optional(),
    findings: z.union([z.string(), z.number()]).optional(),
    files_changed: z.record(z.unknown()).optional(),
    files: z.array(zOrlRuleFile).optional(),
  })
  .passthrough();
export type OrlRule = z.infer<typeof zOrlRule>;

export const zOrlReportMetadata = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    priority: zOrlPrimitive.optional(),
    skip: z.union([z.boolean(), z.string()]).optional(),
    required_contexts: z.array(z.unknown()).optional(),
    annotations: zOrlRuleAnnotations.optional(),
  })
  .passthrough();
export type OrlReportMetadata = z.infer<typeof zOrlReportMetadata>;

export const zOrlReportSpec = z
  .object({
    metadata: zOrlReportMetadata.optional(),
    workspace: z.string().optional(),
    language: z.string().optional(),
    rules_applied: z.union([z.string(), z.number()]).optional(),
    findings: z.union([z.string(), z.number()]).optional(),
    fixes: z.union([z.string(), z.number()]).optional(),
    changes: z.union([z.string(), z.number()]).optional(),
    errors: z.array(z.unknown()).optional(),
    rules: z.array(zOrlRule).optional(),
  })
  .passthrough();
export type OrlReportSpec = z.infer<typeof zOrlReportSpec>;

export const zOrlReport = z
  .object({
    type: z.literal('Report'),
    spec: zOrlReportSpec.optional(),
    // Some producers flatten fields at the root, so keep these optional.
    metadata: zOrlReportMetadata.optional(),
    workspace: z.string().optional(),
    language: z.string().optional(),
    rules_applied: z.union([z.string(), z.number()]).optional(),
    findings: z.union([z.string(), z.number()]).optional(),
    fixes: z.union([z.string(), z.number()]).optional(),
    changes: z.union([z.string(), z.number()]).optional(),
    errors: z.array(z.unknown()).optional(),
    rules: z.array(zOrlRule).optional(),
  })
  .passthrough();
export type OrlReport = z.infer<typeof zOrlReport>;

export const zCheckovEvidence = z.object({
  ruleName: z.string(),
  source: z.enum(['annotation', 'usecase']),
  key: z.string(),
});
export type CheckovEvidence = z.infer<typeof zCheckovEvidence>;

export function parseOrlReportPayload(payload: unknown): OrlReport | null {
  const parsed = zOrlReport.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
