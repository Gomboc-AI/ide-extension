import { createParserOpts } from './.ci/parser.js';
import { whatBump } from './.ci/whatBump.js';
import { createWriterOpts } from './.ci/writer.js';

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'docs', scope: 'README', release: 'patch' },
          { scope: 'release', release: 'patch' },
          { scope: 'no-release', release: false },
          { message: '*[force-release]*', release: 'patch' },
        ],
        parserOpts: createParserOpts(),
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        parserOpts: createParserOpts(),
        writerOpts: await createWriterOpts(),
      },
    ],
    [
      'semantic-release-vsce',
      {
        packageVsix: true,
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: '*.vsix',
      },
    ],
  ],
};
