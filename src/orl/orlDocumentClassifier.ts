import * as path from 'path';
import { detectLanguageId } from '../generics/languageHandler';

export interface OrlDocumentKinds {
  isDockerfile: boolean;
  isHelm: boolean;
  isKubernetes: boolean;
  isCloudFormation: boolean;
  isXmlBuild: boolean;
  isGradleBuild: boolean;
  isNpmPackage: boolean;
}

export interface CloudFormationTemplateContext {
  resourceName: string;
  resourceInstanceName: string;
  resourceStartLine: number;
  resourceEndLine: number;
}

export function detectOrlDocumentKinds(args: {
  filePath: string;
  content: string;
}): OrlDocumentKinds {
  const filePath = args.filePath || '';
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const languageId = detectLanguageId({
    filePath,
    content: args.content || '',
  });
  const isDockerfile = languageId === 'dockerfile';
  const isXmlBuild = ext === '.xml';
  const isGradleBuild = ext === '.gradle' || ext === '.kts';
  const isNpmPackage =
    languageId === 'npm-package-json' ||
    fileName === 'package.json' ||
    fileName === 'package-lock.json';
  const isHelm = languageId === 'helm-template';
  const isKubernetes = languageId === 'kubernetes-yaml';
  const isCloudFormation =
    languageId === 'cloudformation-yaml' ||
    languageId === 'cloudformation-json';

  return {
    isDockerfile,
    isHelm,
    isKubernetes,
    isCloudFormation,
    isXmlBuild,
    isGradleBuild,
    isNpmPackage,
  };
}

export function buildCloudFormationTemplateContext(args: {
  filePath: string;
  totalLines: number;
}): CloudFormationTemplateContext {
  const totalLines = Math.max(1, args.totalLines);
  return {
    resourceName: 'cloudformation_template',
    resourceInstanceName: path.basename(args.filePath),
    resourceStartLine: 0,
    resourceEndLine: totalLines - 1,
  };
}
