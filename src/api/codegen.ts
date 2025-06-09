/* eslint-disable eqeqeq */
// generate __generated__ types
import 'dotenv/config';

let hiveSchema;

if (process.env.STAGE !== 'local') {
  const _customerapi_schema_cdn_url = process.env.CUSTOMER_API_SCHEMA_CDN_URL;

  if (_customerapi_schema_cdn_url == null) {
    throw new Error('No CDN URL For customerAPI provided');
  }
  hiveSchema = {
    [_customerapi_schema_cdn_url]: {
      headers: {
        'X-Hive-CDN-Key': process.env.CUSTOMER_API_SCHEMA_CDN_URL,
      },
    },
  };
}
const _local_chema_cdn_url = process.env.CUSTOMER_API_URL;
if (_local_chema_cdn_url == null) {
  throw new Error('No CDN URL For customerAPI provided');
}

const localSchema = {
  [_local_chema_cdn_url]: {
    headers: {
      Authorization: `Bearer ${process.env.FRONTEGG_PAT}`,
    },
  },
};

const schema = process.env.STAGE === 'local' ? localSchema : hiveSchema;

const config = {
  schema: schema,
  documents: ['./src/api/**/*.ts'],
  generates: {
    './src/api/__generated__/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
      },
      config: {
        nonOptionalTypename: true,
        avoidOptionals: false,
        inputMaybeValue: 'T | null | undefined',
      },
    },
  },
  ignoreNoDocuments: false,
};

export default config;
