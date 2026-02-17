import * as crypto from 'crypto';

export type DiffLine = {
  kind: 'context' | 'add' | 'del';
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type DiffHunk = {
  id: string;
  fingerprint: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

type Op =
  | { kind: 'equal'; a: string; b: string }
  | { kind: 'insert'; b: string }
  | { kind: 'delete'; a: string };

/**
 * A lightweight Myers diff on lines.
 * Produces a sequence of operations that can be rendered in a webview.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  return diffToHunks(before, after).lines;
}

export function diffToHunks(
  before: string,
  after: string,
  contextLines: number = 3,
): { lines: DiffLine[]; hunks: DiffHunk[] } {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = myers(a, b);

  let oldLine = 1;
  let newLine = 1;
  const lines: DiffLine[] = [];
  for (const op of ops) {
    if (op.kind === 'equal') {
      lines.push({
        kind: 'context',
        text: op.a,
        oldLine,
        newLine,
      });
      oldLine++;
      newLine++;
    } else if (op.kind === 'insert') {
      lines.push({
        kind: 'add',
        text: op.b,
        newLine,
      });
      newLine++;
    } else {
      lines.push({
        kind: 'del',
        text: op.a,
        oldLine,
      });
      oldLine++;
    }
  }

  const hunks = buildHunks(lines, contextLines);
  return { lines, hunks };
}

function splitLines(s: string): string[] {
  // Preserve empty last line behavior.
  const parts = (s ?? '').split('\n');
  return parts;
}

function buildHunks(lines: DiffLine[], contextLines: number): DiffHunk[] {
  const changeIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== 'context') {
      changeIdx.push(i);
    }
  }
  if (!changeIdx.length) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (const i of changeIdx) {
    const start = Math.max(0, i - contextLines);
    const end = Math.min(lines.length - 1, i + contextLines);
    const prev = ranges[ranges.length - 1];
    if (!prev) {
      ranges.push({ start, end });
      continue;
    }
    if (start <= prev.end + 1) {
      prev.end = Math.max(prev.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  const hunks: DiffHunk[] = [];
  for (let idx = 0; idx < ranges.length; idx++) {
    const r = ranges[idx];
    const hunkLines = lines.slice(r.start, r.end + 1);

    const oldStart =
      firstDefined(hunkLines.map(l => l.oldLine)) ??
      lastDefined(lines.slice(0, r.start).map(l => l.oldLine))?.value ??
      1;
    const newStart =
      firstDefined(hunkLines.map(l => l.newLine)) ??
      lastDefined(lines.slice(0, r.start).map(l => l.newLine))?.value ??
      1;

    const oldLinesCount = hunkLines.filter(l => l.kind !== 'add').length;
    const newLinesCount = hunkLines.filter(l => l.kind !== 'del').length;

    const fingerprint = hashFingerprint({
      oldStart,
      oldLines: oldLinesCount,
      newStart,
      newLines: newLinesCount,
      lines: hunkLines.map(l => `${l.kind}:${l.text}`),
    });

    hunks.push({
      id: `h${idx + 1}`,
      fingerprint,
      oldStart,
      oldLines: oldLinesCount,
      newStart,
      newLines: newLinesCount,
      lines: hunkLines,
    });
  }

  return hunks;
}

function firstDefined(values: Array<number | undefined>): number | undefined {
  for (const v of values) {
    if (Number.isFinite(v)) {
      return v as number;
    }
  }
  return undefined;
}

function lastDefined(values: Array<number | undefined>): { value: number } | undefined {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (Number.isFinite(v)) {
      return { value: v as number };
    }
  }
  return undefined;
}

function hashFingerprint(obj: any): string {
  const raw = JSON.stringify(obj);
  return crypto.createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 12);
}

function myers(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  // v is a map from diagonal k to farthest x.
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Array<Map<number, number>> = [];

  for (let d = 0; d <= max; d++) {
    const vCopy = new Map(v);
    trace.push(vCopy);
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d;
      const up = k === d;
      const xDown = v.get(k + 1) ?? -Infinity;
      const xUp = (v.get(k - 1) ?? -Infinity) + 1;
      let x: number;
      if (down || (!up && xDown > xUp)) {
        x = xDown;
      } else {
        x = xUp;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        return backtrack(a, b, trace, d);
      }
    }
  }
  return [];
}

function backtrack(
  a: string[],
  b: string[],
  trace: Array<Map<number, number>>,
  dMax: number,
): Op[] {
  let x = a.length;
  let y = b.length;
  const ops: Op[] = [];

  for (let d = dMax; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const down = k === -d;
    const up = k === d;
    const xDown = v.get(k + 1) ?? -Infinity;
    const xUp = (v.get(k - 1) ?? -Infinity) + 1;
    let prevK: number;
    if (down || (!up && xDown > xUp)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      // matched
      ops.push({ kind: 'equal', a: a[x - 1], b: b[y - 1] });
      x--;
      y--;
    }

    if (d === 0) {
      break;
    }

    if (x === prevX) {
      // insertion
      ops.push({ kind: 'insert', b: b[y - 1] });
      y--;
    } else {
      // deletion
      ops.push({ kind: 'delete', a: a[x - 1] });
      x--;
    }
  }

  ops.reverse();
  return ops;
}
