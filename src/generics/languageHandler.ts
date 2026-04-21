/**
 * Handles deciding which language we are going to use
 */

import path from 'path';
import type { ResourceContextExtractKind } from './types';
import { ILanguageHandler } from './types';
import {
  TerraformLanguageHandler,
  CloudFormationYAMLLanguageHandler,
  CloudFormationJSONLanguageHandler,
  DockerfileLanguageHandler,
  KubernetesYAMLLanguageHandler,
  HelmTemplateLanguageHandler,
  MavenXMLLanguageHandler,
  GradleLanguageHandler,
  NpmPackageJSONLanguageHandler,
  JavaLanguageHandler,
  BicepLanguageHandler,
  PythonLanguageHandler,
} from './languageHandlers';

export interface LanguageSelectionArgs {
  filePath: string;
  content: string;
}

const languageHandlerFactories: Array<() => ILanguageHandler> = [
  () => new DockerfileLanguageHandler(),
  () => new TerraformLanguageHandler(),
  () => new HelmTemplateLanguageHandler(),
  () => new NpmPackageJSONLanguageHandler(),
  () => new CloudFormationJSONLanguageHandler(),
  () => new KubernetesYAMLLanguageHandler(),
  () => new CloudFormationYAMLLanguageHandler(),
  () => new MavenXMLLanguageHandler(),
  () => new GradleLanguageHandler(),
  () => new JavaLanguageHandler(),
  () => new BicepLanguageHandler(),
  () => new PythonLanguageHandler(),
];

function findMatchingLanguageHandler(
  args: LanguageSelectionArgs,
): ILanguageHandler | null {
  for (const createHandler of languageHandlerFactories) {
    const handler = createHandler();
    if (handler.detectLanguage(args)) {
      return handler;
    }
  }

  return null;
}

/**
 * Detects the most likely language id for a file path + content pair.
 *
 * Resolution is first-match against {@link languageHandlerFactories} (see that array for
 * the canonical order). Order matters where extensions overlap: e.g. YAML can be Helm,
 * Kubernetes, or CloudFormation; JSON can be npm package manifests or CloudFormation. More
 * specific handlers must run before broader fallbacks.
 *
 * Order: dockerfile → terraform → helm-template → npm-package-json → cloudformation-json →
 * kubernetes-yaml → cloudformation-yaml → maven-xml → gradle → java → bicep → python.
 */
export const detectLanguageId = (
  args: LanguageSelectionArgs,
): string | null => {
  const handler = findMatchingLanguageHandler(args);
  if (!handler) {
    return null;
  }

  return handler.getDocumentInfo(args).languageId;
};

export const chooseLanguageImplementation = (
  args: LanguageSelectionArgs,
): ILanguageHandler => {
  const handler = findMatchingLanguageHandler(args);
  return handler || new TerraformLanguageHandler();
};

/**
 * Maps internal language IDs to ORL CLI language values.
 */
export const mapLanguageIdToOrlLanguage = (args: {
  languageId: string;
  filePath: string;
}): string | null => {
  const languageId = (args.languageId || '').trim();
  const ext = path.extname(args.filePath || '').toLowerCase();
  switch (languageId) {
    case 'dockerfile':
      return 'docker';
    case 'terraform':
      return ext === '.hcl' ? 'hcl' : 'terraform';
    case 'helm-template':
      return 'helm';
    case 'kubernetes-yaml':
      return 'kubernetes';
    case 'cloudformation-yaml':
      return 'cloudformation-yaml';
    case 'cloudformation-json':
      return 'cloudformation-json';
    case 'maven-xml':
      return 'xml';
    case 'gradle':
      return ext === '.kts' ? 'kotlin' : 'groovy';
    case 'npm-package-json':
      return 'json';
    case 'java':
      return 'java';
    case 'bicep':
      return 'bicep';
    case 'python':
      return 'python';
    default:
      return null;
  }
};

/**
 * True when language handlers recognize the file and it maps to an ORL CLI language.
 * Used for workspace staging (copy/list) when content may be omitted (empty string).
 */
export function isOrlScannableLanguageFile(args: {
  filePath: string;
  content?: string;
}): boolean {
  const filePath = (args.filePath || '').trim();
  if (!filePath) {
    return false;
  }
  const content = args.content ?? '';
  const languageId = detectLanguageId({ filePath, content });
  if (!languageId) {
    return false;
  }
  return mapLanguageIdToOrlLanguage({ languageId, filePath }) !== null;
}

/**
 * Fix-preview context extractor kind for the matched language handler.
 */
export function getResourceContextExtractKind(
  args: LanguageSelectionArgs,
): ResourceContextExtractKind {
  const handler = findMatchingLanguageHandler(args);
  if (!handler) {
    return 'unknown';
  }
  return handler.getResourceContextExtractKind();
}

export type { ResourceContextExtractKind } from './types';
