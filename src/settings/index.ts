import * as vscode from 'vscode';
import {
  DEFAULTS,
  getStringSetting,
  getBooleanSetting,
} from '../utils/configDefaults';

const settings = () => {
  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const useCustomEndpoint = getBooleanSetting(
    config,
    'useCustomEndpoint',
    false,
  );
  if (useCustomEndpoint) {
    const custom = getStringSetting(
      config,
      'serviceEndpoint',
      DEFAULTS.customerApiUrl,
    );
    return {
      CUSTOMER_API_URL: custom,
    };
  }

  return {
    CUSTOMER_API_URL: DEFAULTS.customerApiUrl,
  };

  // return new InvalidEnvironment(parsedEnvs.error.message);
};

export default settings;
