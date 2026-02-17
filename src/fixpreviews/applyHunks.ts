import { DiffHunk, DiffLine } from './diffRender';

export function applyHunksToText(args: {
  beforeText: string;
  hunks: DiffHunk[];
  keptFingerprints: Set<string>;
}): string {
  const beforeLines = (args.beforeText ?? '').split('\n');
  const hunks = Array.isArray(args.hunks) ? args.hunks : [];
  const kept = args.keptFingerprints;

  const keptHunks = hunks
    .filter(h => kept.has(h.fingerprint))
    .slice()
    .sort((a, b) => a.oldStart - b.oldStart);

  const out = beforeLines.slice();
  let delta = 0;
  for (const h of keptHunks) {
    const startIdx = Math.max(0, h.oldStart - 1 + delta);
    const removeCount = Math.max(0, h.oldLines);
    const insertLines = hunkNewLines(h.lines);
    out.splice(startIdx, removeCount, ...insertLines);
    delta += insertLines.length - removeCount;
  }

  return out.join('\n');
}

function hunkNewLines(lines: DiffLine[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.kind === 'del') {
      continue;
    }
    out.push(l.text ?? '');
  }
  return out;
}
