import { z } from 'zod';

export const FixTypeSchema = z.enum(['ADD', 'DELETE', 'UPDATE']);
export type FixType = z.infer<typeof FixTypeSchema>;

export const OrlRuleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().optional(),
    description: z.string().optional(),
    // ORL attribution used by rule extraction/analytics paths.
    orlRuleNames: z.array(z.string()).optional(),
  })
  .passthrough();
export type OrlRule = z.infer<typeof OrlRuleSchema>;

export const CodePositionSchema = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});

export const RemediationFixSchema = z.object({
  filepath: z.string(),
  oldLine: z.union([z.number(), z.string(), z.array(z.string())]).optional(),
  newLine: z.array(z.string()),
  codePosition: CodePositionSchema,
  lineOffset: z.number().int(),
  fixType: FixTypeSchema,
});
export type RemediationFix = z.infer<typeof RemediationFixSchema>;

export const IndividualFixesRemediationSchema = z.object({
  rule: OrlRuleSchema,
  fixes: z.array(RemediationFixSchema),
  codeObservation: z.object({
    codeResourceInstance: z.object({
      name: z.string().optional(),
      type: z.string(),
      filepath: z.string(),
      line: z.number().int().nonnegative(),
    }),
    disposition: z.string(),
  }),
});
export type IndividualFixesRemediation = z.infer<
  typeof IndividualFixesRemediationSchema
>;

export const GroupedFixCommentSchema = z.object({
  position: CodePositionSchema,
  rule: OrlRuleSchema,
});
export type GroupedFixComment = z.infer<typeof GroupedFixCommentSchema>;

export const GroupedFixesRemediationSchema = z.object({
  path: z.string(),
  content: z.string(),
  comments: z.array(GroupedFixCommentSchema),
});
export type GroupedFixesRemediation = z.infer<
  typeof GroupedFixesRemediationSchema
>;

export const FixesSchema = z.object({
  individualFixes: z.array(IndividualFixesRemediationSchema),
  groupedFixes: z.array(GroupedFixesRemediationSchema),
});
export type Fixes = z.infer<typeof FixesSchema>;

export const ScanRemediationPayloadSchema = FixesSchema.extend({
  orlRuleDescriptions: z.record(z.string()).optional(),
  orlRuleShortNames: z.record(z.string()).optional(),
});
export type ScanRemediationPayload = z.infer<typeof ScanRemediationPayloadSchema>;

export function parseScanRemediationPayload(
  payload: unknown,
): ScanRemediationPayload {
  return ScanRemediationPayloadSchema.parse(payload);
}
