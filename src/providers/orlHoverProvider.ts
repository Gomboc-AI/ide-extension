import * as vscode from 'vscode';
import { OrlRuleFixGombocDiagnostic } from './gombocDiagnostic';

function isOrlRuleFixDiagnostic(
  diagnostic: vscode.Diagnostic,
): diagnostic is OrlRuleFixGombocDiagnostic {
  return (
    typeof (diagnostic as OrlRuleFixGombocDiagnostic).ruleName === 'string' &&
    typeof (diagnostic as OrlRuleFixGombocDiagnostic).filePath === 'string' &&
    (typeof (diagnostic as OrlRuleFixGombocDiagnostic).ruleShortName ===
      'string' ||
      typeof (diagnostic as OrlRuleFixGombocDiagnostic).ruleDescription ===
        'string')
  );
}

export class OrlHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const relevant = diagnostics.filter(d => d.range.contains(position));

    const orlDiagnostics = relevant.filter(isOrlRuleFixDiagnostic);

    if (orlDiagnostics.length === 0) {
      return undefined;
    }

    // Dedupe by ruleName so we don't spam repeated diagnostics.
    const byRule = new Map<string, OrlRuleFixGombocDiagnostic>();
    for (const d of orlDiagnostics) {
      const rn = d.ruleName;
      if (!byRule.has(rn)) {
        byRule.set(rn, d);
      }
    }
    const unique = Array.from(byRule.values());

    const resourceHeaders = Array.from(
      new Set(unique.map(d => d.resourceHeader || '').filter(Boolean)),
    );
    const commonResource =
      resourceHeaders.length === 1 ? resourceHeaders[0] : undefined;

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = false;

    if (commonResource) {
      md.appendMarkdown(`**${commonResource}**\n\n`);
    }

    // Sort for stable display.
    unique.sort((a, b) => {
      const sa = a.ruleShortName || a.ruleName || '';
      const sb = b.ruleShortName || b.ruleName || '';
      return sa.localeCompare(sb);
    });

    for (const d of unique) {
      const resource = d.resourceHeader;
      const shortName = d.ruleShortName;
      const description = d.ruleDescription;
      const ruleName = d.ruleName;

      const headingParts = [
        !commonResource && resource ? `**${resource}**` : undefined,
        shortName
          ? `**${shortName}**`
          : ruleName
            ? `**${ruleName}**`
            : undefined,
      ].filter(Boolean);

      md.appendMarkdown(`- ${headingParts.join(' — ')}`);
      if (description && description.trim()) {
        md.appendMarkdown(`\n  - ${description.trim()}\n`);
      } else {
        md.appendMarkdown('\n  - _No rule description available._\n');
      }
    }

    // Use the first diagnostic's range for hover anchoring.
    return new vscode.Hover(md, unique[0].range);
  }
}
