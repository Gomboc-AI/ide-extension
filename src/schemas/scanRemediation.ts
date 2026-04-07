import { z } from 'zod';

export const zFixType = z.enum(['ADD', 'DELETE', 'UPDATE']);
export type FixType = z.infer<typeof zFixType>;

export const zOrlRule = z
  .object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().optional(),
    description: z.string().optional(),
    // ORL attribution used by rule extraction/analytics paths.
    orlRuleNames: z.array(z.string()).optional(),
  })
  .passthrough();
export type OrlRule = z.infer<typeof zOrlRule>;

export const zCodePosition = z.object({
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});

export const zRemediationFix = z.object({
  filepath: z.string(),
  oldLine: z.union([z.number(), z.string(), z.array(z.string())]).optional(),
  newLine: z.array(z.string()),
  codePosition: zCodePosition,
  lineOffset: z.number().int(),
  fixType: zFixType,
});
export type RemediationFix = z.infer<typeof zRemediationFix>;

export const zIndividualFixesRemediation = z.object({
  rule: zOrlRule,
  fixes: z.array(zRemediationFix),
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
  typeof zIndividualFixesRemediation
>;

export const zGroupedFixComment = z.object({
  position: zCodePosition,
  rule: zOrlRule,
});
export type GroupedFixComment = z.infer<typeof zGroupedFixComment>;

export const zGroupedFixesRemediation = z.object({
  path: z.string(),
  content: z.string(),
  comments: z.array(zGroupedFixComment),
});
export type GroupedFixesRemediation = z.infer<typeof zGroupedFixesRemediation>;

export const zFixes = z.object({
  individualFixes: z.array(zIndividualFixesRemediation),
  groupedFixes: z.array(zGroupedFixesRemediation),
});
export type Fixes = z.infer<typeof zFixes>;

export const zScanRemediationPayload = zFixes.extend({
  orlRuleDescriptions: z.record(z.string()).optional(),
  orlRuleShortNames: z.record(z.string()).optional(),
});
export type ScanRemediationPayload = z.infer<typeof zScanRemediationPayload>;

export function parseScanRemediationPayload(
  payload: unknown,
): ScanRemediationPayload {
  return zScanRemediationPayload.parse(payload);
}
