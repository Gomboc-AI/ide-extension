import * as vscode from 'vscode';
import path from 'path';
import { InfrastructureTool } from './api/__generated__/graphql';

const TERRAFORM_EXTENSIONS = ['.tf', '.tfvars'];
const CLOUDFORMATION_EXTENSIONS = ['.yaml', '.yml', '.json'];
const DOCKERFILE_PREFIX = 'dockerfile';

export const getInfrastructureToolFromFileUri = (
  uri: vscode.Uri,
): keyof typeof InfrastructureTool => {
  const fileName = path.basename(uri.fsPath).toLowerCase();
  if (fileName.startsWith(DOCKERFILE_PREFIX)) {
    return 'Docker';
  }

  const extName = path.extname(uri.fsPath);
  if (TERRAFORM_EXTENSIONS.includes(extName)) {
    return 'Terraform';
  }
  if (CLOUDFORMATION_EXTENSIONS.includes(extName)) {
    return 'Cloudformation';
  }
  throw new Error('Unable to determine the infrastructure language');
};
