import { makeIacScanReport } from '@gomboc-ai/gomboc-node-sdk';
import {
  OrlResultConverter,
  attributeRulesToDiff,
  buildFileToRulesMap,
  normalizeRuleName,
  pickBestRuleDescription,
} from '../orlResultConverter';
import { parseOrlReport } from '../../utils/orlReportParser';

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('orlResultConverter helpers', () => {
  it('normalizes rule names', () => {
    expect(normalizeRuleName('ensure_encryption000')).toBe('ensure-encryption');
    expect(normalizeRuleName('__already-normalized__')).toBe(
      'already-normalized',
    );
    expect(normalizeRuleName('')).toBe('');
  });

  it('picks best rule description with suffix stripping and normalization', () => {
    const descriptions = {
      'gomboc-ai/ensure-encryption': 'Ensure encryption',
      'gomboc-ai/aws-rds-cluster': 'RDS cluster setting',
    };
    expect(
      pickBestRuleDescription('gomboc-ai/ensure_encryption000', descriptions),
    ).toBe('Ensure encryption');
    expect(
      pickBestRuleDescription('gomboc-ai/aws_rds_cluster', descriptions),
    ).toBe('RDS cluster setting');
    expect(
      pickBestRuleDescription('gomboc-ai/missing-rule', descriptions),
    ).toBe(undefined);
  });

  it('builds merged file to rules maps', () => {
    const result = buildFileToRulesMap({
      reportRuleToChangedFiles: {
        reportRule: ['/workspace/main.tf'],
      },
      diagnostics: {
        version: 1,
        generatedAt: 'now',
        rules: [
          {
            ruleName: 'diagRule',
            priority: 1,
            files: [{ path: 'main.tf' }],
          },
        ],
      },
    });

    expect(result.fileToRules['main.tf']).toEqual(
      expect.arrayContaining(['reportRule', 'diagRule']),
    );
    expect(result.fileToReportRules['main.tf']).toEqual(['reportRule']);
  });

  it('attributes rules with correct fallback ordering', () => {
    const reportAttributed = attributeRulesToDiff({
      allFileRules: ['file-rule'],
      reportFileRules: ['report-rule'],
      diagnosticRules: ['diag-rule'],
    });
    expect(reportAttributed).toEqual(['report-rule']);

    const fileAttributed = attributeRulesToDiff({
      allFileRules: ['handler-rule', 'other-rule'],
      reportFileRules: [],
      diagnosticRules: ['diag-rule'],
    });
    expect(fileAttributed).toEqual(['handler-rule', 'other-rule']);
  });

  it('falls back to diagnostics rules when file-level rules are absent', () => {
    const attributed = attributeRulesToDiff({
      allFileRules: [],
      reportFileRules: [],
      diagnosticRules: ['diag-priority', 'diag-other'],
    });
    expect(attributed).toEqual(['diag-other', 'diag-priority']);
  });

  it('uses deterministic rule ordering regardless of input order', () => {
    const first = attributeRulesToDiff({
      allFileRules: ['z-rule', 'a-rule', 'm-rule'],
      reportFileRules: [],
      diagnosticRules: [],
    });
    const second = attributeRulesToDiff({
      allFileRules: ['m-rule', 'z-rule', 'a-rule'],
      reportFileRules: [],
      diagnosticRules: [],
    });
    expect(first).toEqual(['a-rule', 'm-rule', 'z-rule']);
    expect(second).toEqual(['a-rule', 'm-rule', 'z-rule']);
  });

  it('builds finding-centric remediations from report findingLocations', () => {
    const report = [
      'type: Report',
      'version: v1',
      'metadata:',
      '  name: report-name',
      '  display_name: Report Name',
      'spec:',
      '  language: terraform',
      '  errors: []',
      '  rules:',
      '    - name: gomboc-ai/ensure_encryption000',
      '      findings: 1',
      '      fixes: 1',
      '      changes: 1',
      '      errors: []',
      '      files:',
      '        - path: /workspace/main.tf',
      '      files_changed:',
      '        /workspace/main.tf: true',
      '      metadata:',
      '        name: gomboc-ai/ensure_encryption000',
      '        display_name: Ensure encryption',
      '        annotations:',
      '          gomboc-ai/description-plain: Ensure encryption',
      '      finding_locations:',
      '        - id: finding-1',
      '          original_location:',
      '            id: finding-1',
      '            file_path: /workspace/main.tf',
      '            start_line: 4',
      '            start_column: 2',
      '            end_line: 4',
      '            end_column: 18',
    ].join('\n');

    const payload = OrlResultConverter.buildPayload({
      result: {
        success: true,
        modifiedFiles: {},
        report,
      },
      filetype: 'tf',
      currentFilePath: '/repo/main.tf',
      originalFileContents: {},
    });

    expect(payload.individualFixes).toHaveLength(1);
    expect(payload.individualFixes[0].findingLocation).toEqual(
      expect.objectContaining({
        id: 'finding-1',
        startLine: 4,
        startColumn: 2,
      }),
    );
    expect(
      payload.individualFixes[0].codeObservation.codeResourceInstance.line,
    ).toBe(4);
    expect(payload.individualFixes[0].rule.id).toBe(
      'orl-rule:gomboc-ai/ensure_encryption000',
    );
  });

  it('coerces FAILSAFE numeric fields when casting into SDK report input', () => {
    const report = [
      'type: Report',
      'version: v1',
      'spec:',
      '  rules:',
      '    - name: gomboc-ai/test_rule000',
      '      fixes: 1',
      '      changes: 1',
      '      files_changed:',
      '        /workspace/main.tf: true',
      '      metadata:',
      '        display_name: Test Rule Display',
      '        annotations:',
      '          gomboc-ai/description-plain: Test description',
    ].join('\n');

    const parsed = parseOrlReport(report);
    expect(parsed).not.toBeNull();
    expect(parsed?.spec?.rules?.[0]?.fixes).toBe(1);
    expect(typeof parsed?.spec?.rules?.[0]?.fixes).toBe('number');
    expect(parsed?.spec?.rules?.[0]?.metadata?.display_name).toBe(
      'Test Rule Display',
    );
  });

  it('extracts appliedRules from sdk report conversion', () => {
    const report = {
      type: 'Report',
      version: 'v1',
      metadata: {
        name: 'report-name',
        display_name: 'Report Name',
      },
      spec: {
        language: 'terraform',
        errors: [],
        rules: [
          {
            name: 'gomboc-ai/ensure_encryption000',
            findings: 1,
            fixes: 1,
            changes: 1,
            files: [{ path: '/workspace/main.tf' }],
            errors: [],
            files_changed: {
              '/workspace/main.tf': true,
            },
            metadata: {
              name: 'gomboc-ai/ensure_encryption000',
              display_name: 'Ensure encryption',
              annotations: {
                'ruleset-name': 'gomboc-ai/ensure_encryption000',
              },
            },
          },
        ],
      },
    } as unknown as Parameters<typeof makeIacScanReport>[0];
    const scanReport = makeIacScanReport(report);
    expect(scanReport.appliedRules).toContain('gomboc-ai/ensure_encryption000');
  });
});
