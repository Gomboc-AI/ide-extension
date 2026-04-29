import { chooseLanguageImplementation } from '@gomboc-ai/gomboc-node-sdk';
import { makeIacScanReport } from '@gomboc-ai/gomboc-node-sdk';
import {
  attributeRulesToDiff,
  buildFileToRulesMap,
  normalizeRuleName,
  pickBestRuleDescription,
} from '../orlResultConverter';
import { parseOrlReport } from '../../utils/orlReportParser';

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
    const handler = {
      matchRulesToDiff: jest.fn().mockImplementation(({ allFileRules }) => {
        return allFileRules.includes('handler-rule') ? ['handler-rule'] : [];
      }),
    } as unknown as ReturnType<typeof chooseLanguageImplementation>;

    const reportAttributed = attributeRulesToDiff({
      resourceName: 'Resource',
      resourceInstanceName: null,
      allFileRules: ['file-rule'],
      reportFileRules: ['report-rule'],
      diffLine: 10,
      diffContent: 'x = y',
      properties: [],
      handler,
      diagnosticRules: ['diag-rule'],
    });
    expect(reportAttributed).toEqual(['report-rule']);

    const handlerAttributed = attributeRulesToDiff({
      resourceName: 'aws_s3_bucket',
      resourceInstanceName: 'example',
      allFileRules: ['handler-rule', 'other-rule'],
      reportFileRules: [],
      diffLine: 10,
      diffContent: 'x = y',
      properties: ['acl'],
      handler,
      diagnosticRules: ['diag-rule'],
    });
    expect(handlerAttributed).toEqual(['handler-rule']);
  });

  it('falls back to diagnostics rules when file-level rules are absent', () => {
    const handler = {
      matchRulesToDiff: jest.fn().mockImplementation(({ allFileRules }) => {
        return allFileRules.includes('diag-priority') ? ['diag-priority'] : [];
      }),
    } as unknown as ReturnType<typeof chooseLanguageImplementation>;

    const attributed = attributeRulesToDiff({
      resourceName: 'aws_security_group',
      resourceInstanceName: 'sg',
      allFileRules: [],
      reportFileRules: [],
      diffLine: 4,
      diffContent: 'ingress = []',
      properties: [],
      handler,
      diagnosticRules: ['diag-priority', 'diag-other'],
    });
    expect(attributed).toEqual(['diag-priority']);
  });

  it('uses deterministic rule ordering regardless of input order', () => {
    const handler = {
      matchRulesToDiff: jest.fn().mockReturnValue([]),
    } as unknown as ReturnType<typeof chooseLanguageImplementation>;

    const first = attributeRulesToDiff({
      resourceName: 'aws_s3_bucket',
      resourceInstanceName: 'b',
      allFileRules: ['z-rule', 'a-rule', 'm-rule'],
      reportFileRules: [],
      diffLine: 2,
      diffContent: 'acl = "private"',
      properties: [],
      handler,
      diagnosticRules: [],
    });
    const second = attributeRulesToDiff({
      resourceName: 'aws_s3_bucket',
      resourceInstanceName: 'b',
      allFileRules: ['m-rule', 'z-rule', 'a-rule'],
      reportFileRules: [],
      diffLine: 2,
      diffContent: 'acl = "private"',
      properties: [],
      handler,
      diagnosticRules: [],
    });
    expect(first).toEqual(['a-rule', 'm-rule', 'z-rule']);
    expect(second).toEqual(['a-rule', 'm-rule', 'z-rule']);
  });

  it('preserves FAILSAFE string fields when casting into SDK report input', () => {
    const report = [
      'type: Report',
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
    expect(typeof parsed?.spec?.rules?.[0]?.fixes).toBe('string');
    expect(parsed?.spec?.rules?.[0]?.metadata?.display_name).toBe(
      'Test Rule Display',
    );
  });

  it('extracts appliedRules from sdk report conversion', () => {
    const report = {
      type: 'Report',
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
