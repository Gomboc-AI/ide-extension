import { z } from 'zod';
import { zORLReportContent } from './orlReport';

export const zReportPayloadWorkflowStatus = z.object({
  status: z.enum(['success', 'failure']),
  errors: z.array(z.string()),
});
export type ReportPayloadWorkflowStatus = z.infer<
  typeof zReportPayloadWorkflowStatus
>;

export const zReportPayloadWorkflowMetadata = z.object({
  workflowId: z.string(),
  rootRunNodeId: z.string(),
  workspaceId: z.string().optional(), // TODO: make optional uuidv4 to complete DEV-4209
  scmRepositoryId: z.string().uuid().optional(), // TODO: make required to complete DEV-4209
  accountId: z.string(),
});
export type ReportPayloadWorkflowMetadata = z.infer<
  typeof zReportPayloadWorkflowMetadata
>;

export const zReportPayload = z.object({
  workflowStatus: zReportPayloadWorkflowStatus,
  assignedRunNodeId: z.string(),
  gitDiff: z.record(z.string(), z.string()), // filename -> base64 patch
  remediatedFileContent: z.record(z.string(), z.string()), // filename -> base64 content
  orlReport: zORLReportContent.optional(),
  workflowMetadata: zReportPayloadWorkflowMetadata,
});
export type ReportPayload = z.infer<typeof zReportPayload>;

export function parseReportPayload(payload: unknown): ReportPayload | null {
  const parsed = zReportPayload.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
