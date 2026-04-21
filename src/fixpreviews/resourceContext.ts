import { buildLanguagePreviewResourceContexts } from '../generics/languagePreviewContextOrchestrator';
import { DiffHunk } from './diffRender';
import { PreviewResourceContext } from '../generics/types';

export type ResourceContext = PreviewResourceContext;

/**
 * Back-compat wrapper while fix preview call-sites migrate to generics orchestrators.
 */
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
