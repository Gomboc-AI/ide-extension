import * as vscode from 'vscode';
import path from 'path';

const TERRAFORM_EXTENSIONS = ['.tf', '.tfvars'];
const CLOUDFORMATION_EXTENSIONS = ['.yaml', '.yml', '.json'];
const DOCKERFILE_PREFIX = 'dockerfile';

/**
 * Local-only tooling classification used for diagnostic scoping and UX.
 * Do NOT couple this to CustomerAPI's GraphQL `InfrastructureTool` enum — CustomerAPI
 * may not support every local file type we want to handle (e.g. Dockerfile).
 */
export type LocalInfrastructureTool = 'Terraform' | 'Cloudformation' | 'Docker';

export const getInfrastructureToolFromFileUri = (
  uri: vscode.Uri,
): LocalInfrastructureTool | undefined => {
  // Only classify on-disk files. VS Code fires document events for non-file schemes too
  // (settings, virtual docs, etc.) and those should not crash the extension host.
  if (uri.scheme !== 'file') {
    return undefined;
  }

  const fileName = path.basename(uri.fsPath).toLowerCase();
  if (fileName.startsWith(DOCKERFILE_PREFIX)) {
    return 'Docker';
  }

  const extName = path.extname(uri.fsPath).toLowerCase();
  if (TERRAFORM_EXTENSIONS.includes(extName)) {
    return 'Terraform';
  }
  if (CLOUDFORMATION_EXTENSIONS.includes(extName)) {
    return 'Cloudformation';
  }
  return undefined;
};
