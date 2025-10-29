import * as vscode from 'vscode';

const settings = () => {
  const customerApiProdUrl = 'https://api.app.gomboc.ai/graphql';

  const config = vscode.workspace.getConfiguration('gomboc-vscode-extension');
  const useCustomEndpoint = config.get('useCustomEndpoint');
  if (useCustomEndpoint) {
    const custom = config.get('serviceEndpoint');
    return {
      CUSTOMER_API_URL: custom,
    };
  }

  return {
    CUSTOMER_API_URL: customerApiProdUrl,
  };

  // return new InvalidEnvironment(parsedEnvs.error.message);
};

export default settings;
