// generate __generated__ types
import 'dotenv/config';

let hiveSchema

if (process.env.STAGE !== 'local') {
  const _customerapi_schema_cdn_url = process.env.CUSTOMER_API_SCHEMA_CDN_URL;
  
  if (_customerapi_schema_cdn_url == null) {
    throw new Error('No CDN URL For customerAPI provided');

  }
  hiveSchema = {
    [_customerapi_schema_cdn_url]: {
      headers: {
        'X-Hive-CDN-Key': process.env.CUSTOMER_API_SCHEMA_CDN_URL
      }
    }
  };
}
const localSchema = process.env.CUSTOMER_API_URL;

const schema = process.env.STAGE === 'local' ? localSchema : hiveSchema;

const config = {
  schema: schema, 
  documents: ['./scrc/api/**/*.ts'],
  generates: {
    './src/api/__generated__/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
      }
    }
  },
  ignoreNoDocuments: false,
};

export default config;

