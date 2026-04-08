/**
 * Handles deciding which language we are going to use
 */

import path from 'path';
import { ILanguageHandler } from './types';
import { TerraformLanguageHandler } from './languageHandlers/terraformHandler';
import { CloudFormationYAMLLanguageHandler } from './languageHandlers/cloudformationYAMLHandler';
import { CloudFormationJSONLanguageHandler } from './languageHandlers/cloudformationJSONHandler';

export const chooseLanguageImplementation = (fileName: string): ILanguageHandler => {
  // Decides on the language handler from the current file name.
  const baseName = path.basename(fileName || '').toLowerCase();
  const ext = path.extname(baseName).toLowerCase();

  if (ext === '.tf' || ext === '.tfvars' || ext === '.hcl') {
    return new TerraformLanguageHandler();
  }

  if (ext === '.yaml' || ext === '.yml') {
    return new CloudFormationYAMLLanguageHandler();
  }

  if (ext === '.json') {
    return new CloudFormationJSONLanguageHandler();
  }

  // Default fallback while we incrementally add more handlers.
  return new TerraformLanguageHandler();
};
