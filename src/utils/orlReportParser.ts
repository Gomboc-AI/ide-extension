import yaml from 'js-yaml';
import logger from './logger';

/**
 * Parse YAML ORL report string into JSON object
 * The report may be embedded in stdout with file diffs before it
 */
export function parseOrlReport(report: string | undefined): any | null {
  if (!report) {
    logger.warn('No report provided to parseOrlReport');
    return null;
  }

  try {
    // The report might be embedded in stdout with file diffs before it
    // Look for the YAML report section (starts with "---" followed by "type: Report")
    let reportStart = report.indexOf('---\ntype: Report');
    if (reportStart === -1) {
      reportStart = report.indexOf('type: Report');
    }
    const yamlReport =
      reportStart >= 0 ? report.substring(reportStart) : report;

    // Remove the leading "---" if present
    const cleanReport = yamlReport.startsWith('---\n')
      ? yamlReport.substring(4)
      : yamlReport;

    logger.debug('Parsing ORL report', {
      reportLength: report.length,
      yamlReportLength: yamlReport.length,
      cleanReportLength: cleanReport.length,
      hasTypeReport: cleanReport.includes('type: Report'),
    });

    // Parse YAML to JSON
    const parsed = yaml.load(cleanReport) as any;

    if (!parsed || parsed.type !== 'Report') {
      logger.warn('Parsed report does not have type: Report', {
        parsedType: parsed?.type,
      });
      return null;
    }

    return parsed;
  } catch (error) {
    logger.error('Failed to parse ORL report', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
