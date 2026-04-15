/**
 * Handles deciding which language we are going to use
 */

import path from 'path';
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
} from './languageHandlers';

export interface LanguageSelectionArgs {
  filePath: string;
  content: string;
}

function hasPatternAtLineStart(content: string, pattern: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

function getFirstLines(content: string, maxLines: number = 50): string {
  return content.split('\n').slice(0, maxLines).join('\n');
}

/**
 * Detects the most likely language id for a file path + content pair.
 */
export const detectLanguageId = (
  args: LanguageSelectionArgs,
): string | null => {
  const filePath = args.filePath || '';
  const content = args.content || '';
  const fileName = path.basename(filePath).toLowerCase();
  const dirPath = path.dirname(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const firstLines = getFirstLines(content, 50);
  const contentLower = firstLines.toLowerCase();

  // Docker: Dockerfile* or *.dockerfile
  if (fileName.startsWith('dockerfile') || ext === '.dockerfile') {
    return 'dockerfile';
  }

  // Terraform-ish
  if (ext === '.tf' || ext === '.tfvars' || ext === '.hcl') {
    return 'terraform';
  }

  // Helm templates
  if (ext === '.tpl') {
    return 'helm-template';
  }

  // JSON split between npm package docs and CloudFormation templates.
  if (ext === '.json') {
    if (fileName === 'package.json' || fileName === 'package-lock.json') {
      return 'npm-package-json';
    }
    return 'cloudformation-json';
  }

  // YAML split between Helm, Kubernetes, and CloudFormation.
  if (ext === '.yaml' || ext === '.yml') {
    const isHelmDir =
      dirPath.includes('/charts/') ||
      dirPath.includes('/helm/') ||
      dirPath.includes('\\charts\\') ||
      dirPath.includes('\\helm\\');
    const isK8sDir =
      dirPath.includes('/k8s/') ||
      dirPath.includes('/kubernetes/') ||
      dirPath.includes('/manifests/') ||
      dirPath.includes('\\k8s\\') ||
      dirPath.includes('\\kubernetes\\') ||
      dirPath.includes('\\manifests\\');

    const isHelm =
      hasPatternAtLineStart(firstLines, '{{') ||
      contentLower.includes('.values') ||
      contentLower.includes('.chart') ||
      contentLower.includes('.release') ||
      fileName.includes('helm') ||
      fileName.includes('chart') ||
      isHelmDir;
    if (isHelm) {
      return 'helm-template';
    }

    const isKubernetes =
      (hasPatternAtLineStart(firstLines, 'kind:') &&
        hasPatternAtLineStart(firstLines, 'apiVersion:')) ||
      isK8sDir;
    if (isKubernetes) {
      return 'kubernetes-yaml';
    }

    return 'cloudformation-yaml';
  }

  if (ext === '.xml') {
    return 'maven-xml';
  }

  if (ext === '.gradle' || ext === '.kts') {
    return 'gradle';
  }

  return null;
};

export const chooseLanguageImplementation = (
  args: LanguageSelectionArgs,
): ILanguageHandler => {
  const languageId = detectLanguageId(args);
  if (languageId === 'dockerfile') {
    return new DockerfileLanguageHandler();
  }

  if (languageId === 'terraform') {
    return new TerraformLanguageHandler();
  }

  if (languageId === 'helm-template') {
    return new HelmTemplateLanguageHandler();
  }

  if (languageId === 'kubernetes-yaml') {
    return new KubernetesYAMLLanguageHandler();
  }

  if (languageId === 'cloudformation-yaml') {
    return new CloudFormationYAMLLanguageHandler();
  }

  if (languageId === 'cloudformation-json') {
    return new CloudFormationJSONLanguageHandler();
  }

  if (languageId === 'maven-xml') {
    return new MavenXMLLanguageHandler();
  }

  if (languageId === 'gradle') {
    return new GradleLanguageHandler();
  }

  if (languageId === 'npm-package-json') {
    return new NpmPackageJSONLanguageHandler();
  }

  // Default fallback while we incrementally add more handlers.
  return new TerraformLanguageHandler();
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
    default:
      return null;
  }
};
