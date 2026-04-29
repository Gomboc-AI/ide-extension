import * as vscode from 'vscode';
import * as path from 'path';
import { z } from 'zod';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer, Difference } from '../utils/fileDiffAnalyzer';
import { DiffContentAnalyzer } from '../utils/diffContentAnalyzer';
import { parseOrlReport } from '../utils/orlReportParser';
import {
  buildLanguageDiagnosticContextWithFallback,
  chooseLanguageImplementation,
  makeIacScanReport,
} from '@gomboc-ai/gomboc-node-sdk';
import type { ScanRemediationPayload } from '../schemas/scanRemediation';
import { zOrlReport } from '../schemas/orlReport';

const zOrlDiagnosticFileResource = z
  .object({
    type: z.string().optional(),
    name: z.string().optional(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  })
  .passthrough();

const zOrlDiagnosticRuleFile = z
  .object({
    path: z.string(),
    hunks: z
      .array(
        z.object({
          startLine: z.number(),
          lineCount: z.number(),
          type: z.string().optional(),
        }),
      )
      .optional(),
    resources: z.array(zOrlDiagnosticFileResource).optional(),
  })
  .passthrough();
type OrlDiagnosticRuleFile = z.infer<typeof zOrlDiagnosticRuleFile>;
type OrlDiagnosticFileResource = z.infer<typeof zOrlDiagnosticFileResource>;
type LanguageHandler = ReturnType<typeof chooseLanguageImplementation>;
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
 * Attributes a diff to rules using a deterministic fallback waterfall.
 */
export function attributeRulesToDiff(args: {
  resourceName: string;
  resourceInstanceName: string | null;
  allFileRules: string[];
  reportFileRules: string[];
  diffLine: number;
  diffContent: string;
  properties: string[];
  handler: LanguageHandler;
  diagnosticRules: string[];
}): string[] {
  const dedupe = (rules: string[]): string[] =>
    Array.from(new Set(rules)).sort((a, b) => a.localeCompare(b));

  // Stage 1: when no concrete resource was identified, trust report changed-file attribution.
  if (args.resourceName === 'Resource' && args.reportFileRules.length > 0) {
    return dedupe(args.reportFileRules).slice(0, 20);
  }

  if (args.resourceName !== 'Resource' && args.allFileRules.length > 0) {
    // Stage 2: language-aware matching on the current resource.
    const matched = args.handler.matchRulesToDiff({
      blockType: args.resourceName,
      blockName: args.resourceInstanceName,
      allFileRules: args.allFileRules,
      diffLine: args.diffLine,
      diffContent: args.diffContent,
      properties: args.properties,
    });
    if (matched.length > 0) {
      return dedupe(matched);
    }
  }

  if (args.resourceName !== 'Resource' && args.allFileRules.length > 0) {
    // Stage 3: if handler cannot narrow further, use file-level rule attribution.
    return dedupe(args.allFileRules);
  }

  if (args.diagnosticRules.length > 0) {
    // Stage 4: final handler attempt against diagnostics-only rules.
    const matched = args.handler.matchRulesToDiff({
      blockType: args.resourceName,
      blockName: args.resourceInstanceName,
      allFileRules: args.diagnosticRules,
      diffLine: args.diffLine,
      diffContent: args.diffContent,
      properties: args.properties,
    });
    if (matched.length > 0) {
      return dedupe(matched);
    }
  }

  // Stage 5: ultimate fallback when no stronger signal is available.
  return dedupe(args.diagnosticRules).slice(0, 20);
}

/**
 * Utility class for converting ORL results to VS Code scan response format
 */
export class OrlResultConverter {
  private static getRuleFileResources(
    ruleFile: OrlDiagnosticRuleFile | undefined,
  ): OrlDiagnosticFileResource[] {
    const parsed = zOrlDiagnosticRuleFile.safeParse(ruleFile);
    if (!parsed.success) {
      return [];
    }
    return parsed.data.resources || [];
  }
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
    const rules = reportPayload.spec?.rules;
    if (!Array.isArray(rules)) {
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
    const rules = reportPayload.spec?.rules;
    if (!Array.isArray(rules)) {
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
    const rules = Array.isArray(reportPayload.spec?.rules)
      ? reportPayload.spec.rules
      : [];

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
    const { result, currentFilePath, originalFileContents } = args;
    // Create individual fixes based on actual differences between original and modified files
    const individualFixes: any[] = [];
    const groupedFixes: any[] = [];

    // Build mapping: file -> rules, and file -> resource instances -> rules
    const fileToResourceInstances: Record<
      string,
      Array<{ type: string; name: string; startLine: number; endLine: number }>
    > = {};
    const resourceInstanceToRules: Record<string, string[]> = {};

    // Pull per-rule changed files from the report (if present) as a reliable attribution source.
    // This avoids depending solely on hook diagnostics for file mapping.
    const reportRuleToChangedFiles =
      OrlResultConverter.extractChangedFilesByRuleFromReport(result.report);
    const { fileToRules, fileToReportRules } = buildFileToRulesMap({
      diagnostics: result.diagnostics,
      reportRuleToChangedFiles: reportRuleToChangedFiles,
    });

    logger.debug('Processing diagnostics', {
      hasDiagnostics: !!result.diagnostics,
      rulesCount: result.diagnostics?.rules?.length || 0,
      reportRuleChangedFilesCount: Object.keys(reportRuleToChangedFiles).length,
      sampleRules: result.diagnostics?.rules?.slice(0, 3).map(r => ({
        ruleName: r.ruleName,
        filesCount: r.files?.length || 0,
        filePaths: (r.files || []).map(f => f.path).slice(0, 3),
      })),
    });

    if (result.diagnostics?.rules?.length) {
      logger.debug('Built fileToRules mapping', {
        totalRules: result.diagnostics.rules.length,
        fileToRulesKeys: Object.keys(fileToRules),
        sampleMapping: Object.entries(fileToRules)
          .slice(0, 5)
          .map(([key, rules]) => ({
            file: key,
            rules: rules.slice(0, 2),
          })),
        diagnosticsFilePaths: result.diagnostics.rules
          .flatMap(r => (r.files || []).map(f => f.path))
          .slice(0, 5),
      });
    }

    logger.debug('Resource instance mapping', {
      fileToResourceInstances: Object.keys(fileToResourceInstances).length,
      resourceInstanceToRules: Object.keys(resourceInstanceToRules).length,
      resourceInstanceDetails: Object.entries(resourceInstanceToRules).map(
        ([key, rules]) => ({
          key,
          rules,
        }),
      ),
    });

    // Extract rule descriptions from ORL YAML report
    const ruleDescriptions =
      OrlResultConverter.extractRuleDescriptionsFromReport(result.report);
    const ruleShortNames = OrlResultConverter.extractRuleShortNamesFromReport(
      result.report,
    );

    logger.info('Rule descriptions extracted', {
      count: Object.keys(ruleDescriptions).length,
      sampleRules: Object.keys(ruleDescriptions).slice(0, 5),
      allRuleNames: Object.keys(ruleDescriptions),
      hasReport: !!result.report,
      reportLength: result.report?.length || 0,
    });

    for (const [orlFilePath, modifiedContent] of Object.entries(
      result.modifiedFiles,
    )) {
      // Convert ORL path (/workspace/file.tf) to actual file path
      const actualFilePath = PathConverter.convertOrlPathToActualPath(
        orlFilePath as string,
        currentFilePath,
      );

      const originalText = originalFileContents[actualFilePath] || '';

      // Resolve the language handler once per file
      const handler = chooseLanguageImplementation({
        filePath: actualFilePath,
        content: originalText,
      });

      // Find the differences between original and modified content.
      // Keep this as debug to avoid heavy string splitting on large scans.
      logger.debug('File content comparison', {
        file: actualFilePath,
        originalLength: originalText.length,
        modifiedLength: (modifiedContent as string).length,
      });

      const differences = FileDiffAnalyzer.findDifferences(
        originalText,
        modifiedContent as string,
      );

      if (differences.length === 0) {
        logger.info('No differences found for file', { file: actualFilePath });
        continue;
      }

      logger.debug('Found differences in file', {
        file: actualFilePath,
        differenceCount: differences.length,
        differences: differences.map((d: Difference) => ({
          line: d.targetLine,
          type: d.type,
          newLinesCount: d.newLines.length,
          newLines: d.newLines.slice(0, 3), // Show first 3 lines of changes
        })),
      });

      // Create individual fixes for each difference found
      // This ensures we always create the correct number of fixes
      for (let i = 0; i < differences.length; i++) {
        const diff = differences[i];

        // Resolve resource context through the centralized language handler stack.
        let resourceName = 'Resource';
        let resourceInstanceName: string | null = null;
        const baseName = path.basename(actualFilePath).toLowerCase();
        let resourceStartLine = -1;
        let resourceEndLine = -1;
        const languageDiagnosticContext =
          buildLanguageDiagnosticContextWithFallback({
            filePath: actualFilePath,
            originalContent: originalText,
            modifiedContent: modifiedContent as string,
            line: diff.targetLine,
            newLines: diff.newLines,
          });
        const selectedResource =
          languageDiagnosticContext.block ||
          languageDiagnosticContext.nearestBlock;
        if (selectedResource) {
          resourceName = selectedResource.type;
          resourceInstanceName = selectedResource.name || null;
          resourceStartLine = selectedResource.startLine - 1;
          resourceEndLine = selectedResource.endLine - 1;
        } else {
          // Delegate block description to the language handler
          const blockDesc = handler.describeBlock({
            filePath: actualFilePath,
            content: originalText,
            line: diff.targetLine,
          });
          resourceName = blockDesc.blockType;
          resourceInstanceName = blockDesc.blockName;
          resourceStartLine = blockDesc.blockStartLine;
          resourceEndLine = blockDesc.blockEndLine;
        }

        logger.debug('Identified resource for diff', {
          languageId: languageDiagnosticContext.languageId,
          resourceType: resourceName,
          resourceInstance: resourceInstanceName,
          diffLine: diff.targetLine,
          resourceStartLine:
            resourceStartLine >= 0 ? resourceStartLine + 1 : null,
          resourceEndLine: resourceEndLine >= 0 ? resourceEndLine + 1 : null,
        });

        // Prefer anchoring diagnostics at the start of the resource block.
        // This improves UX vs highlighting the closing brace or the very bottom of a block.
        const diagnosticAnchorLine =
          languageDiagnosticContext?.diagnosticAnchorLine &&
          languageDiagnosticContext.diagnosticAnchorLine > 0
            ? languageDiagnosticContext.diagnosticAnchorLine
            : resourceStartLine >= 0
              ? resourceStartLine + 1
              : diff.targetLine;

        // Keep language-specific fallback behavior in handlers.
        const resourceHeader = (() => {
          if (languageDiagnosticContext?.blockHeader) {
            return languageDiagnosticContext.blockHeader;
          }
          if (
            resourceName &&
            resourceName !== 'Resource' &&
            resourceInstanceName &&
            resourceInstanceName.trim()
          ) {
            return `resource "${resourceName}" "${resourceInstanceName}"`;
          }
          if (resourceName && resourceName !== 'Resource') {
            return resourceInstanceName
              ? `${resourceName}.${resourceInstanceName}`
              : resourceName;
          }
          return path.basename(actualFilePath);
        })();

        // Analyze the diff content to extract meaningful information
        // This can help identify which attributes were changed, which might help
        // narrow down which rules applied (though we're still limited by file-level hooks)
        const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

        // Note: We could potentially use analysis.properties to further filter rules,
        // but without instance-level tracking from hooks, we can't be 100% accurate
        // when multiple resources of the same type exist in the same file.

        // Attribute to rules using file-level mapping from diagnostics
        // Since hooks provide file paths (not hunks), we attribute all diffs in a file to rules that touched it
        const matchKeys: string[] = [];
        // Keys to try: ORL path, actual path, basename, ORL path without /workspace prefix
        const orlNorm = (orlFilePath as string).replace(/^\/workspace\/+/, '');
        matchKeys.push(
          orlFilePath as string,
          orlNorm,
          path.basename(orlNorm),
          actualFilePath,
          path.basename(actualFilePath),
        );

        // Find all rules that touched this file
        const allFileRules: string[] = [];
        for (const key of matchKeys) {
          const rules = fileToRules[key];
          if (rules) {
            for (const ruleName of rules) {
              if (!allFileRules.includes(ruleName)) {
                allFileRules.push(ruleName);
              }
            }
          }
        }

        // Rules that (per the ORL report) actually changed this file.
        // This is the strongest signal for attribution, and it avoids relying on rule-name substrings.
        const reportFileRules: string[] = [];
        for (const key of matchKeys) {
          const rules = fileToReportRules[key];
          if (rules) {
            for (const ruleName of rules) {
              if (!reportFileRules.includes(ruleName)) {
                reportFileRules.push(ruleName);
              }
            }
          }
        }

        logger.debug('File-to-rules matching attempt', {
          file: actualFilePath,
          orlPath: orlFilePath,
          matchKeys,
          allFileRules,
          allFileRulesCount: allFileRules.length,
          availableFileToRulesKeys: Object.keys(fileToRules).slice(0, 10),
          foundMatches: matchKeys
            .filter(k => fileToRules[k])
            .map(k => ({
              key: k,
              rules: fileToRules[k],
            })),
        });

        const diffLine = diff.targetLine;

        logger.debug('Starting rule matching', {
          file: actualFilePath,
          resourceName,
          resourceInstanceName,
          resourceStartLine,
          resourceEndLine,
          diffLine,
          allFileRulesCount: allFileRules.length,
          allFileRules: allFileRules.slice(0, 3),
        });

        const matchingRules = attributeRulesToDiff({
          resourceName,
          resourceInstanceName,
          allFileRules,
          reportFileRules,
          diffLine,
          diffContent: diff.newLines.join('\n'),
          properties: analysis.properties || [],
          handler,
          diagnosticRules: (result.diagnostics?.rules || []).map(
            r => r.ruleName,
          ),
        });

        // Get rule descriptions
        let aggregatedDescriptions: string[] = [];
        let primaryRule = 'ORL_REMEDIATION';
        if (matchingRules.length > 0) {
          primaryRule = matchingRules[0];
          const descs: string[] = [];

          for (const ruleName of matchingRules) {
            const d = pickBestRuleDescription(ruleName, ruleDescriptions);

            if (d && !descs.includes(d)) {
              descs.push(d);
            }
          }
          aggregatedDescriptions = descs;

          // Debug logging
          if (aggregatedDescriptions.length === 0) {
            const sampleRule = matchingRules[0] || '';
            logger.warn('No descriptions found for matching rules', {
              matchingRules: matchingRules.slice(0, 5),
              matchingRulesCount: matchingRules.length,
              availableRuleNames: Object.keys(ruleDescriptions),
              availableRuleNamesCount: Object.keys(ruleDescriptions).length,
              sampleDiagnosticRule: sampleRule,
              normalizedSample: normalizeRuleName(sampleRule),
              normalizedAvailable: Object.keys(ruleDescriptions).map(n => ({
                original: n,
                normalized: normalizeRuleName(n),
              })),
              // Try to find any partial matches for debugging
              partialMatches: Object.keys(ruleDescriptions).filter(rn => {
                const normRn = normalizeRuleName(rn);
                const normSample = normalizeRuleName(sampleRule);
                return (
                  normRn.includes(normSample) || normSample.includes(normRn)
                );
              }),
            });
          } else {
            logger.debug('Successfully matched rule descriptions', {
              matchingRules: matchingRules.slice(0, 3),
              descriptionsCount: aggregatedDescriptions.length,
              sampleDescription: aggregatedDescriptions[0]?.substring(0, 100),
            });
          }
        }

        // Format: Resource Name followed by descriptions
        // Use Markdown formatting for better structure and sections
        let descriptionText: string;
        const displayResourceName = handler.formatBlockDisplayName({
          blockType: resourceName,
          blockName: resourceInstanceName,
          filePath: actualFilePath,
        });
        if (aggregatedDescriptions.length > 0) {
          // Format as: Resource Name\nDescription1\nDescription2 (single newlines, no extra spacing)
          const descriptions = aggregatedDescriptions.slice(0, 5).join('\n');
          descriptionText = `${displayResourceName}\n${descriptions}`;
        } else {
          // Fallback if no descriptions found
          descriptionText = `${displayResourceName}\n${analysis.description || 'Update configuration for resource'}`;
        }

        // Note: VS Code Diagnostic messages support MarkdownString for rich formatting
        // You can use MarkdownString to create sections like:
        // const markdown = new vscode.MarkdownString();
        // markdown.appendMarkdown(`### ${resourceName}\n\n`);
        // markdown.appendMarkdown(`**Rules Applied:**\n`);
        // descriptions.forEach(desc => markdown.appendMarkdown(`- ${desc}\n`));
        // markdown.appendMarkdown(`\n**Additional Info:**\n...`);
        // Then use markdown.value as the message

        const ruleIdentifier =
          matchingRules.length > 1
            ? 'orl-rule:multiple'
            : `orl-rule:${primaryRule}`;

        const fix = {
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

        // Create individual fix for this specific difference using rule-centric remediation shape
        const individualFix = {
          rule: {
            id: ruleIdentifier,
            identifier: ruleIdentifier,
            // Prefer rule metadata.annotations["gomboc-ai/description-plain"] (fallback: metadata.description)
            name: descriptionText,
            description: descriptionText,
            // Not part of the GraphQL schema; used internally for analytics attribution.
            orlRuleNames: matchingRules,
          },
          fixes: [fix],
          codeObservation: {
            codeResourceInstance: {
              name: resourceHeader,
              type: handler.codeResourceType,
              filepath: actualFilePath,
              line: diagnosticAnchorLine,
            },
            disposition: 'NonCompliant' as const,
          },
        };

        individualFixes.push(individualFix);
      }

      // Create grouped fix for the entire file
      // Heuristic: aggregate rule descriptions across all hunks in this file
      const diffs = differences;
      const counts: Record<string, number> = {};
      const orlNorm = (orlFilePath as string).replace(/^\/workspace\/+/, '');
      const keys = [
        orlFilePath as string,
        orlNorm,
        path.basename(orlNorm),
        actualFilePath,
        path.basename(actualFilePath),
      ];
      // Count rules that touched this file (file-level attribution)
      for (const key of keys) {
        const rules = fileToRules[key];
        if (!rules) {
          continue;
        }
        for (const ruleName of rules) {
          // Count each diff as 1 for this rule (simple file-level attribution)
          counts[ruleName] = (counts[ruleName] || 0) + diffs.length;
        }
      }
      const sortedWinners = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      let groupedDescriptionText: string | undefined = undefined;
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
      const groupedFix = {
        path: actualFilePath,
        content: Buffer.from(modifiedContent as string, 'utf8').toString(
          'base64',
        ),
        comments: differences.map((diff: Difference, i: number) => {
          const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);
          // Per-diff aggregation (to keep comment consistent with individual fix)
          // Use file-level attribution (all rules that touched this file)
          const localCounts: Record<string, number> = {};
          for (const key of keys) {
            const rules = fileToRules[key];
            if (!rules) {
              continue;
            }
            for (const ruleName of rules) {
              localCounts[ruleName] = (localCounts[ruleName] || 0) + 1;
            }
          }
          const localSorted = Object.entries(localCounts).sort(
            (a, b) => b[1] - a[1],
          );
          let localName = analysis.description;
          let localId = 'orl-rule:multiple';
          if (localSorted.length > 0) {
            const descs: string[] = [];
            for (const [r] of localSorted) {
              const d = ruleDescriptions[r] || r;
              if (!descs.includes(d)) {
                descs.push(d);
              }
            }
            localName = descs.slice(0, 3).join(' | ') || analysis.description;
            if (localSorted.length === 1) {
              localId = `orl-rule:${localSorted[0][0]}`;
            }
          }
          return {
            position: {
              line: diff.targetLine,
              column: 0,
            },
            rule: {
              id: groupedId || localId,
              name: groupedDescriptionText || localName || analysis.description,
              // Not part of the GraphQL schema; used internally for analytics attribution.
              orlRuleNames: localSorted.map(([r]) => r).slice(0, 20),
            },
          };
        }),
      };

      groupedFixes.push(groupedFix);
    }

    logger.info('Created fixes', {
      individualFixesCount: individualFixes.length,
      groupedFixesCount: groupedFixes.length,
    });

    return {
      individualFixes,
      groupedFixes,
      orlRuleDescriptions: ruleDescriptions,
      orlRuleShortNames: ruleShortNames,
    };
  }
}
