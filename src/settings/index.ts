import { z } from 'zod';
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
  const parsedEnvs = envSchema.safeParse(process.env);
  const customerApiProdUrl = 'https://app.gomboc.ai/graphql';

  if (parsedEnvs.success) {
    return parsedEnvs.data;
  }
  return {
    CUSTOMER_API_URL: customerApiProdUrl,
  };

  // return new InvalidEnvironment(parsedEnvs.error.message);
};

export default settings;
