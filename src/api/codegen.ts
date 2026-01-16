/* eslint-disable eqeqeq */
// generate __generated__ types
import 'dotenv/config';

/**
 * Supports two ways of loading the CustomerAPI schema for codegen:
 * 1) URL introspection (default): requires auth and a running CustomerAPI server.
 * 2) File-based schema (recommended for local dev): point at CustomerAPI SDL files
 *    to avoid depending on remediations/frontegg during schema introspection.
 *
 * Usage (local file-based):
 *   STAGE=local CUSTOMER_API_SCHEMA_FILE='/abs/path/CustomerAPI/src/schema/*.graphql' npm run graphql:generate
 */

const isLocalStage = process.env.STAGE === 'local';

let hiveSchema: any;
if (!isLocalStage) {
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

// Prefer file-based schema when explicitly provided.
const schemaFile = process.env.CUSTOMER_API_SCHEMA_FILE;
const schema =
  schemaFile && schemaFile.trim()
    ? schemaFile
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : isLocalStage
      ? localSchema
      : hiveSchema;

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
