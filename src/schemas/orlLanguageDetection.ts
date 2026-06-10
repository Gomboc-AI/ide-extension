import * as path from 'path';
import { z } from 'zod';

export const zOrlDetectedLanguage = z.object({
  name: z.string(),
  recursionDefault: z.boolean(),
  ruleSpaceRuleCount: z.number(),
});
export type OrlDetectedLanguage = z.infer<typeof zOrlDetectedLanguage>;

export const zOrlLanguageDetectionMap = z.record(
  z.string(),
  z.array(zOrlDetectedLanguage),
);
export type OrlLanguageDetectionMap = z.infer<typeof zOrlLanguageDetectionMap>;

/** Maps ORL language names to file extensions used for disambiguation. */
export const ORL_LANGUAGE_FILE_EXTENSIONS: Record<string, string[]> = {
  bicep: ['.bicep'],
  terraform: ['.tf', '.hcl'],
  hcl: ['.hcl', '.tf'],
  helm: ['.yaml', '.yml', '.tpl'],
  kubernetes: ['.yaml', '.yml'],
  cloudformation: ['.yaml', '.yml', '.json'],
  yaml: ['.yaml', '.yml'],
  json: ['.json'],
  dockerfile: ['dockerfile'],
  xml: ['.xml', '.pom'],
  gradle: ['.gradle', '.kts'],
  java: ['.java'],
  kotlin: ['.kt', '.kts'],
  groovy: ['.groovy'],
  javascript: ['.js', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx'],
  python: ['.py'],
  go: ['.go'],
  bash: ['.sh', '.bash'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
  c: ['.c', '.h'],
  csharp: ['.cs'],
  css: ['.css'],
  elixir: ['.ex', '.exs'],
  gotemplate: ['.tmpl', '.tpl'],
  html: ['.html', '.htm'],
  lua: ['.lua'],
  markdown: ['.md', '.markdown'],
  ocaml: ['.ml', '.mli'],
  php: ['.php'],
  protobuf: ['.proto'],
  ruby: ['.rb'],
  rust: ['.rs'],
  scala: ['.scala'],
  sql: ['.sql'],
  swift: ['.swift'],
  toml: ['.toml'],
};

/** Lightweight extension allowlist for scan-on-save gating (no Docker). */
export const ORL_SCOPABLE_EXTENSIONS = new Set(
  Object.values(ORL_LANGUAGE_FILE_EXTENSIONS)
    .flat()
    .map(ext => ext.toLowerCase()),
);

export function parseOrlLanguageDetectionMap(
  payload: unknown,
): OrlLanguageDetectionMap | null {
  const parsed = zOrlLanguageDetectionMap.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const matchesLanguageForFile = (args: {
  languageName: string;
  filePath: string;
}): boolean => {
  const ext = path.extname(args.filePath).toLowerCase();
  const base = path.basename(args.filePath).toLowerCase();
  const extensions =
    ORL_LANGUAGE_FILE_EXTENSIONS[args.languageName.toLowerCase()];
  if (!extensions?.length) {
    return false;
  }
  return extensions.some(candidate => {
    const normalized = candidate.toLowerCase();
    if (normalized.startsWith('.')) {
      return ext === normalized;
    }
    return base === normalized;
  });
};

/**
 * Resolves the ORL CLI language for a scan scope from a detect-language map.
 * Lookup uses the "." key (scan root is always the directory containing the file).
 */
export const resolveScopeLanguage = (args: {
  map: OrlLanguageDetectionMap;
  activeFilePath?: string;
}): string | null => {
  const languages = args.map['.'];
  if (!Array.isArray(languages) || languages.length === 0) {
    return null;
  }
  if (languages.length === 1) {
    return languages[0].name;
  }

  const activeFilePath = (args.activeFilePath || '').trim();
  if (activeFilePath) {
    const matched = languages.filter(lang =>
      matchesLanguageForFile({
        languageName: lang.name,
        filePath: activeFilePath,
      }),
    );
    if (matched.length === 1) {
      return matched[0].name;
    }
    if (matched.length > 1) {
      return pickHighestRuleCount(matched).name;
    }
  }

  return pickHighestRuleCount(languages).name;
};

const pickHighestRuleCount = (
  languages: OrlDetectedLanguage[],
): OrlDetectedLanguage => {
  return languages.reduce((best, current) =>
    current.ruleSpaceRuleCount > best.ruleSpaceRuleCount ? current : best,
  );
};

/** True when a file path looks like it may belong to an ORL-scannable language. */
export const isOrlScopableFilePath = (filePath: string): boolean => {
  const trimmed = (filePath || '').trim();
  if (!trimmed) {
    return false;
  }
  const ext = path.extname(trimmed).toLowerCase();
  if (ext && ORL_SCOPABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  const base = path.basename(trimmed).toLowerCase();
  return ORL_SCOPABLE_EXTENSIONS.has(base);
};

/** Skip hidden entries and known non-IaC dirs when staging workspace files for ORL. */
export const shouldSkipOrlStagingEntry = (name: string): boolean => {
  const lower = (name || '').trim().toLowerCase();
  if (!lower || lower.startsWith('.')) {
    return true;
  }
  return lower === 'node_modules';
};
