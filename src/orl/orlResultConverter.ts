import * as vscode from 'vscode';
import * as path from 'path';
import { z } from 'zod';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer } from '../utils/fileDiffAnalyzer';
import { parseOrlReport } from '../utils/orlReportParser';
import {
  chooseLanguageImplementation,
  makeIacScanReport,
} from '@gomboc-ai/gomboc-node-sdk';
import type {
  RemediationFix,
  ScanRemediationPayload,
} from '../schemas/scanRemediation';
import {
  extractFindingLocationsFromReport,
  getOrlReportRules,
  toExtensionLine,
  zOrlReport,
} from '../schemas/orlReport';

type MakeScanReportInput = Parameters<typeof makeIacScanReport>[0];

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
  error?: string;
  exitCode?: number;
  // Optional aggregated diagnostics produced by hooks
  // Shape:
  // {
  //   version: 1,
  //   generatedAt: string,
  //   rules: [{
  //     ruleName: string,
  //     priority: number,
  //     files: [{ path: string, hunks: [{ startLine: number, lineCount: number, type?: string }] }]
  //   }]
  // }
  diagnostics?: {
    version: number;
    generatedAt: string;
    rules: Array<{
      ruleName: string;
      priority: number;
      files?: Array<{
        path: string;
        hunks?: Array<{
          startLine: number;
          lineCount: number;
          type?: string;
        }>;
        resources?: Array<{
          type?: string;
          name?: string;
          startLine?: number;
          endLine?: number;
        }>;
      }>;
    }>;
  };
}

export type ScanResponse = ScanRemediationPayload;

/**
 * Builds resilient file lookup keys for ORL and local path variants.
 */
const addFileKeys = (p: string): string[] => {
  const keys = new Set<string>();
  const norm = p.replace(/^[.][/]/, '');
  keys.add(norm);
  keys.add(norm.startsWith('/') ? norm : '/' + norm);
  keys.add(path.basename(norm));
  keys.add('/workspace/' + norm);
  keys.add('/workspace/' + norm.replace(/^\//, ''));
  return Array.from(keys);
};

/**
 * Removes ORL instance suffixes like `...000` while keeping numeric rule names intact.
 */
const stripOrlInstanceSuffix = (name: string): string => {
  if (!name || typeof name !== 'string') {
    return '';
  }
  const m = name.match(/^(.*?)(\d{3})$/);
  if (!m) {
    return name;
  }
  const base = m[1] ?? '';
  if (!base) {
    return name;
  }
  const prev = base[base.length - 1];
  if (prev && /[0-9]/.test(prev)) {
    return name;
  }
  return base;
};

/**
 * Normalizes rule names to a comparable, URL-safe form for fuzzy matching.
 */
export function normalizeRuleName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[0-9]+$/, '')
    .replace(/[^a-z0-9\/]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/\/$/, '');
}

/**
 * Merges report-derived and diagnostics-derived file->rule attribution maps.
 */
export function buildFileToRulesMap(args: {
  diagnostics: OrlResult['diagnostics'];
  reportRuleToChangedFiles: Record<string, string[]>;
}): {
  fileToRules: Record<string, string[]>;
  fileToReportRules: Record<string, string[]>;
} {
  const fileToRules: Record<string, string[]> = {};
  const fileToReportRules: Record<string, string[]> = {};
  const pushRule = (
    map: Record<string, string[]>,
    key: string,
    rule: string,
  ) => {
    if (!map[key]) {
      map[key] = [];
    }
    if (!map[key].includes(rule)) {
      map[key].push(rule);
    }
  };

  for (const [ruleName, paths] of Object.entries(
    args.reportRuleToChangedFiles,
  )) {
    for (const p of paths) {
      for (const key of addFileKeys(p)) {
        pushRule(fileToRules, key, ruleName);
        pushRule(fileToReportRules, key, ruleName);
      }
    }
  }

  const diagnosticRules = args.diagnostics?.rules || [];
  for (const diagnosticRule of diagnosticRules) {
    for (const file of diagnosticRule.files || []) {
      for (const key of addFileKeys(file.path)) {
        pushRule(fileToRules, key, diagnosticRule.ruleName);
      }
    }
  }

  return { fileToRules, fileToReportRules };
}

/**
 * Resolves the best matching rule description using progressively looser matching.
 */
export function pickBestRuleDescription(
  ruleName: string,
  ruleDescriptions: Record<string, string>,
): string | undefined {
  let description = ruleDescriptions[ruleName];
  if (description) {
    return description;
  }

  const baseName = stripOrlInstanceSuffix(ruleName);
  if (baseName && baseName !== ruleName) {
    for (const [reportRuleName, desc] of Object.entries(ruleDescriptions)) {
      if (
        reportRuleName.startsWith(baseName) ||
        baseName.startsWith(reportRuleName)
      ) {
        return desc;
      }
    }
  }

  const normalizedRuleName = normalizeRuleName(ruleName);
  for (const [reportRuleName, desc] of Object.entries(ruleDescriptions)) {
    const normalizedReportName = normalizeRuleName(reportRuleName);
    if (
      normalizedRuleName === normalizedReportName ||
      normalizedRuleName.includes(normalizedReportName) ||
      normalizedReportName.includes(normalizedRuleName)
    ) {
      return desc;
    }
  }

  const coreName = ruleName.split('/').pop() || ruleName;
  const normalizedCoreName = normalizeRuleName(coreName);
  for (const [reportRuleName, desc] of Object.entries(ruleDescriptions)) {
    const reportCore = reportRuleName.split('/').pop() || reportRuleName;
    const normalizedReportCore = normalizeRuleName(reportCore);
    if (
      normalizedCoreName === normalizedReportCore ||
      normalizedCoreName.includes(normalizedReportCore) ||
      normalizedReportCore.includes(normalizedCoreName) ||
      coreName.includes(reportCore) ||
      reportCore.includes(coreName)
    ) {
      description = desc;
      break;
    }
  }

  return description;
}

/**
 * Attributes a diff to rules using report file mapping, then hook diagnostics.
 */
export function attributeRulesToDiff(args: {
  allFileRules: string[];
  reportFileRules: string[];
  diagnosticRules: string[];
}): string[] {
  const dedupe = (rules: string[]): string[] =>
    Array.from(new Set(rules)).sort((a, b) => a.localeCompare(b));

  if (args.reportFileRules.length > 0) {
    return dedupe(args.reportFileRules).slice(0, 20);
  }
  if (args.allFileRules.length > 0) {
    return dedupe(args.allFileRules);
  }
  return dedupe(args.diagnosticRules).slice(0, 20);
}

const buildMatchKeys = (args: {
  orlFilePath: string;
  actualFilePath: string;
}): string[] => {
  const orlNorm = args.orlFilePath.replace(/^\/workspace\/+/, '');
  return [
    args.orlFilePath,
    orlNorm,
    path.basename(orlNorm),
    args.actualFilePath,
    path.basename(args.actualFilePath),
  ];
};

const collectRulesForFileKeys = (args: {
  matchKeys: string[];
  fileToRules: Record<string, string[]>;
}): string[] => {
  const rules: string[] = [];
  for (const key of args.matchKeys) {
    const fileRules = args.fileToRules[key];
    if (!fileRules) {
      continue;
    }
    for (const ruleName of fileRules) {
      if (!rules.includes(ruleName)) {
        rules.push(ruleName);
      }
    }
  }
  return rules;
};

const ruleFileRemediationKey = (ruleName: string, filePath: string): string =>
  `${ruleName}::${filePath}`;

const buildRuleDescriptionText = (args: {
  ruleName: string;
  ruleDescriptions: Record<string, string>;
  ruleShortNames: Record<string, string>;
}): string => {
  return (
    pickBestRuleDescription(args.ruleName, args.ruleDescriptions) ||
    args.ruleShortNames[args.ruleName] ||
    stripOrlInstanceSuffix(args.ruleName)
  );
};

const resolveCodeResourceType = (args: {
  filePath: string;
  content: string;
  filetype: string;
}): string => {
  const handler = chooseLanguageImplementation({
    filePath: args.filePath,
    content: args.content,
  });
  return handler.codeResourceType || args.filetype;
};

/**
 * Utility class for converting ORL results to VS Code scan response format
 */
export class OrlResultConverter {
  /**
   * Best-effort extraction of per-rule changed file paths from the ORL YAML report.
   *
   * This is important because our hook diagnostics may include rule names but not file paths
   * (e.g. if ORL does not provide file lists to hooks). When that happens, rule attribution
   * falls back to fuzzy matching and can introduce false positives.
   */
  private static extractChangedFilesByRuleFromReport(
    report?: string,
  ): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    const parsed = parseOrlReport(report);
    if (!parsed) {
      return out;
    }
    let reportPayload: z.infer<typeof zOrlReport>;
    try {
      reportPayload = zOrlReport.parse(parsed);
    } catch {
      return out;
    }
    const rules = getOrlReportRules(reportPayload);
    if (rules.length === 0) {
      return out;
    }

    const toInt = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        return v;
      }
      if (typeof v === 'string') {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };

    for (const r of rules) {
      const ruleName: string | undefined =
        (typeof r?.name === 'string' && r.name) ||
        (typeof r?.metadata?.name === 'string' && r.metadata.name) ||
        undefined;
      if (!ruleName) {
        continue;
      }

      // NOTE: We parse the report with FAILSAFE_SCHEMA (see `parseOrlReport`), so numeric scalars
      // like fixes/changes may come through as strings. Coerce to int.
      const fixes = toInt(r?.fixes);
      const changes = toInt(r?.changes);

      const paths: string[] = [];

      // Prefer the explicit files_changed map when present (it indicates changed files).
      if (r?.files_changed && typeof r.files_changed === 'object') {
        for (const k of Object.keys(r.files_changed)) {
          if (k) {
            paths.push(k);
          }
        }
      }

      // Fall back to files[].path when files_changed isn't available.
      if (paths.length === 0 && Array.isArray(r?.files)) {
        for (const f of r.files) {
          const p = typeof f?.path === 'string' ? f.path : undefined;
          if (p) {
            paths.push(p);
          }
        }
      }

      // Only consider rules that actually produced changes/fixes; most rules audit but do not modify.
      // However, `files_changed` is authoritative for modifications even if counters are missing/strings.
      if (
        paths.length > 0 &&
        (fixes > 0 ||
          changes > 0 ||
          (r?.files_changed &&
            typeof r.files_changed === 'object' &&
            Object.keys(r.files_changed).length > 0))
      ) {
        out[ruleName] = Array.from(new Set(paths));
      }
    }

    return out;
  }

  private static extractRuleDescriptionsFromReport(
    report?: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const parsed = parseOrlReport(report);
    if (!parsed) {
      return out;
    }
    const reportPayload = parsed;
    const rules = getOrlReportRules(reportPayload);
    if (rules.length === 0) {
      return out;
    }

    const coerceString = (v: unknown): string | undefined => {
      if (typeof v !== 'string') {
        return undefined;
      }
      const s = v.trim();
      return s ? s : undefined;
    };

    const pickRuleDescription = (
      metadata: (typeof rules)[number]['metadata'] | undefined,
    ): string | undefined => {
      if (!metadata) {
        return undefined;
      }
      const metadataRecord = metadata as Record<string, unknown>;

      // New source of truth: plain-text description annotation (support both key spellings).
      const annotationKeys = [
        'gomboc-ai/description-plain',
        'gomboc-ai/description_plain',
      ];

      const annotations =
        (metadataRecord.annotations as Record<string, unknown> | undefined) ||
        (metadataRecord.annotation as Record<string, unknown> | undefined);

      if (annotations) {
        for (const k of annotationKeys) {
          const v = coerceString(annotations[k]);
          if (v) {
            return v;
          }
        }
      }

      // Sometimes the report may flatten annotation keys onto metadata directly.
      for (const k of annotationKeys) {
        const v = coerceString(metadataRecord[k]);
        if (v) {
          return v;
        }
      }

      // Backwards-compatible fallback (old location).
      return coerceString(metadataRecord.description);
    };

    for (const r of rules) {
      const desc = pickRuleDescription(r?.metadata);
      if (!desc) {
        continue;
      }

      // Store under both possible names so downstream lookups are resilient.
      const names = new Set<string>();
      if (typeof r?.name === 'string' && r.name.trim()) {
        names.add(r.name.trim());
      }
      if (typeof r?.metadata?.name === 'string' && r.metadata.name.trim()) {
        names.add(r.metadata.name.trim());
      }
      for (const n of names) {
        out[n] = desc;
      }
    }

    logger.info('Extracted rule descriptions', {
      count: Object.keys(out).length,
      sampleRules: Object.keys(out).slice(0, 5),
      sampleDescriptions: Object.entries(out)
        .slice(0, 3)
        .map(([name, desc]) => ({
          name,
          descriptionPreview: desc.substring(0, 100),
        })),
    });

    return out;
  }

  private static extractRuleShortNamesFromReport(
    report?: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const parsed = parseOrlReport(report);
    if (!parsed) {
      return out;
    }
    const reportPayload = parsed;
    const rules = getOrlReportRules(reportPayload);

    const displayNameByRule: Record<string, string> = {};
    for (const rule of rules) {
      const ruleName: string | undefined =
        (typeof rule?.name === 'string' && rule.name) ||
        (typeof rule?.metadata?.name === 'string' && rule.metadata.name) ||
        undefined;
      if (!ruleName) {
        continue;
      }
      const displayName: string | undefined =
        (typeof rule?.metadata?.display_name === 'string' &&
          rule.metadata.display_name) ||
        (typeof rule?.metadata?.displayName === 'string' &&
          rule.metadata.displayName) ||
        undefined;
      if (displayName?.trim()) {
        displayNameByRule[ruleName] = displayName.trim();
      }
    }

    // TODO: Export the proper report input type from @gomboc-ai/gomboc-node-sdk
    // and replace this cast once available.
    const scanReport = makeIacScanReport(
      reportPayload as unknown as MakeScanReportInput,
    );
    const appliedRules = Array.isArray(scanReport.appliedRules)
      ? scanReport.appliedRules
      : [];
    for (const appliedRule of appliedRules) {
      if (typeof appliedRule !== 'string' || !appliedRule.trim()) {
        continue;
      }
      const ruleName = appliedRule.trim();
      const displayName = displayNameByRule[ruleName];
      const cleaned = stripOrlInstanceSuffix(ruleName);
      const fallback = cleaned.split('/').pop() || cleaned;
      out[ruleName] = displayName || fallback;
    }

    return out;
  }

  /**
   * Convert ORL result to IDE extension scan response format
   */
  static async convertToScanResponse(
    result: OrlResult,
    filetype: string,
    currentFilePath: string,
  ): Promise<ScanResponse> {
    const originalFileContents =
      await OrlResultConverter.loadModifiedFileContents({
        modifiedFiles: result.modifiedFiles,
        currentFilePath,
      });
    return OrlResultConverter.buildPayload({
      result,
      filetype,
      currentFilePath,
      originalFileContents,
    });
  }

  private static async loadModifiedFileContents(args: {
    modifiedFiles: { [filePath: string]: string };
    currentFilePath: string;
  }): Promise<Record<string, string>> {
    // Preload originals once so the pure payload builder can run without I/O.
    const out: Record<string, string> = {};
    for (const orlFilePath of Object.keys(args.modifiedFiles || {})) {
      const actualFilePath = PathConverter.convertOrlPathToActualPath(
        orlFilePath,
        args.currentFilePath,
      );
      const originalContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(actualFilePath),
      );
      out[actualFilePath] = new TextDecoder().decode(originalContent);
    }
    return out;
  }

  /**
   * Builds the final scan payload from preloaded inputs without filesystem access.
   */
  static buildPayload(args: {
    result: OrlResult;
    filetype: string;
    currentFilePath: string;
    originalFileContents: Record<string, string>;
  }): ScanResponse {
    const { result, filetype, currentFilePath, originalFileContents } = args;
    const individualFixes: ScanRemediationPayload['individualFixes'] = [];
    const groupedFixes: ScanRemediationPayload['groupedFixes'] = [];

    const parsedReport = parseOrlReport(result.report);
    const findingRows = extractFindingLocationsFromReport({
      report: parsedReport,
      currentFilePath,
    });
    const hasFindingLocations = findingRows.length > 0;

    const reportRuleToChangedFiles =
      OrlResultConverter.extractChangedFilesByRuleFromReport(result.report);
    const diagnosticRuleNames = (result.diagnostics?.rules || []).map(
      r => r.ruleName,
    );
    const { fileToRules, fileToReportRules } = buildFileToRulesMap({
      diagnostics: result.diagnostics,
      reportRuleToChangedFiles: reportRuleToChangedFiles,
    });

    const ruleDescriptions =
      OrlResultConverter.extractRuleDescriptionsFromReport(result.report);
    const ruleShortNames = OrlResultConverter.extractRuleShortNamesFromReport(
      result.report,
    );

    const diffFixesByRuleFile = new Map<string, RemediationFix[]>();

    for (const [orlFilePath, modifiedContent] of Object.entries(
      result.modifiedFiles,
    )) {
      // Convert ORL path (/workspace/file.tf) to actual file path
      const actualFilePath = PathConverter.convertOrlPathToActualPath(
        orlFilePath as string,
        currentFilePath,
      );

      const originalText = originalFileContents[actualFilePath] || '';
      const differences = FileDiffAnalyzer.findDifferences(
        originalText,
        modifiedContent as string,
      );
      const matchKeys = buildMatchKeys({ orlFilePath, actualFilePath });
      const allFileRules = collectRulesForFileKeys({
        matchKeys,
        fileToRules,
      });
      const reportFileRules = collectRulesForFileKeys({
        matchKeys,
        fileToRules: fileToReportRules,
      });

      for (const diff of differences) {
        const matchingRules = attributeRulesToDiff({
          allFileRules,
          reportFileRules,
          diagnosticRules: diagnosticRuleNames,
        });
        const fix: RemediationFix = {
          filepath: actualFilePath,
          oldLine: diff.originalLine,
          newLine: diff.newLines,
          codePosition: {
            line: diff.targetLine,
            column: 0,
          },
          lineOffset: 0,
          fixType: diff.type,
        };
        for (const ruleName of matchingRules) {
          const key = ruleFileRemediationKey(ruleName, actualFilePath);
          const existing = diffFixesByRuleFile.get(key) || [];
          existing.push(fix);
          diffFixesByRuleFile.set(key, existing);
        }
      }

      if (differences.length === 0) {
        continue;
      }

      const fileRules = collectRulesForFileKeys({ matchKeys, fileToRules });
      const counts: Record<string, number> = {};
      for (const ruleName of fileRules) {
        counts[ruleName] = (counts[ruleName] || 0) + differences.length;
      }
      const sortedWinners = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      let groupedDescriptionText: string | undefined;
      let groupedId = 'orl-rule:multiple';
      if (sortedWinners.length > 0) {
        const descs: string[] = [];
        for (const [r] of sortedWinners) {
          const d = ruleDescriptions[r] || r;
          if (!descs.includes(d)) {
            descs.push(d);
          }
        }
        groupedDescriptionText = descs.slice(0, 3).join(' | ');
        if (sortedWinners.length === 1) {
          groupedId = `orl-rule:${sortedWinners[0][0]}`;
        }
      }

      const findingsForFile = findingRows.filter(
        f => f.actualFilePath === actualFilePath,
      );

      groupedFixes.push({
        path: actualFilePath,
        content: Buffer.from(modifiedContent as string, 'utf8').toString(
          'base64',
        ),
        comments: differences.map((diff, index) => {
          const finding = findingsForFile[index];
          const line = finding
            ? toExtensionLine(finding.location.startLine)
            : diff.targetLine;
          const column = finding?.location.startColumn ?? 0;
          const localSorted = sortedWinners;
          let localName = groupedDescriptionText || 'Apply all fixes';
          let localId = groupedId;
          if (localSorted.length === 1) {
            localId = `orl-rule:${localSorted[0][0]}`;
            localName = ruleDescriptions[localSorted[0][0]] || localSorted[0][0];
          }
          return {
            position: { line, column },
            rule: {
              id: localId,
              name: localName,
              orlRuleNames: localSorted.map(([r]) => r).slice(0, 20),
            },
          };
        }),
      });

      if (!hasFindingLocations) {
        for (const diff of differences) {
          const matchingRules = attributeRulesToDiff({
            allFileRules,
            reportFileRules,
            diagnosticRules: diagnosticRuleNames,
          });
          const primaryRule = matchingRules[0] || 'ORL_REMEDIATION';
          const descriptionText = buildRuleDescriptionText({
            ruleName: primaryRule,
            ruleDescriptions,
            ruleShortNames,
          });
          const ruleIdentifier =
            matchingRules.length > 1
              ? 'orl-rule:multiple'
              : `orl-rule:${primaryRule}`;

          individualFixes.push({
            rule: {
              id: ruleIdentifier,
              identifier: ruleIdentifier,
              name: descriptionText,
              description: descriptionText,
              orlRuleNames: matchingRules,
            },
            fixes: [
              {
                filepath: actualFilePath,
                oldLine: diff.originalLine,
                newLine: diff.newLines,
                codePosition: {
                  line: diff.targetLine,
                  column: 0,
                },
                lineOffset: 0,
                fixType: diff.type,
              },
            ],
            codeObservation: {
              codeResourceInstance: {
                name: path.basename(actualFilePath),
                type: resolveCodeResourceType({
                  filePath: actualFilePath,
                  content: originalText,
                  filetype,
                }),
                filepath: actualFilePath,
                line: diff.targetLine,
              },
              disposition: 'NonCompliant',
            },
          });
        }
      }
    }

    if (hasFindingLocations) {
      for (const finding of findingRows) {
        const descriptionText = buildRuleDescriptionText({
          ruleName: finding.ruleName,
          ruleDescriptions,
          ruleShortNames,
        });
        const ruleIdentifier = `orl-rule:${finding.ruleName}`;
        const fixes =
          diffFixesByRuleFile.get(
            ruleFileRemediationKey(finding.ruleName, finding.actualFilePath),
          ) || [];

        individualFixes.push({
          rule: {
            id: ruleIdentifier,
            identifier: ruleIdentifier,
            name: descriptionText,
            description: descriptionText,
            orlRuleNames: [finding.ruleName],
          },
          fixes,
          findingLocation: {
            id: finding.location.id,
            filePath: finding.location.filePath,
            startLine: finding.location.startLine,
            startColumn: finding.location.startColumn,
            endLine: finding.location.endLine,
            endColumn: finding.location.endColumn,
          },
          codeObservation: {
            codeResourceInstance: {
              name: path.basename(finding.actualFilePath),
              type: resolveCodeResourceType({
                filePath: finding.actualFilePath,
                content:
                  originalFileContents[finding.actualFilePath] || '',
                filetype,
              }),
              filepath: finding.actualFilePath,
              line: toExtensionLine(finding.location.startLine),
            },
            disposition: 'NonCompliant',
          },
        });
      }
    }

    logger.info('Created fixes', {
      individualFixesCount: individualFixes.length,
      groupedFixesCount: groupedFixes.length,
      findingLocationsCount: findingRows.length,
    });

    return {
      individualFixes,
      groupedFixes,
      orlRuleDescriptions: ruleDescriptions,
      orlRuleShortNames: ruleShortNames,
    };
  }
}
