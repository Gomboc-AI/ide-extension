import { z } from 'zod';
import * as vscode from 'vscode';
// import dotenv from 'dotenv';
import 'dotenv/config';
class InvalidEnvironment extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvironment';
  }
}

const envSchema = z.object({
  CUSTOMER_API_URL: z.string(),
});

// dotenv.config(); // loads .env file into process.env

const settings = () => {
  // const parsedEnvs = envSchema.safeParse(process.env);
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
