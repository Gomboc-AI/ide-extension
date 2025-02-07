import { z } from 'zod';
import dotenv from 'dotenv';

class InvalidEnvironment extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvironment';
  }
}

const envSchema = z.object({
  CUSTOMER_API_URL: z.string(),
});

dotenv.config(); // loads .env file into process.env

const settings = () => {
  const parsedEnvs = envSchema.safeParse(process.env);

  if (parsedEnvs.success) {
    return parsedEnvs.data;
  }
  return new InvalidEnvironment(parsedEnvs.error.message);
};

export default settings;
