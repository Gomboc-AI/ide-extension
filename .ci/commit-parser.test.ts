const { createParserOpts } = require('../.ci/parser.js');
const { whatBump } = require('../.ci/whatBump.js');

describe('Commit Parser', () => {
  test('should parse commit with force-release flag', () => {
    const parserOpts = createParserOpts();
    const commitMessage = 'fix: update configuration [force-release]';
    const match = commitMessage.match(parserOpts.headerPattern);

    expect(match).toBeTruthy();
    expect(match?.[1]).toBeUndefined(); // issue
    expect(match?.[2]).toBe('fix'); // type
    expect(match?.[3]).toBeUndefined(); // scope
    expect(match?.[4]).toBe('update configuration'); // subject
  });

  test('should parse commit without force-release flag', () => {
    const parserOpts = createParserOpts();
    const commitMessage = 'feat: add new feature';
    const match = commitMessage.match(parserOpts.headerPattern);

    expect(match).toBeTruthy();
    expect(match?.[2]).toBe('feat'); // type
    expect(match?.[4]).toBe('add new feature'); // subject
  });

  test('should parse commit with scope and force-release flag', () => {
    const parserOpts = createParserOpts();
    const commitMessage =
      'fix(api): resolve authentication issue [force-release]';
    const match = commitMessage.match(parserOpts.headerPattern);

    expect(match).toBeTruthy();
    expect(match?.[2]).toBe('fix'); // type
    expect(match?.[3]).toBe('api'); // scope
    expect(match?.[4]).toBe('resolve authentication issue'); // subject
  });
});

describe('WhatBump', () => {
  test('should force release when [force-release] flag is present', () => {
    const commits = [
      {
        subject: 'docs: update README [force-release]',
        type: 'docs',
        notes: [],
      },
    ];

    const result = whatBump(commits);
    expect(result.level).toBe(2);
    expect(result.reason).toBe(
      'Force release triggered by [force-release] flag',
    );
  });

  test('should not force release when [force-release] flag is not present', () => {
    const commits = [
      {
        subject: 'docs: update README',
        type: 'docs',
        notes: [],
      },
    ];

    const result = whatBump(commits);
    expect(result.level).toBe(2);
    expect(result.reason).toBe('There are 0 BREAKING CHANGES and 0 features');
  });

  test('should prioritize breaking changes over force-release flag', () => {
    const commits = [
      {
        subject: 'feat: breaking change [force-release]',
        type: 'feat',
        notes: [
          { title: 'BREAKING CHANGE', text: 'This is a breaking change' },
        ],
      },
    ];

    const result = whatBump(commits);
    expect(result.level).toBe(0); // Breaking change should take precedence
    expect(result.reason).toBe('There is 1 BREAKING CHANGE and 0 features');
  });
});
