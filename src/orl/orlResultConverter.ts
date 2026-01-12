import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer, Difference } from '../utils/fileDiffAnalyzer';
import { DiffContentAnalyzer } from '../utils/diffContentAnalyzer';
import { parseOrlReport } from '../utils/orlReportParser';

export interface OrlResult {
  success: boolean;
  modifiedFiles: { [filePath: string]: string };
  report?: string;
  error?: string;
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
      }>;
    }>;
  };
}

export interface ScanResponse {
  individualFixes: any[];
  groupedFixes: any[];
  // Optional debug/UX data for ORL-only flows (not part of API GraphQL types).
  // Used to show stable per-rule diagnostics even when our per-hunk attribution is fuzzy.
  orlRuleDescriptions?: Record<string, string>;
  // Optional short names for display in Problems tab.
  orlRuleShortNames?: Record<string, string>;
}

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
    if (!parsed || typeof parsed !== 'object') {
      return out;
    }
    const spec = (parsed as any).spec;
    const rules = spec?.rules;
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
    if (!report) {
      logger.warn('No report provided to extractRuleDescriptionsFromReport');
      return {};
    }

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

    logger.debug('Extracting from report', {
      reportLength: report.length,
      yamlReportLength: yamlReport.length,
      cleanReportLength: cleanReport.length,
      hasTypeReport: cleanReport.includes('type: Report'),
      firstLines: cleanReport.split('\n').slice(0, 10),
    });

    const lines = cleanReport.split('\n');
    const descriptions: Record<string, string> = {};
    let inSpec = false;
    let inRules = false;
    let currentRuleName: string | null = null;
    let metadataName: string | null = null;
    let currentRuleIndent = 0;
    let inMetadata = false;
    let metadataIndent = 0;
    let pendingDescription: string | null = null;

    const getIndent = (s: string) => s.match(/^(\s*)/)?.[1]?.length ?? 0;
    const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '');

    const saveDescription = (ruleName: string, desc: string) => {
      if (ruleName && desc) {
        descriptions[ruleName] = desc;
        // Also save using metadata.name if different
        if (metadataName && metadataName !== ruleName) {
          descriptions[metadataName] = desc;
        }
        logger.debug('Extracted rule description', {
          ruleName,
          metadataName,
          description: desc.substring(0, 50) + '...',
        });
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = getIndent(line);
      const trimmed = line.trim();

      // Look for spec: section first
      if (!inSpec) {
        if (trimmed === 'spec:' || trimmed.startsWith('spec:')) {
          inSpec = true;
          continue;
        }
        continue;
      }

      // Now look for rules: inside spec:
      if (!inRules) {
        if (trimmed === 'rules:' || trimmed.startsWith('rules:')) {
          inRules = true;
          logger.debug('Found rules section', { lineNumber: i, indent });
          continue;
        }
        // If we're in spec but hit a top-level key (indent 0), we've left spec
        if (indent === 0 && trimmed && !trimmed.startsWith(' ')) {
          inSpec = false;
        }
        continue;
      }

      // End rules section when we hit a top-level key (indent 0, not a list item)
      if (
        indent === 0 &&
        !trimmed.startsWith('- ') &&
        trimmed !== 'rules:' &&
        trimmed !== ''
      ) {
        inRules = false;
        if (currentRuleName && pendingDescription) {
          saveDescription(currentRuleName, pendingDescription);
        } else if (metadataName && pendingDescription) {
          saveDescription(metadataName, pendingDescription);
        }
        currentRuleName = null;
        metadataName = null;
        inMetadata = false;
        pendingDescription = null;
        continue;
      }

      // New rule item (list item starts with '- ')
      if (trimmed.startsWith('- ')) {
        // Save previous rule's description if we had one
        if (currentRuleName && pendingDescription) {
          saveDescription(currentRuleName, pendingDescription);
        } else if (metadataName && pendingDescription) {
          saveDescription(metadataName, pendingDescription);
        }
        currentRuleName = null;
        metadataName = null;
        inMetadata = false;
        pendingDescription = null;
        // The indent of the list item line (spaces before '- ')
        currentRuleIndent = indent;

        // Check if metadata: is on the same line as '- '
        const afterDash = trimmed.substring(2).trim();
        if (afterDash.startsWith('metadata:')) {
          inMetadata = true;
          // metadata: is on same line, so metadataIndent is the same as the line
          metadataIndent = indent;
          logger.debug('New rule item with metadata on same line', {
            lineNumber: i,
            indent,
            currentRuleIndent,
            metadataIndent,
            line: line.substring(0, 80),
          });
        } else {
          logger.debug('New rule item', {
            lineNumber: i,
            indent,
            currentRuleIndent,
            line: line.substring(0, 80),
          });
        }
        continue;
      }

      // Skip empty lines
      if (trimmed === '') {
        continue;
      }

      // Within a rule block (indented more than the list item)
      // Note: After '- metadata:', the next line might be at same indent or more
      if (
        indent > currentRuleIndent ||
        (indent === currentRuleIndent && !trimmed.startsWith('-'))
      ) {
        // Check if we're entering metadata section (on its own line)
        if (trimmed.startsWith('metadata:')) {
          inMetadata = true;
          metadataIndent = indent;
          logger.debug('Entered metadata section (own line)', {
            lineNumber: i,
            indent,
            metadataIndent,
            currentRuleIndent,
            line: line.substring(0, 80),
          });
          continue;
        }

        // Check if we're in metadata section
        // metadata: is at indent X, so metadata contents are at indent > X
        if (inMetadata) {
          logger.debug('In metadata section, checking line', {
            lineNumber: i,
            indent,
            metadataIndent,
            indentGreater: indent > metadataIndent,
            trimmed: trimmed.substring(0, 50),
          });

          if (indent > metadataIndent) {
            if (trimmed.startsWith('name:')) {
              // metadata.name
              const nm = trimmed.match(/^name:\s*(.+)\s*$/);
              if (nm) {
                metadataName = unquote(nm[1].trim());
                logger.debug('Found metadata.name', {
                  metadataName,
                  lineNumber: i,
                  indent,
                  metadataIndent,
                });
                // If we already have a description, save it
                if (pendingDescription) {
                  saveDescription(metadataName, pendingDescription);
                }
              }
            } else if (trimmed.startsWith('description:')) {
              // Description can be on same line or next line(s)
              let desc = trimmed.replace(/^description:\s*/, '').trim();

              // Handle multi-line descriptions with | or > indicators
              if (
                desc === '' ||
                desc === '|' ||
                desc === '>' ||
                desc.startsWith('|') ||
                desc.startsWith('>')
              ) {
                // Multi-line description - look ahead
                let descLines: string[] = [];
                const descIndent = indent; // The indent of the description: line

                for (let j = i + 1; j < lines.length; j++) {
                  const nextLine = lines[j];
                  const nextIndent = getIndent(nextLine);
                  const nextTrimmed = nextLine.trim();

                  // Stop when we hit same or less indent than metadata (end of metadata block)
                  if (nextIndent <= metadataIndent) {
                    break;
                  }

                  // Stop if we hit another key at the same indent as description:
                  if (
                    nextIndent === descIndent &&
                    nextTrimmed &&
                    !nextTrimmed.startsWith(' ') &&
                    nextTrimmed.includes(':')
                  ) {
                    break;
                  }

                  // Include lines that are indented more than the description: line
                  if (nextIndent > descIndent) {
                    // Remove the extra indent to get the actual content
                    const content = nextLine.substring(nextIndent);
                    descLines.push(content);
                  } else if (
                    nextIndent === descIndent &&
                    nextTrimmed &&
                    !nextTrimmed.includes(':')
                  ) {
                    // Same indent but not a key - might be continuation (shouldn't happen with | but handle it)
                    descLines.push(nextTrimmed);
                  } else {
                    break;
                  }
                }
                desc = descLines.join('\n').trim();
              }

              const cleaned = unquote(desc);
              logger.debug('Processing description line', {
                originalDesc: desc.substring(0, 50),
                cleaned: cleaned ? cleaned.substring(0, 50) : 'EMPTY',
                hasMetadataName: !!metadataName,
                lineNumber: i,
                indent,
                metadataIndent,
                inMetadata,
              });
              if (cleaned) {
                pendingDescription = cleaned;
                logger.debug('Found description in metadata', {
                  metadataName,
                  description: cleaned.substring(0, 100),
                  lineNumber: i,
                });
                // If we already have a name, save it now
                if (metadataName) {
                  saveDescription(metadataName, cleaned);
                }
              } else {
                logger.debug('Description was empty after cleaning', {
                  originalDesc: desc,
                  cleaned,
                  lineNumber: i,
                });
              }
            }
          }
          continue;
        }

        // Check if we found the rule-level name (at same level as metadata, not inside it)
        if (!inMetadata && trimmed.startsWith('name:')) {
          const nm = trimmed.match(/^name:\s*(.+)\s*$/);
          if (nm) {
            currentRuleName = unquote(nm[1].trim());
            // If we already have a pending description, save it now
            if (pendingDescription) {
              saveDescription(currentRuleName, pendingDescription);
            }
          }
          continue;
        }
      } else {
        // We've left the current rule block
        if (currentRuleName && pendingDescription) {
          saveDescription(currentRuleName, pendingDescription);
        } else if (metadataName && pendingDescription) {
          saveDescription(metadataName, pendingDescription);
        }
        currentRuleName = null;
        metadataName = null;
        inMetadata = false;
        pendingDescription = null;
      }
    }

    // Don't forget the last rule
    if (currentRuleName && pendingDescription) {
      saveDescription(currentRuleName, pendingDescription);
    } else if (metadataName && pendingDescription) {
      saveDescription(metadataName, pendingDescription);
    }

    logger.info('Extracted rule descriptions', {
      count: Object.keys(descriptions).length,
      sampleRules: Object.keys(descriptions).slice(0, 5),
      allRuleNames: Object.keys(descriptions),
      sampleDescriptions: Object.entries(descriptions)
        .slice(0, 3)
        .map(([name, desc]) => ({
          name,
          descriptionPreview: desc.substring(0, 100),
        })),
    });

    return descriptions;
  }

  private static extractRuleShortNamesFromReport(
    report?: string,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    const parsed = parseOrlReport(report);
    if (!parsed || typeof parsed !== 'object') {
      return out;
    }
    const spec = (parsed as any).spec;
    const rules = spec?.rules;
    if (!Array.isArray(rules)) {
      return out;
    }

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

    for (const r of rules) {
      const ruleName: string | undefined =
        (typeof r?.name === 'string' && r.name) ||
        (typeof r?.metadata?.name === 'string' && r.metadata.name) ||
        undefined;
      if (!ruleName) {
        continue;
      }

      const displayName: string | undefined =
        (typeof r?.metadata?.display_name === 'string' &&
          r.metadata.display_name) ||
        (typeof r?.metadata?.displayName === 'string' &&
          r.metadata.displayName) ||
        undefined;

      const cleaned = stripOrlInstanceSuffix(ruleName);
      const fallback = cleaned.split('/').pop() || cleaned;
      out[ruleName] = (displayName && displayName.trim()) || fallback;
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
    // Create individual fixes based on actual differences between original and modified files
    const individualFixes: any[] = [];
    const groupedFixes: any[] = [];

    // Build file-to-rules mapping from diagnostics
    // Since we simplified hooks to only provide file paths (not hunks), we do file-level attribution
    const fileToRules: Record<string, string[]> = {};
    const addFileKeys = (p: string): string[] => {
      const keys = new Set<string>();
      const norm = p.replace(/^[.][/]/, '');
      keys.add(norm);
      keys.add(norm.startsWith('/') ? norm : '/' + norm);
      keys.add(path.basename(norm));
      // Also add /workspace/ prefix variants
      keys.add('/workspace/' + norm);
      keys.add('/workspace/' + norm.replace(/^\//, ''));
      return Array.from(keys);
    };
    // Build mapping: file -> rules, and file -> resource instances -> rules
    const fileToResourceInstances: Record<
      string,
      Array<{ type: string; name: string; startLine: number; endLine: number }>
    > = {};
    const resourceInstanceToRules: Record<string, string[]> = {};
    const fileToReportRules: Record<string, string[]> = {};

    // Pull per-rule changed files from the report (if present) as a reliable attribution source.
    // This avoids depending solely on hook diagnostics for file mapping.
    const reportRuleToChangedFiles =
      OrlResultConverter.extractChangedFilesByRuleFromReport(result.report);

    // Seed fileToRules with report-derived changed-file mappings first.
    for (const [ruleName, paths] of Object.entries(reportRuleToChangedFiles)) {
      for (const p of paths) {
        const keys = addFileKeys(p);
        for (const k of keys) {
          if (!fileToRules[k]) {
            fileToRules[k] = [];
          }
          if (!fileToRules[k].includes(ruleName)) {
            fileToRules[k].push(ruleName);
          }
          if (!fileToReportRules[k]) {
            fileToReportRules[k] = [];
          }
          if (!fileToReportRules[k].includes(ruleName)) {
            fileToReportRules[k].push(ruleName);
          }
        }
      }
    }

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
      for (const r of result.diagnostics.rules) {
        const files = r.files || [];
        for (const f of files) {
          const keys = addFileKeys(f.path);
          for (const k of keys) {
            if (!fileToRules[k]) {
              fileToRules[k] = [];
            }
            if (!fileToRules[k].includes(r.ruleName)) {
              fileToRules[k].push(r.ruleName);
            }
          }

          // Track file-level rules (resource-level matching happens later when processing diffs)
          // In non-dry-run mode, resources_modified.json should contain the actual modified resources
          // from hash comparison, enabling precise attribution
        }
      }

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

      // Read the original file content
      const originalContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(actualFilePath),
      );
      const originalText = new TextDecoder().decode(originalContent);

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

        // Extract resource type and instance name from the actual file content at the diff line
        // Look backwards from the diff line to find the resource definition
        // This helps distinguish between multiple resources of the same type in the same file
        let resourceName = 'Resource';
        let resourceInstanceName: string | null = null;
        const fileLines = originalText.split('\n');
        const diffLineIndex = diff.targetLine - 1; // Convert to 0-based index

        // Check if this is a Dockerfile
        const isDockerfile =
          actualFilePath.toLowerCase().includes('dockerfile') ||
          path.basename(actualFilePath).toLowerCase().startsWith('dockerfile');

        // Check if this is a Kubernetes YAML file
        // Kubernetes manifests have both kind: and apiVersion: at the top level
        const isKubernetes =
          (filetype === 'yaml' || filetype === 'yml') &&
          originalText.includes('kind:') &&
          originalText.includes('apiVersion:');

        // Search backwards from the diff line to find the resource definition
        // Also track where this resource block ends to identify the specific instance
        let resourceStartLine = -1;
        let resourceEndLine = -1;

        if (isDockerfile) {
          // For Dockerfiles, look for FROM instructions (build stages)
          for (
            let lineIdx = Math.min(diffLineIndex, fileLines.length - 1);
            lineIdx >= 0;
            lineIdx--
          ) {
            const line = fileLines[lineIdx].trim();
            // Skip comments and empty lines
            if (!line || line.startsWith('#')) {
              continue;
            }
            // Look for FROM instruction: FROM image[:tag] [AS stage_name]
            const fromMatch = line.match(
              /^FROM\s+(?:--[^\s]+\s+)?([^\s]+(?::[^\s]+)?)(?:\s+AS\s+(\S+))?/i,
            );
            if (fromMatch) {
              resourceName = 'docker_stage';
              resourceInstanceName = fromMatch[2] || fromMatch[1]; // Use stage name if present, otherwise image name
              resourceStartLine = lineIdx;
              // For Dockerfiles, the stage ends at the next FROM or end of file
              resourceEndLine = fileLines.length - 1; // Default to end of file
              for (let j = lineIdx + 1; j < fileLines.length; j++) {
                const nextLine = fileLines[j].trim();
                if (nextLine && !nextLine.startsWith('#')) {
                  if (nextLine.match(/^FROM\s+/i)) {
                    resourceEndLine = j - 1;
                    break;
                  }
                }
              }
              break;
            }
            // Stop searching if we've gone too far back (more than 50 lines)
            if (diffLineIndex - lineIdx > 50) {
              break;
            }
          }

          // If we didn't find it in the original file, try the modified content
          if (resourceName === 'Resource') {
            const modifiedLines = (modifiedContent as string).split('\n');
            for (
              let lineIdx = Math.min(diffLineIndex, modifiedLines.length - 1);
              lineIdx >= 0;
              lineIdx--
            ) {
              const line = modifiedLines[lineIdx].trim();
              if (!line || line.startsWith('#')) {
                continue;
              }
              const fromMatch = line.match(
                /^FROM\s+(?:--[^\s]+\s+)?([^\s]+(?::[^\s]+)?)(?:\s+AS\s+(\S+))?/i,
              );
              if (fromMatch) {
                resourceName = 'docker_stage';
                resourceInstanceName = fromMatch[2] || fromMatch[1];
                resourceStartLine = lineIdx;
                resourceEndLine = modifiedLines.length - 1;
                for (let j = lineIdx + 1; j < modifiedLines.length; j++) {
                  const nextLine = modifiedLines[j].trim();
                  if (nextLine && !nextLine.startsWith('#')) {
                    if (nextLine.match(/^FROM\s+/i)) {
                      resourceEndLine = j - 1;
                      break;
                    }
                  }
                }
                break;
              }
              if (diffLineIndex - lineIdx > 50) {
                break;
              }
            }
          }
        } else if (isKubernetes) {
          // For Kubernetes YAML files, look for kind: and metadata.name:
          // Kubernetes resources have:
          //   apiVersion: v1
          //   kind: Deployment
          //   metadata:
          //     name: my-app
          // Strategy: Search backwards to find kind:, then search forwards from kind: to find metadata.name:

          // First, find kind: by searching backwards
          let kindLineIdx = -1;
          for (
            let lineIdx = Math.min(diffLineIndex, fileLines.length - 1);
            lineIdx >= 0;
            lineIdx--
          ) {
            const line = fileLines[lineIdx];
            const trimmed = line.trim();
            const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
              continue;
            }

            // Look for kind: (must be at top level, indent 0)
            if (indent === 0 && trimmed.startsWith('kind:')) {
              const kindMatch = trimmed.match(/^kind:\s*(.+)$/);
              if (kindMatch) {
                resourceName = kindMatch[1].trim();
                resourceStartLine = lineIdx;
                kindLineIdx = lineIdx;
                break; // Found kind, now search forwards for metadata.name
              }
            }

            // Stop searching if we've gone too far back (more than 100 lines for K8s)
            if (diffLineIndex - lineIdx > 100) {
              break;
            }
          }

          // If we found kind:, search forwards to find metadata.name:
          if (kindLineIdx >= 0) {
            let inMetadata = false;
            let metadataIndent = 0;

            for (
              let lineIdx = kindLineIdx + 1;
              lineIdx < fileLines.length;
              lineIdx++
            ) {
              const line = fileLines[lineIdx];
              const trimmed = line.trim();
              const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

              // Skip empty lines and comments
              if (!trimmed || trimmed.startsWith('#')) {
                continue;
              }

              // Look for metadata: section
              if (trimmed.startsWith('metadata:')) {
                inMetadata = true;
                metadataIndent = indent;
                continue;
              }

              // If we're in metadata section, look for name:
              if (inMetadata && indent > metadataIndent) {
                if (trimmed.startsWith('name:')) {
                  const nameMatch = trimmed.match(/^name:\s*(.+)$/);
                  if (nameMatch) {
                    resourceInstanceName = nameMatch[1]
                      .trim()
                      .replace(/^["']|["']$/g, '');
                    // Found both kind and name, now find the end of this resource
                    resourceEndLine = fileLines.length - 1;
                    for (let j = lineIdx + 1; j < fileLines.length; j++) {
                      const nextLine = fileLines[j];
                      const nextTrimmed = nextLine.trim();
                      const nextIndent =
                        nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
                      // Next resource starts with --- separator or apiVersion: at top level
                      if (
                        nextTrimmed === '---' ||
                        (nextIndent === 0 &&
                          nextTrimmed.startsWith('apiVersion:'))
                      ) {
                        resourceEndLine = j - 1;
                        break;
                      }
                    }
                    break; // Found everything we need
                  }
                }
                // If we hit a key at same indent as metadata, we've left metadata section
                if (indent === metadataIndent && trimmed.includes(':')) {
                  inMetadata = false;
                }
              } else if (inMetadata && indent <= metadataIndent) {
                // We've left the metadata section
                inMetadata = false;
              }

              // Stop searching if we've gone too far forward (more than 200 lines)
              if (lineIdx - kindLineIdx > 200) {
                break;
              }
            }
          }

          // If we didn't find it in the original file, try the modified content
          if (resourceName === 'Resource' || resourceInstanceName === null) {
            const modifiedLines = (modifiedContent as string).split('\n');

            // First, find kind: by searching backwards
            let kindLineIdx = -1;
            for (
              let lineIdx = Math.min(diffLineIndex, modifiedLines.length - 1);
              lineIdx >= 0;
              lineIdx--
            ) {
              const line = modifiedLines[lineIdx];
              const trimmed = line.trim();
              const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

              if (!trimmed || trimmed.startsWith('#')) {
                continue;
              }

              if (indent === 0 && trimmed.startsWith('kind:')) {
                const kindMatch = trimmed.match(/^kind:\s*(.+)$/);
                if (kindMatch) {
                  resourceName = kindMatch[1].trim();
                  resourceStartLine = lineIdx;
                  kindLineIdx = lineIdx;
                  break;
                }
              }

              if (diffLineIndex - lineIdx > 100) {
                break;
              }
            }

            // If we found kind:, search forwards to find metadata.name:
            if (kindLineIdx >= 0) {
              let inMetadata = false;
              let metadataIndent = 0;

              for (
                let lineIdx = kindLineIdx + 1;
                lineIdx < modifiedLines.length;
                lineIdx++
              ) {
                const line = modifiedLines[lineIdx];
                const trimmed = line.trim();
                const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

                if (!trimmed || trimmed.startsWith('#')) {
                  continue;
                }

                if (trimmed.startsWith('metadata:')) {
                  inMetadata = true;
                  metadataIndent = indent;
                  continue;
                }

                if (inMetadata && indent > metadataIndent) {
                  if (trimmed.startsWith('name:')) {
                    const nameMatch = trimmed.match(/^name:\s*(.+)$/);
                    if (nameMatch) {
                      resourceInstanceName = nameMatch[1]
                        .trim()
                        .replace(/^["']|["']$/g, '');
                      resourceEndLine = modifiedLines.length - 1;
                      for (let j = lineIdx + 1; j < modifiedLines.length; j++) {
                        const nextLine = modifiedLines[j];
                        const nextTrimmed = nextLine.trim();
                        const nextIndent =
                          nextLine.match(/^(\s*)/)?.[1]?.length ?? 0;
                        if (
                          nextTrimmed === '---' ||
                          (nextIndent === 0 &&
                            nextTrimmed.startsWith('apiVersion:'))
                        ) {
                          resourceEndLine = j - 1;
                          break;
                        }
                      }
                      break;
                    }
                  }
                  if (indent === metadataIndent && trimmed.includes(':')) {
                    inMetadata = false;
                  }
                } else if (inMetadata && indent <= metadataIndent) {
                  inMetadata = false;
                }

                if (lineIdx - kindLineIdx > 200) {
                  break;
                }
              }
            }
          }
        } else {
          // For Terraform files, look for resource definitions
          const terraformResourceLookback = 500;
          for (
            let lineIdx = Math.min(diffLineIndex, fileLines.length - 1);
            lineIdx >= 0;
            lineIdx--
          ) {
            const line = fileLines[lineIdx];
            // Look for Terraform resource definition: resource "type" "name" {
            const resourceMatch = line.match(
              /resource\s+"([^"]+)"\s+"([^"]+)"/,
            );
            if (resourceMatch) {
              resourceName = resourceMatch[1]; // Resource type (e.g., aws_db_instance)
              resourceInstanceName = resourceMatch[2]; // Instance name (e.g., my_db)
              resourceStartLine = lineIdx;
              // Find the end of this resource block by looking for the closing brace
              let braceCount = 0;
              for (let j = lineIdx; j < fileLines.length; j++) {
                const currentLine = fileLines[j];
                braceCount += (currentLine.match(/{/g) || []).length;
                braceCount -= (currentLine.match(/}/g) || []).length;
                if (braceCount === 0 && j > lineIdx) {
                  resourceEndLine = j;
                  break;
                }
              }
              break;
            }
            // Stop searching if we've gone too far back (more than 50 lines)
            if (diffLineIndex - lineIdx > terraformResourceLookback) {
              break;
            }
          }

          // If we didn't find it in the original file, try the modified content
          if (resourceName === 'Resource') {
            const modifiedLines = (modifiedContent as string).split('\n');
            for (
              let lineIdx = Math.min(diffLineIndex, modifiedLines.length - 1);
              lineIdx >= 0;
              lineIdx--
            ) {
              const line = modifiedLines[lineIdx];
              const resourceMatch = line.match(
                /resource\s+"([^"]+)"\s+"([^"]+)"/,
              );
              if (resourceMatch) {
                resourceName = resourceMatch[1];
                resourceInstanceName = resourceMatch[2];
                resourceStartLine = lineIdx;
                // Find the end of this resource block
                let braceCount = 0;
                for (let j = lineIdx; j < modifiedLines.length; j++) {
                  const currentLine = modifiedLines[j];
                  braceCount += (currentLine.match(/{/g) || []).length;
                  braceCount -= (currentLine.match(/}/g) || []).length;
                  if (braceCount === 0 && j > lineIdx) {
                    resourceEndLine = j;
                    break;
                  }
                }
                break;
              }
              if (diffLineIndex - lineIdx > terraformResourceLookback) {
                break;
              }
            }
          }
        }

        logger.debug('Identified resource for diff', {
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
          resourceStartLine >= 0 ? resourceStartLine + 1 : diff.targetLine;

        // Build a human-friendly resource header for diagnostics so users can tell
        // exactly which block a rule applies to (e.g. Terraform: resource "aws_instance" "worker").
        const resourceHeader = (() => {
          if (isDockerfile) {
            if (resourceName === 'docker_stage' && resourceInstanceName) {
              return `FROM ${resourceInstanceName}`;
            }
            return 'Dockerfile';
          }
          if (isKubernetes) {
            if (resourceName && resourceName !== 'Resource') {
              return resourceInstanceName
                ? `${resourceName} "${resourceInstanceName}"`
                : resourceName;
            }
            return path.basename(actualFilePath);
          }
          // Terraform-ish
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

        // Match rules to resources based on:
        // 1. Rules that touched this file
        // 2. Resource type matching (rule name contains resource type)
        // 3. Diff line falls within resource's line range
        let matchingRules: string[] = [];
        const diffLine = diff.targetLine;
        // Attribution categories:
        // - file-mapped:precise   -> we had file rules and matched in the primary path
        // - file-mapped:heuristic -> we had file rules but had to use a fallback heuristic within the file
        // - ultimate              -> we had no file rules and had to use diagnostics-wide ultimate fallback
        const hasFileRules = allFileRules.length > 0;
        let usedHeuristicWithinFile = false;
        let usedUltimateFallback = !hasFileRules;

        // For Kubernetes and Docker files, we can match rules even without resourceInstanceName
        // For Terraform, we need resourceInstanceName to match properly
        const canMatchWithoutInstance = isDockerfile || isKubernetes;

        logger.debug('Starting rule matching', {
          file: actualFilePath,
          resourceName,
          resourceInstanceName,
          resourceStartLine,
          resourceEndLine,
          diffLine,
          allFileRulesCount: allFileRules.length,
          allFileRules: allFileRules.slice(0, 3),
          isKubernetes,
          isDockerfile,
          canMatchWithoutInstance,
        });

        if (
          resourceName !== 'Resource' &&
          (resourceInstanceName !== null || canMatchWithoutInstance) &&
          resourceStartLine >= 0 &&
          (resourceEndLine >= 0 || canMatchWithoutInstance)
        ) {
          // Check if the diff line falls within this resource's line range
          // Note: resourceStartLine and resourceEndLine are 0-based, diff.targetLine is 1-based
          // For Kubernetes/Docker files, if resourceEndLine is -1, we still allow matching
          const resourceContainsDiff =
            resourceEndLine >= 0
              ? diffLine >= resourceStartLine + 1 &&
                diffLine <= resourceEndLine + 1
              : canMatchWithoutInstance && diffLine >= resourceStartLine + 1;

          logger.debug('Resource matching check', {
            resourceContainsDiff,
            resourceEndLine,
            diffLine,
            resourceStartLine: resourceStartLine + 1,
            canMatchWithoutInstance,
          });

          if (resourceContainsDiff && allFileRules.length > 0) {
            // For Dockerfiles and Kubernetes, skip resource type matching and use file-level matching
            // For Terraform, match by resource type to filter rules
            if (isDockerfile || isKubernetes) {
              // For Dockerfiles and Kubernetes, all rules that touched this file are potential matches
              // We'll rely on diff content analysis to filter further
              for (const ruleName of allFileRules) {
                // Check if rule has resources for this file
                const rule = result.diagnostics?.rules?.find(
                  r => r.ruleName === ruleName,
                );
                if (!rule) {
                  // If rule not found in diagnostics, still accept it for Kubernetes/Docker (file-level match)
                  if (!matchingRules.includes(ruleName)) {
                    matchingRules.push(ruleName);
                  }
                  continue;
                }

                const ruleFiles = rule.files || [];
                let fileMatches = false;
                for (const ruleFile of ruleFiles) {
                  const keys = addFileKeys(ruleFile.path);
                  if (keys.some(k => matchKeys.includes(k))) {
                    fileMatches = true;
                    // For Dockerfiles and Kubernetes, check if diff line falls within any resource range
                    const resources = (ruleFile as any).resources || [];
                    if (resources.length === 0) {
                      // No resource info - accept file-level match
                      break;
                    }
                    const matchingResource = resources.find(
                      (r: any) =>
                        r.type === resourceName &&
                        diffLine >= r.startLine &&
                        diffLine <= r.endLine,
                    );
                    if (matchingResource) {
                      // Found matching resource - accept
                      break;
                    }
                    // Resource info exists but doesn't match - for Kubernetes/Docker, still accept file-level match
                    break;
                  }
                }

                // If file matches, accept the rule (for Kubernetes/Docker, file-level matching is sufficient)
                if (fileMatches && !matchingRules.includes(ruleName)) {
                  matchingRules.push(ruleName);
                }
              }
            } else {
              // For Terraform files, use resource type matching
              // Normalize resource name for matching (handle variations)
              const normalizedResource = resourceName
                .replace(/^hashicorp__/, '')
                .replace(/^aws-resources-/, '')
                .replace(/^google-resources-/, '')
                .replace(/^azurerm-resources-/, '')
                .replace(/\./g, '_')
                .replace(/-/g, '_');

              // Extract core resource name (without aws_/google_/azurerm_ prefix) for flexible matching
              // e.g., aws_neptune_cluster -> neptune_cluster -> neptune-cluster
              const coreResource = normalizedResource.replace(
                /^(aws_|google_|azurerm_)/,
                '',
              );
              const coreResourceWithDashes = coreResource.replace(/_/g, '-');
              const normalizedResourceWithDashes = normalizedResource.replace(
                /_/g,
                '-',
              );

              const resourceVariants = [
                normalizedResource,
                normalizedResourceWithDashes,
                `hashicorp__aws-resources-${normalizedResource}`,
                `hashicorp__aws-resources-aws_${normalizedResource}`,
                `hashicorp__google-resources-${normalizedResource}`,
                `hashicorp__google-resources-google_${normalizedResource}`,
                `aws-resources-${normalizedResource}`,
                `aws-resources-aws_${normalizedResource}`,
                // Also try with dashes
                `hashicorp__aws-resources-${normalizedResourceWithDashes}`,
                `aws-resources-${normalizedResourceWithDashes}`,
              ];

              // Only include coreResource variants when they're specific (contain a separator),
              // e.g. `neptune_cluster` but not `instance`.
              if (coreResource.includes('_') || coreResource.includes('-')) {
                resourceVariants.splice(
                  1,
                  0,
                  coreResource,
                  coreResourceWithDashes,
                );
              }

              // Match rules to this specific resource instance by checking:
              // 1. Rule name contains the resource type (filters out irrelevant rules)
              // 2. Rule has this specific resource instance in its resources list
              // 3. Diff line falls within that resource's line range
              //
              // NOTE: Some Terraform rule names do not include the resource type in the name
              // (e.g. `ensure-instance-...`). If the ORL report indicates a rule actually changed
              // this file, prefer those as candidates to preserve descriptions.
              if (reportFileRules.length > 0) {
                usedHeuristicWithinFile = true;
                const candidates = reportFileRules.filter(r =>
                  allFileRules.includes(r),
                );
                const picked: string[] = [];
                // Best-effort heuristic: if we can't do instance-level matching, use diff content + rule name terms.
                if ((analysis.properties?.length || 0) > 0) {
                  const diffContent = diff.newLines.join('\n').toLowerCase();
                  const diffProperties = (analysis.properties || []).map(p =>
                    p.toLowerCase(),
                  );
                  const stop = new Set([
                    'for',
                    'hashicorp',
                    'aws',
                    'google',
                    'azurerm',
                    'resources',
                    'resource',
                    'ensure',
                    'that',
                    'the',
                    'is',
                    'are',
                    'and',
                    'or',
                    'with',
                    'when',
                    'it',
                    'enabled',
                    'enable',
                    'disabled',
                    'disable',
                    'true',
                    'false',
                    'instance',
                  ]);
                  for (const rn of candidates) {
                    const terms = rn
                      .toLowerCase()
                      .replace(/[0-9]+$/, '')
                      .split(/[_\-\s/]+/)
                      .filter(t => t.length > 3)
                      .filter(t => !stop.has(t));
                    if (terms.length === 0) {
                      continue;
                    }
                    const hit = terms.some(
                      t =>
                        diffContent.includes(t) ||
                        diffProperties.some(p => p.includes(t)),
                    );
                    if (hit) {
                      picked.push(rn);
                    }
                  }
                }
                matchingRules =
                  picked.length > 0 ? picked : candidates.slice(0, 10);
              } else {
                for (const ruleName of allFileRules) {
                  // First filter by resource type - rule name must contain the resource type
                  const ruleLower = ruleName.toLowerCase();
                  const matchesResourceType = resourceVariants.some(variant =>
                    ruleLower.includes(variant.toLowerCase()),
                  );

                  if (!matchesResourceType) {
                    continue; // Skip rules that don't apply to this resource type
                  }

                  // Find the rule in diagnostics
                  const rule = result.diagnostics?.rules?.find(
                    r => r.ruleName === ruleName,
                  );
                  if (!rule) {
                    continue;
                  }

                  // Check if this rule has this specific resource instance in its resources
                  const ruleFiles = rule.files || [];
                  for (const ruleFile of ruleFiles) {
                    const keys = addFileKeys(ruleFile.path);
                    const fileMatches = keys.some(k => matchKeys.includes(k));
                    if (!fileMatches) {
                      continue;
                    }

                    const resources = (ruleFile as any).resources || [];
                    // Check if this specific resource instance is in the rule's resources
                    // AND the diff line falls within that resource's line range
                    const matchingResource = resources.find(
                      (r: any) =>
                        r.type === resourceName &&
                        r.name === resourceInstanceName &&
                        diffLine >= r.startLine &&
                        diffLine <= r.endLine,
                    );

                    if (matchingResource) {
                      // Additional filtering: Use diff content to verify this rule actually applies
                      // This prevents false positives when multiple rules have the same resource in their list
                      const diffProperties = analysis.properties || [];
                      const diffContent = diff.newLines
                        .join('\n')
                        .toLowerCase();
                      const ruleLower = ruleName.toLowerCase();

                      // Extract key terms from rule name that indicate what it changes
                      const ruleTerms = ruleLower
                        .split(/[_\-\s]+/)
                        .filter(term => term.length > 3)
                        .filter(
                          term =>
                            ![
                              'for',
                              'hashicorp',
                              'aws',
                              'resources',
                              'ensure',
                              'that',
                              'the',
                              'is',
                              'are',
                              'and',
                              'or',
                            ].includes(term),
                        );

                      // Check if the diff content matches what this rule would change
                      let matchesDiffContent = false;
                      if (ruleTerms.length > 0) {
                        matchesDiffContent = ruleTerms.some(term => {
                          // Check if term appears in diff content
                          if (diffContent.includes(term)) {
                            return true;
                          }
                          // Check if term appears in property names
                          if (
                            diffProperties.some(prop =>
                              prop.toLowerCase().includes(term),
                            )
                          ) {
                            return true;
                          }
                          // Generic matching: if term appears anywhere in diff content or properties, it's a match
                          // No need for hardcoded property patterns - rely on semantic matching
                          return false;
                        });
                      } else {
                        // If no meaningful terms, assume it matches (conservative approach)
                        matchesDiffContent = true;
                      }

                      // Only add the rule if diff content matches
                      if (
                        matchesDiffContent &&
                        !matchingRules.includes(ruleName)
                      ) {
                        logger.debug(
                          'Matched rule using instance-level matching',
                          {
                            ruleName,
                            resourceType: resourceName,
                            resourceInstance: resourceInstanceName,
                            diffLine,
                            resourceRange: `${matchingResource.startLine}-${matchingResource.endLine}`,
                            diffProperties,
                            matchedTerms: ruleTerms.filter(
                              term =>
                                diffContent.includes(term) ||
                                diffProperties.some(prop =>
                                  prop.toLowerCase().includes(term),
                                ),
                            ),
                          },
                        );
                        matchingRules.push(ruleName);
                        break; // Found a match for this rule, no need to check other files
                      }
                    }
                  }
                }
              }

              // If no instance-level match found, fall back to diff content analysis
              // This should be rare now that we use hash comparison in non-dry-run mode,
              // but kept as a safety net in case hash comparison fails
              if (matchingRules.length === 0) {
                // Extract properties from the diff to help match rules
                const diffProperties = analysis.properties || [];
                const diffContent = diff.newLines.join('\n').toLowerCase();

                // For Dockerfiles and Kubernetes, skip resource type matching and use all file rules
                // For Terraform, match by resource type first
                if (isDockerfile || isKubernetes) {
                  // For Dockerfiles, use all rules that touched this file
                  // and match based on diff content
                  for (const ruleName of allFileRules) {
                    const ruleLower = ruleName.toLowerCase();
                    // Extract key terms from rule name
                    const ruleTerms = ruleLower
                      .split(/[_\-\s]+/)
                      .filter(term => term.length > 3)
                      .filter(
                        term =>
                          ![
                            'for',
                            'hashicorp',
                            'aws',
                            'resources',
                            'ensure',
                            'that',
                            'the',
                            'is',
                            'are',
                            'and',
                            'or',
                            'docker',
                          ].includes(term),
                      );

                    // Check if diff content matches rule terms
                    let matchesDiffContent = false;
                    if (ruleTerms.length > 0) {
                      matchesDiffContent = ruleTerms.some(term => {
                        return (
                          diffContent.includes(term) ||
                          diffProperties.some(prop =>
                            prop.toLowerCase().includes(term),
                          )
                        );
                      });
                    } else {
                      // If no meaningful terms, accept the match (conservative)
                      matchesDiffContent = true;
                    }

                    if (
                      matchesDiffContent &&
                      !matchingRules.includes(ruleName)
                    ) {
                      matchingRules.push(ruleName);
                    }
                  }
                } else {
                  // For Terraform files, use resource type matching
                  // Normalize resource name for matching
                  const normalizedResource = resourceName
                    .replace(/^hashicorp__/, '')
                    .replace(/^aws-resources-/, '')
                    .replace(/^google-resources-/, '')
                    .replace(/^azurerm-resources-/, '')
                    .replace(/\./g, '_')
                    .replace(/-/g, '_');

                  const resourceVariants = [
                    normalizedResource,
                    `hashicorp__aws-resources-${normalizedResource}`,
                    `hashicorp__aws-resources-aws_${normalizedResource}`,
                    `hashicorp__google-resources-${normalizedResource}`,
                    `hashicorp__google-resources-google_${normalizedResource}`,
                    `aws-resources-${normalizedResource}`,
                    `aws-resources-aws_${normalizedResource}`,
                  ];

                  for (const ruleName of allFileRules) {
                    const ruleLower = ruleName.toLowerCase();

                    // First check if rule matches resource type
                    const matchesResourceType = resourceVariants.some(variant =>
                      ruleLower.includes(variant.toLowerCase()),
                    );

                    if (!matchesResourceType) {
                      continue;
                    }

                    // Then check if the diff content matches what this rule would change
                    // This helps distinguish between rules that apply to the same resource type
                    // For example, "auto_minor_version_upgrade" vs "at_rest_encryption_enabled"
                    let matchesDiffContent = false;

                    // Extract key terms from rule name that might appear in the diff
                    // Rules often have descriptive names that hint at what they change
                    const ruleTerms = ruleLower
                      .split(/[_\-\s]+/)
                      .filter(term => term.length > 3) // Only meaningful terms
                      .filter(
                        term =>
                          ![
                            'for',
                            'hashicorp',
                            'aws',
                            'resources',
                            'ensure',
                            'that',
                            'the',
                            'is',
                            'are',
                            'and',
                            'or',
                          ].includes(term),
                      );

                    // Check if any rule term appears in the diff content or properties
                    // This helps match rules to the specific changes they make
                    if (ruleTerms.length > 0) {
                      matchesDiffContent = ruleTerms.some(term => {
                        // Check if term appears in diff content
                        if (diffContent.includes(term)) {
                          return true;
                        }
                        // Check if term appears in property names
                        if (
                          diffProperties.some(prop =>
                            prop.toLowerCase().includes(term),
                          )
                        ) {
                          return true;
                        }
                        // Generic matching: if term appears anywhere in diff content or properties, it's a match
                        // No need for hardcoded property patterns - rely on semantic matching
                        return false;
                      });
                    } else {
                      // If no meaningful terms, don't match (be conservative)
                      // This prevents false positives when we can't determine what changed
                      matchesDiffContent = false;
                    }

                    if (
                      matchesDiffContent &&
                      !matchingRules.includes(ruleName)
                    ) {
                      matchingRules.push(ruleName);
                    }
                  }
                }
              }

              // Log matched rules
              if (matchingRules.length > 0) {
                logger.debug('Matched rules using diff content analysis', {
                  resourceType: resourceName,
                  resourceInstance: resourceInstanceName,
                  diffLine,
                  matchingRules: matchingRules.slice(0, 3),
                });
              }
            }

            logger.debug('Matched rules for resource', {
              resourceType: resourceName,
              resourceInstance: resourceInstanceName,
              diffLine,
              resourceRange: `${resourceStartLine + 1}-${resourceEndLine + 1}`,
              matchingRules,
              allFileRules,
            });
          }
        }

        // Fallback: If no resource-specific match, try file-level matching for Kubernetes/Docker
        // or resource type matching for Terraform
        if (
          matchingRules.length === 0 &&
          resourceName !== 'Resource' &&
          allFileRules.length > 0
        ) {
          usedHeuristicWithinFile = true;
          // For Kubernetes and Docker files, use all file-level rules as fallback
          if (isDockerfile || isKubernetes) {
            // Accept all rules that touched this file as potential matches
            for (const ruleName of allFileRules) {
              if (!matchingRules.includes(ruleName)) {
                matchingRules.push(ruleName);
              }
            }
          } else {
            // For Terraform files, try resource type matching
            // Normalize resource name for matching (handle variations)
            const normalizedResource = resourceName
              .replace(/^hashicorp__/, '')
              .replace(/^aws-resources-/, '')
              .replace(/^google-resources-/, '')
              .replace(/^azurerm-resources-/, '')
              .replace(/\./g, '_')
              .replace(/-/g, '_');

            // Extract core resource name (without aws_/google_/azurerm_ prefix) for flexible matching
            // e.g., aws_neptune_cluster -> neptune_cluster -> neptune-cluster
            const coreResource = normalizedResource.replace(
              /^(aws_|google_|azurerm_)/,
              '',
            );
            const coreResourceWithDashes = coreResource.replace(/_/g, '-');
            const normalizedResourceWithDashes = normalizedResource.replace(
              /_/g,
              '-',
            );

            // Also try with hashicorp__ prefix variations.
            // IMPORTANT: Avoid overly-generic core matches like `aws_instance` -> `instance`,
            // which can cause cross-provider false positives (e.g. matching google_compute_instance).
            const resourceVariants = [
              normalizedResource,
              normalizedResourceWithDashes,
              `hashicorp__aws-resources-${normalizedResource}`,
              `hashicorp__aws-resources-aws_${normalizedResource}`,
              `hashicorp__google-resources-${normalizedResource}`,
              `hashicorp__google-resources-google_${normalizedResource}`,
              `aws-resources-${normalizedResource}`,
              `aws-resources-aws_${normalizedResource}`,
              // Also try with dashes
              `hashicorp__aws-resources-${normalizedResourceWithDashes}`,
              `aws-resources-${normalizedResourceWithDashes}`,
            ];

            // Only include coreResource variants when they're specific (contain a separator),
            // e.g. `neptune_cluster` but not `instance`.
            if (coreResource.includes('_') || coreResource.includes('-')) {
              resourceVariants.splice(
                1,
                0,
                coreResource,
                coreResourceWithDashes,
              );
            }

            for (const ruleName of allFileRules) {
              // Check if rule name contains any variant of the resource type
              const ruleLower = ruleName.toLowerCase();
              const matches = resourceVariants.some(variant =>
                ruleLower.includes(variant.toLowerCase()),
              );

              if (matches) {
                matchingRules.push(ruleName);
              }
            }
          }
        }

        // Final fallback for Kubernetes/Docker: if we still have no matches but have file rules, use them
        if (
          matchingRules.length === 0 &&
          (isKubernetes || isDockerfile) &&
          allFileRules.length > 0
        ) {
          usedHeuristicWithinFile = true;
          // For Kubernetes/Docker files, if we have rules that touched this file, use them all
          for (const ruleName of allFileRules) {
            if (!matchingRules.includes(ruleName)) {
              matchingRules.push(ruleName);
            }
          }
          logger.debug(
            'Using file-level rules as final fallback for Kubernetes/Docker',
            {
              file: actualFilePath,
              resourceType: resourceName,
              matchingRulesCount: matchingRules.length,
              matchingRules: matchingRules.slice(0, 3),
            },
          );
        }

        // Ultimate fallback: if diagnostics don't have file mappings but we have rule descriptions,
        // use rules from diagnostics (which are the actual rules that were executed)
        if (
          matchingRules.length === 0 &&
          allFileRules.length === 0 &&
          result.diagnostics?.rules &&
          result.diagnostics.rules.length > 0
        ) {
          usedUltimateFallback = true;
          const diagnosticsRules = result.diagnostics.rules;

          if (isKubernetes || isDockerfile) {
            // For Kubernetes/Docker files, use all rules from diagnostics
            // (file-level matching is sufficient)
            for (const rule of diagnosticsRules) {
              if (!matchingRules.includes(rule.ruleName)) {
                matchingRules.push(rule.ruleName);
              }
            }
            logger.debug(
              'Using all diagnostics rules as ultimate fallback for Kubernetes/Docker',
              {
                file: actualFilePath,
                resourceType: resourceName,
                matchingRulesCount: matchingRules.length,
                matchingRules: matchingRules.slice(0, 3),
                diagnosticsRulesCount: diagnosticsRules.length,
              },
            );
          } else if (resourceName !== 'Resource') {
            // For Terraform files, filter by resource type to avoid false positives
            // Normalize resource name for matching (handle variations)
            const normalizedResource = resourceName
              .replace(/^hashicorp__/, '')
              .replace(/^aws-resources-/, '')
              .replace(/^google-resources-/, '')
              .replace(/^azurerm-resources-/, '')
              .replace(/\./g, '_')
              .replace(/-/g, '_');

            // Extract core resource name (without aws_/google_/azurerm_ prefix) for flexible matching
            // e.g., aws_neptune_cluster -> neptune_cluster -> neptune-cluster
            const coreResource = normalizedResource.replace(
              /^(aws_|google_|azurerm_)/,
              '',
            );
            const coreResourceWithDashes = coreResource.replace(/_/g, '-');
            const normalizedResourceWithDashes = normalizedResource.replace(
              /_/g,
              '-',
            );

            const resourceVariants = [
              normalizedResource,
              normalizedResourceWithDashes,
              `hashicorp__aws-resources-${normalizedResource}`,
              `hashicorp__aws-resources-aws_${normalizedResource}`,
              `hashicorp__google-resources-${normalizedResource}`,
              `hashicorp__google-resources-google_${normalizedResource}`,
              `aws-resources-${normalizedResource}`,
              `aws-resources-aws_${normalizedResource}`,
              // Also try with dashes
              `hashicorp__aws-resources-${normalizedResourceWithDashes}`,
              `aws-resources-${normalizedResourceWithDashes}`,
            ];

            if (coreResource.includes('_') || coreResource.includes('-')) {
              resourceVariants.splice(
                1,
                0,
                coreResource,
                coreResourceWithDashes,
              );
            }

            for (const rule of diagnosticsRules) {
              const ruleLower = rule.ruleName.toLowerCase();
              const matches = resourceVariants.some(variant =>
                ruleLower.includes(variant.toLowerCase()),
              );

              if (matches && !matchingRules.includes(rule.ruleName)) {
                matchingRules.push(rule.ruleName);
              }
            }
            logger.debug(
              'Using diagnostics rules filtered by resource type as ultimate fallback for Terraform',
              {
                file: actualFilePath,
                resourceType: resourceName,
                normalizedResource,
                matchingRulesCount: matchingRules.length,
                matchingRules: matchingRules.slice(0, 3),
                diagnosticsRulesCount: diagnosticsRules.length,
              },
            );
          }
        }

        // If no resource-specific rules found, don't show any rules
        // This prevents false positives where all rules are shown for all resources
        // Only show rules when we can confidently match them to a specific resource
        if (matchingRules.length === 0) {
          logger.debug('No matching rules found for resource', {
            file: actualFilePath,
            resourceType: resourceName,
            resourceInstance: resourceInstanceName,
            diffLine: diff.targetLine,
            allFileRulesCount: allFileRules.length,
            isKubernetes,
            isDockerfile,
            resourceStartLine,
            resourceEndLine,
            canMatchWithoutInstance,
          });
        } else if (matchingRules.length > 0) {
          logger.debug('Matched rules by resource instance', {
            file: actualFilePath,
            resourceType: resourceName,
            resourceInstance: resourceInstanceName,
            matchingRulesCount: matchingRules.length,
            matchingRules: matchingRules.slice(0, 3),
          });
        }

        // Get rule descriptions
        let aggregatedDescriptions: string[] = [];
        let primaryRule = 'ORL_REMEDIATION';
        if (matchingRules.length > 0) {
          primaryRule = matchingRules[0];
          const descs: string[] = [];

          // Helper function to normalize rule names for matching
          // Handles differences between underscores and dashes, case, special chars
          const normalizeRuleName = (name: string): string => {
            return name
              .toLowerCase()
              .replace(/[0-9]+$/, '') // Remove trailing numeric suffixes
              .replace(/[^a-z0-9\/]/g, '-') // Replace ALL special chars (including underscores) with dashes
              .replace(/-+/g, '-') // Collapse multiple dashes (-- becomes -)
              .replace(/^-|-$/g, '') // Remove leading/trailing dashes
              .replace(/\/$/, ''); // Remove trailing slash
          };

          for (const ruleName of matchingRules) {
            // Try exact match first
            let d = ruleDescriptions[ruleName];

            // If no exact match, try partial matching (rule names in diagnostics might have suffixes)
            if (!d) {
              // Rule names in diagnostics might be like "gomboc-ai/ensure_data_at_rest_is_encrypted_for_hashicorp__aws-resources-aws_rds_cluster000"
              // But in YAML report might be "gomboc-ai/ensure_data_at_rest_is_encrypted_for_hashicorp__aws-resources-aws_rds_cluster"
              // Try matching without the numeric suffix
              const baseName = ruleName.replace(/[0-9]+$/, '');
              for (const [reportRuleName, desc] of Object.entries(
                ruleDescriptions,
              )) {
                if (
                  reportRuleName.startsWith(baseName) ||
                  baseName.startsWith(reportRuleName)
                ) {
                  d = desc;
                  break;
                }
              }
            }

            // If still no match, try normalized matching (handles special chars, case, etc.)
            if (!d) {
              const normalizedRuleName = normalizeRuleName(ruleName);
              for (const [reportRuleName, desc] of Object.entries(
                ruleDescriptions,
              )) {
                const normalizedReportName = normalizeRuleName(reportRuleName);
                // Check if normalized names match (exact or contains)
                if (
                  normalizedRuleName === normalizedReportName ||
                  normalizedRuleName.includes(normalizedReportName) ||
                  normalizedReportName.includes(normalizedRuleName)
                ) {
                  d = desc;
                  break;
                }
              }
            }

            // If still no match, try matching the core rule name (after last /)
            if (!d) {
              const coreName = ruleName.split('/').pop() || ruleName;
              const normalizedCoreName = normalizeRuleName(coreName);
              for (const [reportRuleName, desc] of Object.entries(
                ruleDescriptions,
              )) {
                const reportCore =
                  reportRuleName.split('/').pop() || reportRuleName;
                const normalizedReportCore = normalizeRuleName(reportCore);
                if (
                  normalizedCoreName === normalizedReportCore ||
                  normalizedCoreName.includes(normalizedReportCore) ||
                  normalizedReportCore.includes(normalizedCoreName) ||
                  coreName.includes(reportCore) ||
                  reportCore.includes(coreName)
                ) {
                  d = desc;
                  break;
                }
              }
            }

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
        // Format resource name for display
        let displayResourceName = resourceName;
        if (resourceName === 'docker_stage') {
          // For Dockerfiles, show the stage name or image name
          displayResourceName = resourceInstanceName
            ? `Docker Stage: ${resourceInstanceName}`
            : 'Docker Stage';
        } else if (isKubernetes && resourceInstanceName) {
          // For Kubernetes, show kind/name format (e.g., "Deployment/my-app")
          displayResourceName = `${resourceName}/${resourceInstanceName}`;
        } else if (resourceInstanceName) {
          // For Terraform, show resource type and instance name
          displayResourceName = `${resourceName}.${resourceInstanceName}`;
        }
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

        // Create individual fix for this specific difference and force it into a benchmarkRecommendation/fix form
        const individualFix = {
          benchmarkRecommendation: {
            id: ruleIdentifier,
            identifier: ruleIdentifier,
            // Use only rule metadata.description in diagnostics when available
            name: descriptionText,
            description: descriptionText,
            // Not part of the GraphQL schema; used internally for analytics attribution.
            orlRuleNames: matchingRules,
          },
          fixes: [fix],
          codeObservation: {
            codeResourceInstance: {
              name: resourceHeader,
              type:
                filetype === 'tf'
                  ? 'terraform'
                  : isDockerfile
                    ? 'docker'
                    : isKubernetes
                      ? 'kubernetes'
                      : 'cloudformation',
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
            benchmarkRecommendation: {
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
