import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../utils/logger';
import { PathConverter } from '../utils/pathConverter';
import { FileDiffAnalyzer, Difference } from '../utils/fileDiffAnalyzer';
import { DiffContentAnalyzer } from '../utils/diffContentAnalyzer';

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
}

/**
 * Utility class for converting ORL results to VS Code scan response format
 */
export class OrlResultConverter {
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
    });

    return descriptions;
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
        }
      }
    }

    // Extract rule descriptions from ORL YAML report
    const ruleDescriptions =
      OrlResultConverter.extractRuleDescriptionsFromReport(result.report);

    logger.info('Rule descriptions extracted', {
      count: Object.keys(ruleDescriptions).length,
      sampleRules: Object.keys(ruleDescriptions).slice(0, 3),
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

      // Find the differences between original and modified content
      logger.info('File content comparison', {
        file: actualFilePath,
        originalLength: originalText.length,
        modifiedLength: (modifiedContent as string).length,
        originalPreview: originalText.split('\n').slice(0, 5).join('\n'),
        modifiedPreview: (modifiedContent as string)
          .split('\n')
          .slice(0, 5)
          .join('\n'),
      });

      const differences = FileDiffAnalyzer.findDifferences(
        originalText,
        modifiedContent as string,
      );

      if (differences.length === 0) {
        logger.info('No differences found for file', { file: actualFilePath });
        continue;
      }

      logger.info('Found differences in file', {
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

        // Extract resource name from the actual file content at the diff line
        // Look backwards from the diff line to find the resource definition
        let resourceName = 'Resource';
        const fileLines = originalText.split('\n');
        const diffLineIndex = diff.targetLine - 1; // Convert to 0-based index

        // Search backwards from the diff line to find the resource definition
        for (
          let lineIdx = Math.min(diffLineIndex, fileLines.length - 1);
          lineIdx >= 0;
          lineIdx--
        ) {
          const line = fileLines[lineIdx];
          // Look for Terraform resource definition: resource "type" "name" {
          const resourceMatch = line.match(/resource\s+"([^"]+)"\s+"([^"]+)"/);
          if (resourceMatch) {
            resourceName = resourceMatch[1]; // Use the resource type (e.g., aws_db_instance)
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
            const line = modifiedLines[lineIdx];
            const resourceMatch = line.match(
              /resource\s+"([^"]+)"\s+"([^"]+)"/,
            );
            if (resourceMatch) {
              resourceName = resourceMatch[1];
              break;
            }
            if (diffLineIndex - lineIdx > 50) {
              break;
            }
          }
        }

        // Analyze the diff content to extract meaningful information
        const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

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

        // Filter rules to only those that match this specific resource type
        // Rule names contain the resource type, e.g.:
        // "gomboc-ai/...for_hashicorp__aws-resources-aws_elasticache_replication_group000"
        // "gomboc-ai/...for_hashicorp__aws-resources-aws_rds_cluster000"
        const matchingRules: string[] = [];
        if (resourceName !== 'Resource' && allFileRules.length > 0) {
          // Normalize resource name for matching (handle variations)
          const normalizedResource = resourceName
            .replace(/^hashicorp__/, '')
            .replace(/^aws-resources-/, '')
            .replace(/^google-resources-/, '')
            .replace(/^azurerm-resources-/, '')
            .replace(/\./g, '_')
            .replace(/-/g, '_');

          // Also try with hashicorp__ prefix variations
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

        // If no resource-specific rules found, fall back to all file rules
        // (this handles cases where resource type couldn't be determined)
        if (matchingRules.length === 0 && allFileRules.length > 0) {
          matchingRules.push(...allFileRules);
        }

        // Get rule descriptions
        let aggregatedDescriptions: string[] = [];
        let primaryRule = 'ORL_REMEDIATION';
        if (matchingRules.length > 0) {
          primaryRule = matchingRules[0];
          const descs: string[] = [];
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

            // If still no match, try matching the core rule name (after last /)
            if (!d) {
              const coreName = ruleName.split('/').pop() || ruleName;
              for (const [reportRuleName, desc] of Object.entries(
                ruleDescriptions,
              )) {
                const reportCore =
                  reportRuleName.split('/').pop() || reportRuleName;
                if (
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
            logger.warn('No descriptions found for matching rules', {
              matchingRules: matchingRules.slice(0, 3),
              availableRuleNames: Object.keys(ruleDescriptions).slice(0, 10),
              sampleDiagnosticRule: matchingRules[0],
            });
          }
        }

        // Format: Resource Name (short) followed by descriptions
        // Keep it simple: resource name on first line, descriptions below
        let descriptionText: string;
        if (aggregatedDescriptions.length > 0) {
          // Format as: Resource Name\n\nDescription1\nDescription2...
          const descriptions = aggregatedDescriptions.slice(0, 5).join('\n\n');
          descriptionText = `${resourceName}\n\n${descriptions}`;
        } else {
          // Fallback if no descriptions found
          descriptionText = `${resourceName}\n\n${analysis.description || 'ORL remediation'}`;
        }

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
          },
          fixes: [fix],
          codeObservation: {
            codeResourceInstance: {
              name: path.basename(actualFilePath),
              type: filetype === 'tf' ? 'terraform' : 'cloudformation',
              filepath: actualFilePath,
              line: diff.targetLine,
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
    };
  }
}
