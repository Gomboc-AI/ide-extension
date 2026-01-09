import * as vscode from 'vscode';
import { OrlRuleFixGombocDiagnostic } from './gombocDiagnostic';

export class OrlHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const relevant = diagnostics.filter(d => d.range.contains(position));

    const orlDiagnostics = relevant.filter(
      d =>
        typeof (d as any)?.ruleName === 'string' &&
        typeof (d as any)?.filePath === 'string' &&
        (typeof (d as any)?.ruleShortName === 'string' ||
          typeof (d as any)?.ruleDescription === 'string'),
    ) as OrlRuleFixGombocDiagnostic[];

    if (orlDiagnostics.length === 0) {
      return undefined;
    }

    // Dedupe by ruleName so we don't spam repeated diagnostics.
    const byRule = new Map<string, OrlRuleFixGombocDiagnostic>();
    for (const d of orlDiagnostics) {
      const rn = (d as any).ruleName as string;
      if (!byRule.has(rn)) {
        byRule.set(rn, d);
      }
    }
    const unique = Array.from(byRule.values());

    const resourceHeaders = Array.from(
      new Set(
        unique
          .map(d => ((d as any).resourceHeader as string | undefined) || '')
          .filter(Boolean),
      ),
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
      const sa =
        ((a as any).ruleShortName as string | undefined) ||
        ((a as any).ruleName as string | undefined) ||
        '';
      const sb =
        ((b as any).ruleShortName as string | undefined) ||
        ((b as any).ruleName as string | undefined) ||
        '';
      return sa.localeCompare(sb);
    });

    for (const d of unique) {
      const resource = (d as any).resourceHeader as string | undefined;
      const shortName = (d as any).ruleShortName as string | undefined;
      const description = (d as any).ruleDescription as string | undefined;
      const ruleName = (d as any).ruleName as string | undefined;

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
