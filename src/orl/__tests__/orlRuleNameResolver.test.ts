import { extractRenderableOrlRuleNames } from '../orlRuleNameResolver';

describe('extractRenderableOrlRuleNames()', () => {
  it('uses embedded ORL rule names when present', () => {
    expect(
      extractRenderableOrlRuleNames({
        id: 'orl-rule:multiple',
        orlRuleNames: ['gomboc-ai/rule_a', 'gomboc-ai/rule_b'],
      }),
    ).toEqual(['gomboc-ai/rule_a', 'gomboc-ai/rule_b']);
  });

  it('falls back to the benchmark recommendation id when embedded names are empty', () => {
    expect(
      extractRenderableOrlRuleNames({
        id: 'orl-rule:gomboc-ai/rule_a',
        orlRuleNames: [],
      }),
    ).toEqual(['gomboc-ai/rule_a']);
  });

  it('ignores synthetic placeholder identifiers', () => {
    expect(
      extractRenderableOrlRuleNames({
        id: 'orl-rule:ORL_REMEDIATION',
        orlRuleNames: [],
      }),
    ).toEqual([]);
  });
});
