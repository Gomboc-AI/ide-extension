import { createParserOpts } from './.ci/parser.mjs';
import { createWriterOpts } from './.ci/writer.mjs';

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
          { breaking: true, release: 'major' },
          { revert: true, release: 'patch' },
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { type: 'docs', scope: 'README', release: 'patch' },
          { scope: 'release', release: 'patch' },
          { scope: 'no-release', release: false },
          { scope: 'release', release: 'patch' },
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
