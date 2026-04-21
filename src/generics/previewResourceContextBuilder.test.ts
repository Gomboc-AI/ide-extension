import { buildPreviewResourceContexts } from './previewResourceContextBuilder';

describe('previewResourceContextBuilder', () => {
  it('returns empty array when there are no hunks', () => {
    expect(
      buildPreviewResourceContexts({
        filePath: '/workspace/main.tf',
        content: 'resource "x" "y" {}\n',
        hunks: [],
        kind: 'terraform',
      }),
    ).toEqual([]);
  });

  it('treats empty string as one line and still anchors hunks (fallback range)', () => {
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/main.tf',
      content: '',
      hunks: [{ fingerprint: 'a', newStart: 1 }],
      kind: 'terraform',
    });
    // `''.split('\n')` is `['']`, so extraction runs on a single empty line.
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'Context around line 1',
      startLine: 1,
      endLine: 1,
      relatedHunkFingerprints: ['a'],
    });
    expect(contexts[0].text).toBe('');
  });

  it('uses explicit kind for terraform block extraction', () => {
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/stack.tf',
      content: ['resource "null_resource" "x" {', '  triggers = {}', '}'].join(
        '\n',
      ),
      hunks: [{ fingerprint: 'fp1', newStart: 2 }],
      kind: 'terraform',
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      startLine: 1,
      endLine: 3,
      relatedHunkFingerprints: ['fp1'],
    });
    expect(contexts[0].id).toHaveLength(10);
    expect(contexts[0].text).toContain('null_resource');
    expect(contexts[0].truncated).toBeFalsy();
  });

  it('respects maxContexts when multiple hunks map to different ranges', () => {
    const content = [
      'resource "a" "b" { x = 1 }',
      '',
      'resource "c" "d" { y = 2 }',
    ].join('\n');
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/t.tf',
      content,
      hunks: [
        { fingerprint: 'h1', newStart: 1 },
        { fingerprint: 'h2', newStart: 3 },
      ],
      kind: 'terraform',
      maxContexts: 1,
    });

    expect(contexts).toHaveLength(1);
  });

  it('prefers resolveContextRange over default extraction when provided', () => {
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/custom.txt',
      content: ['line1', 'line2', 'line3'].join('\n'),
      hunks: [{ fingerprint: 'custom', newStart: 2 }],
      kind: 'unknown',
      resolveContextRange: () => ({
        title: 'Custom slice',
        startLine: 1,
        endLine: 2,
      }),
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'Custom slice',
      startLine: 1,
      endLine: 2,
      text: 'line1\nline2',
      relatedHunkFingerprints: ['custom'],
    });
  });

  it('falls back to default extraction when resolveContextRange returns undefined', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `L${i + 1}`).join('\n');
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/fallback.txt',
      content: lines,
      hunks: [{ fingerprint: 'fb', newStart: 25 }],
      kind: 'unknown',
      resolveContextRange: () => undefined,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].title).toBe('Context around line 25');
    expect(contexts[0].text).toContain('L25');
  });

  it('truncates long snippets when maxLinesPerContext is set', () => {
    const lineCount = 120;
    const content = Array.from(
      { length: lineCount },
      (_, i) => `row-${i + 1}`,
    ).join('\n');
    const contexts = buildPreviewResourceContexts({
      filePath: '/workspace/wide.txt',
      content,
      hunks: [{ fingerprint: 't1', newStart: 60 }],
      kind: 'unknown',
      maxLinesPerContext: 50,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].truncated).toBe(true);
    expect(contexts[0].text.split('\n').slice(-1)[0]).toBe('… (truncated)');
  });
});
