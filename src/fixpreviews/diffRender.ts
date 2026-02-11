export type DiffLine =
  | { kind: 'context'; text: string }
  | { kind: 'add'; text: string }
  | { kind: 'del'; text: string };

type Op =
  | { kind: 'equal'; a: string; b: string }
  | { kind: 'insert'; b: string }
  | { kind: 'delete'; a: string };

/**
 * A lightweight Myers diff on lines.
 * Produces a sequence of operations that can be rendered in a webview.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = myers(a, b);
  const out: DiffLine[] = [];
  for (const op of ops) {
    if (op.kind === 'equal') {
      out.push({ kind: 'context', text: op.a });
    } else if (op.kind === 'insert') {
      out.push({ kind: 'add', text: op.b });
    } else {
      out.push({ kind: 'del', text: op.a });
    }
  }
  return out;
}

function splitLines(s: string): string[] {
  // Preserve empty last line behavior.
  const parts = (s ?? '').split('\n');
  return parts;
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
