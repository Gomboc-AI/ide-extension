import { chooseLanguageImplementation } from './languageHandler';
import { DiagnosticContext } from './types';

export interface BuildLanguageDiagnosticContextArgs {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  line: number;
  ruleName?: string;
  message?: string;
  newLines?: string[];
}

/**
 * Coordinates language-specific diagnostic context creation.
 */
export const buildLanguageDiagnosticContext = (
  args: BuildLanguageDiagnosticContextArgs,
): DiagnosticContext => {
  const handler = chooseLanguageImplementation({
    filePath: args.filePath,
    content: args.originalContent,
  });
  return handler.buildDiagnosticContext({
    filePath: args.filePath,
    content: args.originalContent,
    hint: {
      line: args.line,
      ruleName: args.ruleName,
      message: args.message,
      filePath: args.filePath,
      newLines: args.newLines,
    },
  });
};

/**
 * Tries original content first, then falls back to modified content.
 */
export const buildLanguageDiagnosticContextWithFallback = (
  args: BuildLanguageDiagnosticContextArgs,
): DiagnosticContext => {
  const primary = buildLanguageDiagnosticContext(args);
  if (primary.resource || primary.nearestResource) {
    return primary;
  }

  const handler = chooseLanguageImplementation({
    filePath: args.filePath,
    content: args.modifiedContent,
  });
  const fallback = handler.buildDiagnosticContext({
    filePath: args.filePath,
    content: args.modifiedContent,
    hint: {
      line: args.line,
      ruleName: args.ruleName,
      message: args.message,
      filePath: args.filePath,
      newLines: args.newLines,
    },
  });

  return {
    ...fallback,
    fallbackResource: !(fallback.resource || fallback.nearestResource),
  };
};
