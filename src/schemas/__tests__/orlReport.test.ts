import {
  extractFindingLocationsFromReport,
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

  it('toExtensionLine converts 0-based to 1-based', () => {
    expect(toExtensionLine(0)).toBe(1);
    expect(toExtensionLine(4)).toBe(5);
    expect(toExtensionLine(Number.NaN)).toBe(1);
  });

  it('extractFindingLocationsFromReport flattens rules and resolves paths', () => {
    const report = {
      type: 'Report',
      rules: [
        {
          name: 'gomboc-ai/ensure_encryption000',
          findingLocations: [
            {
              id: 'finding-1',
              originalLocation: {
                id: 'finding-1',
                filePath: '/workspace/main.tf',
                startLine: 4,
                startColumn: 2,
                endLine: 4,
                endColumn: 18,
              },
            },
            {
              id: 'finding-deleted',
              resolutionStatus: 'deleted',
              originalLocation: {
                id: 'finding-deleted',
                filePath: '/workspace/main.tf',
                startLine: 9,
                startColumn: 0,
              },
            },
          ],
        },
      ],
    } as OrlReport;

    const rows = extractFindingLocationsFromReport({
      report,
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
