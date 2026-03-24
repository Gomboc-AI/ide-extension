import * as path from 'path';

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

function hasPatternAtLineStart(content: string, pattern: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

function getFirstLines(content: string, maxLines: number = 50): string {
  const lines = content.split('\n');
  return lines.slice(0, maxLines).join('\n');
}

export function detectOrlDocumentKinds(args: {
  filePath: string;
  content: string;
}): OrlDocumentKinds {
  const filePath = args.filePath || '';
  const content = args.content || '';
  const fileName = path.basename(filePath).toLowerCase();
  const dirPath = path.dirname(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  const isDockerfile =
    fileName.startsWith('dockerfile') || ext === '.dockerfile';
  const isXmlBuild = ext === '.xml';
  const isGradleBuild = ext === '.gradle' || ext === '.kts';
  const isNpmPackage =
    fileName === 'package.json' || fileName === 'package-lock.json';

  const isYamlLike = ext === '.yaml' || ext === '.yml';
  const isJsonDoc = ext === '.json';
  const firstLines = getFirstLines(content, 50);
  const contentLower = firstLines.toLowerCase();

  const isHelmDir =
    dirPath.includes('/charts/') ||
    dirPath.includes('/helm/') ||
    dirPath.includes('\\charts\\') ||
    dirPath.includes('\\helm\\');

  const isHelm =
    ext === '.tpl' ||
    (isYamlLike &&
      (hasPatternAtLineStart(firstLines, '{{') ||
        contentLower.includes('.values') ||
        contentLower.includes('.chart') ||
        contentLower.includes('.release') ||
        fileName.includes('helm') ||
        fileName.includes('chart') ||
        isHelmDir));

  const isK8sDir =
    dirPath.includes('/k8s/') ||
    dirPath.includes('/kubernetes/') ||
    dirPath.includes('/manifests/') ||
    dirPath.includes('\\k8s\\') ||
    dirPath.includes('\\kubernetes\\') ||
    dirPath.includes('\\manifests\\');

  const isKubernetes =
    isYamlLike &&
    ((hasPatternAtLineStart(firstLines, 'kind:') &&
      hasPatternAtLineStart(firstLines, 'apiVersion:')) ||
      isK8sDir);

  const hasCloudFormationMarkers =
    hasPatternAtLineStart(firstLines, 'AWSTemplateFormatVersion') ||
    hasPatternAtLineStart(firstLines, 'Resources:') ||
    hasPatternAtLineStart(firstLines, 'Transform:') ||
    /"AWSTemplateFormatVersion"\s*:/.test(content) ||
    /"Resources"\s*:/.test(content) ||
    /"Transform"\s*:/.test(content) ||
    fileName.includes('cloudformation') ||
    fileName.includes('cfn') ||
    fileName.includes('template') ||
    fileName.includes('stack');

  const isCloudFormation =
    !isDockerfile &&
    !isHelm &&
    !isKubernetes &&
    !isXmlBuild &&
    !isGradleBuild &&
    !isNpmPackage &&
    ((isJsonDoc && hasCloudFormationMarkers) || isYamlLike);

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
