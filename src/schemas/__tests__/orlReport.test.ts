import {
  extractFindingLocationsFromReport,
  parseOrlReportPayload,
  selectScanDiagnosticLocation,
  toExtensionLine,
} from '../orlReport';
import type { FindingLocationRow, OrlReport } from '../orlReport';

describe('orlReport location helpers', () => {
  it('selectScanDiagnosticLocation returns originalLocation by default', () => {
    const row: FindingLocationRow = {
      id: 'f1',
      originalLocation: {
        id: 'f1',
        filePath: '/workspace/main.tf',
        startLine: 4,
        startColumn: 2,
      },
    };
    expect(selectScanDiagnosticLocation(row)?.startLine).toBe(4);
  });

  it('selectScanDiagnosticLocation skips deleted rows', () => {
    const row: FindingLocationRow = {
      id: 'f1',
      resolutionStatus: 'deleted',
      originalLocation: {
        id: 'f1',
        filePath: '/workspace/main.tf',
        startLine: 1,
        startColumn: 0,
      },
    };
    expect(selectScanDiagnosticLocation(row)).toBeUndefined();
  });

  it('selectScanDiagnosticLocation includes invalidated rows', () => {
    const row: FindingLocationRow = {
      id: 'f1',
      resolutionStatus: 'invalidated',
      originalLocation: {
        id: 'f1',
        filePath: '/workspace/main.tf',
        startLine: 3,
        startColumn: 1,
      },
    };
    expect(selectScanDiagnosticLocation(row)?.startLine).toBe(3);
  });

  it('toExtensionLine preserves 1-based ORL report line numbers', () => {
    expect(toExtensionLine(0)).toBe(1);
    expect(toExtensionLine(5)).toBe(5);
    expect(toExtensionLine(Number.NaN)).toBe(1);
  });

  it('extractFindingLocationsFromReport reads snake_case finding_locations', () => {
    const report = {
      type: 'Report',
      spec: {
        rules: [
          {
            name: 'gomboc-ai/cloudformation/aws_ec2_volume/ebs-encryption-enabled000',
            finding_locations: [
              {
                id: 'finding-ebs',
                original_location: {
                  id: 'finding-ebs',
                  file_path: 'cfngoat.yaml',
                  start_line: 103,
                  end_line: 103,
                  start_column: 0,
                  end_column: 42,
                },
              },
            ],
          },
        ],
      },
    } as OrlReport;

    const rows = extractFindingLocationsFromReport({
      report: parseOrlReportPayload(report),
      currentFilePath: '/repo/cfngoat.yaml',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        ruleName:
          'gomboc-ai/cloudformation/aws_ec2_volume/ebs-encryption-enabled000',
        findingId: 'finding-ebs',
        actualFilePath: '/repo/cfngoat.yaml',
        location: expect.objectContaining({
          filePath: 'cfngoat.yaml',
          startLine: 103,
          startColumn: 0,
        }),
      }),
    );
  });

  it('extractFindingLocationsFromReport flattens rules and resolves paths', () => {
    const report = {
      type: 'Report',
      rules: [
        {
          name: 'gomboc-ai/ensure_encryption000',
          finding_locations: [
            {
              id: 'finding-1',
              original_location: {
                id: 'finding-1',
                file_path: '/workspace/main.tf',
                start_line: 4,
                start_column: 2,
                end_line: 4,
                end_column: 18,
              },
            },
            {
              id: 'finding-deleted',
              resolution_status: 'deleted',
              original_location: {
                id: 'finding-deleted',
                file_path: '/workspace/main.tf',
                start_line: 9,
                start_column: 0,
              },
            },
          ],
        },
      ],
    };

    const rows = extractFindingLocationsFromReport({
      report: parseOrlReportPayload(report),
      currentFilePath: '/repo/main.tf',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        ruleName: 'gomboc-ai/ensure_encryption000',
        findingId: 'finding-1',
        actualFilePath: '/repo/main.tf',
        location: expect.objectContaining({ startLine: 4, startColumn: 2 }),
      }),
    );
  });
});
