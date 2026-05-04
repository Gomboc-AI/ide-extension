jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { parseOrlReport } from '../orlReportParser';

describe('parseOrlReport', () => {
  it('returns null for undefined', () => {
    expect(parseOrlReport(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseOrlReport('')).toBeNull();
  });

  it('parses valid YAML with type Report and no leading delimiter', () => {
    const report = 'type: Report\nspec:\n  workspace: repo';

    const parsed = parseOrlReport(report);

    expect(parsed).toEqual(
      expect.objectContaining({
        type: 'Report',
      }),
    );
  });

  it('parses valid YAML with leading delimiter', () => {
    const report = '---\ntype: Report\nspec:\n  workspace: repo';

    const parsed = parseOrlReport(report);

    expect(parsed).toEqual(
      expect.objectContaining({
        type: 'Report',
      }),
    );
  });

  it('extracts report section from diff output prefix', () => {
    const report = [
      'diff --git a/main.tf b/main.tf',
      '--- a/main.tf',
      '+++ b/main.tf',
      '@@ -1 +1 @@',
      '-foo',
      '+bar',
      '---',
      'type: Report',
      'spec:',
      '  workspace: repo',
    ].join('\n');

    const parsed = parseOrlReport(report);

    expect(parsed).toEqual(
      expect.objectContaining({
        type: 'Report',
      }),
    );
  });

  it('returns null for malformed YAML and does not throw', () => {
    const malformed = 'type: Report\nfoo: :\n';

    expect(() => parseOrlReport(malformed)).not.toThrow();
    expect(parseOrlReport(malformed)).toBeNull();
  });

  it('returns null when YAML is valid but type Report is missing', () => {
    const report = 'spec:\n  workspace: repo';

    expect(parseOrlReport(report)).toBeNull();
  });

  it('keeps numeric scalars as strings under FAILSAFE_SCHEMA', () => {
    const report = 'type: Report\nspec:\n  fixes: 3';

    const parsed = parseOrlReport(report);

    expect(parsed?.spec?.fixes).toBe('3');
    expect(typeof parsed?.spec?.fixes).toBe('string');
  });
});
