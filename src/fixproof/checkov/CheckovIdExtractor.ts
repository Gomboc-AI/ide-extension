import {
  CheckovEvidence,
  OrlReport,
  OrlRule,
  OrlRuleAnnotations,
  parseOrlReportPayload,
} from '../../schemas/orlReport';

export type ExtractedCheckovIds = {
  checkIds: string[];
  checkIdsByRule: Record<string, string[]>;
  evidenceByCheckId: Record<string, CheckovEvidence[]>;
};

export type ExtractCheckovIdsArgs = {
  parsedReport: unknown | null;
  changedRuleNames?: Set<string>;
  onlyRulesThatChangedCode?: boolean;
};

/**
 * Extract Checkov check IDs (CKV_* / BC_*) from an ORL YAML report that has been
 * parsed into a JS object (via `parseOrlReport`).
 *
 * This is intentionally schema-lite: it only assumes `spec.rules[]` exists.
 */
export class CheckovIdExtractor {
  extract(args: ExtractCheckovIdsArgs): ExtractedCheckovIds {
    const {
      parsedReport,
      changedRuleNames,
      onlyRulesThatChangedCode = true,
    } = args;

    const out: ExtractedCheckovIds = {
      checkIds: [],
      checkIdsByRule: {},
      evidenceByCheckId: {},
    };

    if (!parsedReport || typeof parsedReport !== 'object') {
      return out;
    }

    const report: OrlReport | null = parseOrlReportPayload(parsedReport);
    const rules = report?.spec?.rules;
    if (!Array.isArray(rules)) {
      return out;
    }

    const globalIds = new Set<string>();
    const checkIdRe = /\b(?:CKV|BC)_[A-Z0-9_]+\b/gi;
    const validIdRe = /^(CKV|BC)_[A-Z0-9_]+$/;

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

    const stripOrlInstanceSuffix = (name: string): string => {
      if (!name || typeof name !== 'string') {
        return name;
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

    const normalize = (id: string): string | undefined => {
      const s = (id || '').trim().toUpperCase();
      if (!s) {
        return undefined;
      }
      if (!validIdRe.test(s)) {
        return undefined;
      }
      return s;
    };

    const addEvidence = (checkId: string, ev: CheckovEvidence) => {
      if (!out.evidenceByCheckId[checkId]) {
        out.evidenceByCheckId[checkId] = [];
      }
      const existing = out.evidenceByCheckId[checkId];
      if (
        !existing.some(
          e =>
            e.ruleName === ev.ruleName &&
            e.source === ev.source &&
            e.key === ev.key,
        )
      ) {
        existing.push(ev);
      }
    };

    const addRuleId = (
      ruleName: string,
      id: string,
      ev: Omit<CheckovEvidence, 'ruleName'>,
    ) => {
      const n = normalize(id);
      if (!n) {
        return;
      }
      globalIds.add(n);
      if (!out.checkIdsByRule[ruleName]) {
        out.checkIdsByRule[ruleName] = [];
      }
      if (!out.checkIdsByRule[ruleName].includes(n)) {
        out.checkIdsByRule[ruleName].push(n);
      }
      addEvidence(n, { ruleName, ...ev });
    };

    const scanForIds = (text: string): string[] => {
      const s = (text || '').trim();
      if (!s) {
        return [];
      }
      const matches = s.match(checkIdRe) || [];
      return matches.map(m => m.toUpperCase());
    };

    const splitIds = (raw: string): string[] => {
      const s = (raw || '').trim();
      if (!s) {
        return [];
      }
      // Allow comma/space/newline separated lists.
      return s
        .split(/[\s,]+/g)
        .map(x => x.trim())
        .filter(Boolean);
    };

    for (const r of rules) {
      const ruleName: string | undefined =
        (typeof r?.name === 'string' && r.name.trim()) ||
        (typeof r?.metadata?.name === 'string' && r.metadata.name.trim()) ||
        undefined;
      if (!ruleName) {
        continue;
      }

      const ruleBaseName = stripOrlInstanceSuffix(ruleName);

      // Rule selection.
      const fixes = toInt(r?.fixes);
      const changes = toInt(r?.changes);
      const filesChangedKeys =
        r?.files_changed && typeof r.files_changed === 'object'
          ? Object.keys(r.files_changed)
          : [];
      const changedByCounters =
        fixes > 0 || changes > 0 || filesChangedKeys.length > 0;
      const selected =
        (changedRuleNames && changedRuleNames.has(ruleBaseName)) ||
        (!changedRuleNames && (!onlyRulesThatChangedCode || changedByCounters));
      if (!selected) {
        continue;
      }

      const metadata = r.metadata;

      // Source 1: explicit annotations.
      const annotations = metadata?.annotations;

      const multiKey = 'gomboc-ai/checkov-ids';
      if (annotations && multiKey in annotations) {
        const v = annotations[multiKey];
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string') {
              for (const id of splitIds(item)) {
                addRuleId(ruleName, id, {
                  source: 'annotation',
                  key: multiKey,
                });
              }
            }
          }
        } else if (typeof v === 'string') {
          for (const id of splitIds(v)) {
            addRuleId(ruleName, id, { source: 'annotation', key: multiKey });
          }
        }
      }

      const singleKeys = ['gomboc-ai/checkov/id', 'gomboc-ai/chekov/id'];
      for (const k of singleKeys) {
        if (annotations && k in annotations) {
          const v = annotations[k];
          if (typeof v === 'string') {
            for (const id of splitIds(v)) {
              addRuleId(ruleName, id, { source: 'annotation', key: k });
            }
          }
        }
      }

      // Source 2: metadata use-case links: use-case-1, use-case-2, ...
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          if (!/^use-case-\d+$/.test(k)) {
            continue;
          }
          if (typeof v !== 'string') {
            continue;
          }
          for (const id of scanForIds(v)) {
            addRuleId(ruleName, id, { source: 'usecase', key: k });
          }
        }
      }
    }

    out.checkIds = Array.from(globalIds).sort();
    for (const [k, ids] of Object.entries(out.checkIdsByRule)) {
      out.checkIdsByRule[k] = Array.from(new Set(ids)).sort();
    }
    for (const [id, evidence] of Object.entries(out.evidenceByCheckId)) {
      out.evidenceByCheckId[id] = evidence
        .slice()
        .sort((a, b) => a.ruleName.localeCompare(b.ruleName));
    }
    return out;
  }
}
