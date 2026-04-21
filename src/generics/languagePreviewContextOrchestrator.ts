import { buildPreviewResourceContexts } from './previewResourceContextBuilder';
import {
  findMatchingLanguageImplementation,
  getResourceContextExtractKind,
} from './languageHandler';
import { PreviewContextHunk, PreviewResourceContext } from './types';

export interface BuildLanguagePreviewResourceContextsArgs {
  filePath: string;
  content: string;
  hunks: PreviewContextHunk[];
  maxContexts?: number;
  maxLinesPerContext?: number;
}

/**
 * Coordinates language-specific preview context creation.
 */
export const buildLanguagePreviewResourceContexts = (
  args: BuildLanguagePreviewResourceContextsArgs,
): PreviewResourceContext[] => {
  const handler = findMatchingLanguageImplementation({
    filePath: args.filePath,
    content: args.content,
  });
  if (!handler) {
    return buildPreviewResourceContexts({
      filePath: args.filePath,
      content: args.content,
      hunks: args.hunks,
      maxContexts: args.maxContexts,
      maxLinesPerContext: args.maxLinesPerContext,
      kind: getResourceContextExtractKind({
        filePath: args.filePath,
        content: args.content,
      }),
    });
  }

  return handler.buildPreviewResourceContexts({
    filePath: args.filePath,
    content: args.content,
    hunks: args.hunks,
    maxContexts: args.maxContexts,
    maxLinesPerContext: args.maxLinesPerContext,
  });
};
