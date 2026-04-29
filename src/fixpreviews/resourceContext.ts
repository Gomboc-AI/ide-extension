import {
  buildLanguagePreviewResourceContexts,
  PreviewResourceContext,
} from '@gomboc-ai/gomboc-node-sdk';
import { DiffHunk } from './diffRender';

export type ResourceContext = PreviewResourceContext;

/** Back-compat wrapper around SDK language preview orchestrators. */
export function extractResourceContexts(args: {
  filePath: string;
  text: string;
  hunks: DiffHunk[];
  maxContexts?: number;
  maxLinesPerContext?: number;
}): ResourceContext[] {
  return buildLanguagePreviewResourceContexts({
    filePath: args.filePath,
    content: args.text,
    hunks: args.hunks,
    maxContexts: args.maxContexts,
    maxLinesPerContext: args.maxLinesPerContext,
  });
}
