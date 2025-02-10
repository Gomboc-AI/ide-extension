#!/bin/bash

source .env && \
rm -rf ./src/api/__generated__ && \
apollo service:download --header="Authorization: Bearer $FRONTEGG_PAT" --endpoint=http://127.0.0.1:5001/graphql graphql-schema.json && \
apollo codegen:generate --localSchemaFile=graphql-schema.json --target=typescript --tagName=gql --queries='src/api/*.ts' --globalTypesFile='src/api/__generated__/GlobalTypes.ts'
