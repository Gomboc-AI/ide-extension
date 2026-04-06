const ORL_RULE_PREFIX = 'orl-rule:';
const NON_RENDERABLE_RULE_NAMES = new Set(['multiple', 'ORL_REMEDIATION']);

export function extractRenderableOrlRuleNames(rule: any): string[] {
  const ruleNames = new Set<string>();
  const embedded = rule?.orlRuleNames;

  if (Array.isArray(embedded)) {
    for (const value of embedded) {
      if (typeof value !== 'string') {
        continue;
      }
      const ruleName = value.trim();
      if (ruleName && !NON_RENDERABLE_RULE_NAMES.has(ruleName)) {
        ruleNames.add(ruleName);
      }
    }
  }

  if (ruleNames.size > 0) {
    return Array.from(ruleNames);
  }

  const id = typeof rule?.id === 'string' ? rule.id.trim() : '';
  if (!id.startsWith(ORL_RULE_PREFIX)) {
    return [];
  }

  const fallbackRuleName = id.slice(ORL_RULE_PREFIX.length).trim();
  if (!fallbackRuleName || NON_RENDERABLE_RULE_NAMES.has(fallbackRuleName)) {
    return [];
  }

  return [fallbackRuleName];
}
