import { diffLines, diffToHunks } from '../diffRender';

const numberedLines = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `line-${i + 1}`);

describe('diffRender', () => {
  describe('diffLines', () => {
    it('marks all lines as additions when before is empty', () => {
      const result = diffLines('', 'a\nb');

      expect(result).toEqual([
        { kind: 'add', text: 'a', newLine: 1 },
        { kind: 'add', text: 'b', newLine: 2 },
      ]);
    });

    it('marks all lines as deletions when after is empty', () => {
      const result = diffLines('a\nb', '');

      expect(result).toEqual([
        { kind: 'del', text: 'a', oldLine: 1 },
        { kind: 'del', text: 'b', oldLine: 2 },
      ]);
    });

    it('marks all lines as context when content is identical', () => {
      const result = diffLines('a\nb', 'a\nb');

      expect(result).toEqual([
        { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
        { kind: 'context', text: 'b', oldLine: 2, newLine: 2 },
      ]);
    });

    it('numbers surrounding context correctly for single-line insertion', () => {
      const result = diffLines('a\nb\nc', 'a\nb\nx\nc');

      expect(result).toEqual([
        { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
        { kind: 'context', text: 'b', oldLine: 2, newLine: 2 },
        { kind: 'add', text: 'x', newLine: 3 },
        { kind: 'context', text: 'c', oldLine: 3, newLine: 4 },
      ]);
    });

    it('numbers surrounding context correctly for single-line deletion', () => {
      const result = diffLines('a\nb\nc', 'a\nc');

      expect(result).toEqual([
        { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
        { kind: 'del', text: 'b', oldLine: 2 },
        { kind: 'context', text: 'c', oldLine: 3, newLine: 2 },
      ]);
    });
  });

  describe('diffToHunks', () => {
    it('returns no hunks when there are no changes', () => {
      const result = diffToHunks('a\nb', 'a\nb');

      expect(result.hunks).toEqual([]);
      expect(result.lines.every(l => l.kind === 'context')).toBe(true);
    });

    it('returns one hunk with expected counts for a single change', () => {
      const result = diffToHunks('a\nb\nc', 'a\nb\nx\nc');

      expect(result.hunks).toHaveLength(1);
      expect(result.hunks[0]).toEqual(
        expect.objectContaining({
          oldStart: 1,
          newStart: 1,
          oldLines: 3,
          newLines: 4,
        }),
      );
    });

    it('merges two changes within six lines into one hunk', () => {
      const before = numberedLines(12);
      const after = numberedLines(12);
      after[2] = 'line-3-updated';
      after[8] = 'line-9-updated';

      const result = diffToHunks(before.join('\n'), after.join('\n'));

      expect(result.hunks).toHaveLength(1);
    });

    it('keeps two changes more than six lines apart as separate hunks', () => {
      const before = numberedLines(16);
      const after = numberedLines(16);
      after[2] = 'line-3-updated';
      after[10] = 'line-11-updated';

      const result = diffToHunks(before.join('\n'), after.join('\n'));

      expect(result.hunks).toHaveLength(2);
    });

    it('includes exactly three context lines before and after a centered change', () => {
      const before = numberedLines(10);
      const after = [...before];
      after[4] = 'line-5-updated';

      const result = diffToHunks(before.join('\n'), after.join('\n'));
      const hunk = result.hunks[0];
      const firstChangeIdx = hunk.lines.findIndex(l => l.kind !== 'context');
      let lastChangeIdx = -1;
      for (let i = hunk.lines.length - 1; i >= 0; i--) {
        if (hunk.lines[i].kind !== 'context') {
          lastChangeIdx = i;
          break;
        }
      }

      expect(firstChangeIdx).toBe(3);
      expect(lastChangeIdx).toBe(4);
      expect(hunk.lines.slice(0, firstChangeIdx).every(l => l.kind === 'context')).toBe(
        true,
      );
      expect(
        hunk.lines
          .slice(lastChangeIdx + 1)
          .every(l => l.kind === 'context'),
      ).toBe(true);
      expect(hunk.lines.slice(0, firstChangeIdx)).toHaveLength(3);
      expect(hunk.lines.slice(lastChangeIdx + 1)).toHaveLength(3);
    });

    it('handles a first-line change without negative context', () => {
      const before = 'a\nb\nc';
      const after = 'x\nb\nc';

      const result = diffToHunks(before, after);

      expect(result.hunks[0].oldStart).toBe(1);
      expect(result.hunks[0].newStart).toBe(1);
    });

    it('handles a last-line change without exceeding bounds', () => {
      const before = 'a\nb\nc';
      const after = 'a\nb\nx';

      const result = diffToHunks(before, after);
      const hunk = result.hunks[0];

      expect(hunk.lines.some(line => line.kind !== 'context' && line.text === 'x')).toBe(
        true,
      );
      expect(
        hunk.lines.every(
          line =>
            (line.oldLine === undefined || line.oldLine <= 3) &&
            (line.newLine === undefined || line.newLine <= 3),
        ),
      ).toBe(true);
    });

    it('produces deterministic fingerprints for the same input', () => {
      const before = 'a\nb\nc';
      const after = 'a\nx\nc';

      const one = diffToHunks(before, after);
      const two = diffToHunks(before, after);

      expect(one.hunks[0].fingerprint).toBe(two.hunks[0].fingerprint);
    });

    it('changes fingerprint when changed text differs', () => {
      const before = 'a\nb\nc';
      const afterOne = 'a\nx\nc';
      const afterTwo = 'a\ny\nc';

      const one = diffToHunks(before, afterOne);
      const two = diffToHunks(before, afterTwo);

      expect(one.hunks[0].fingerprint).not.toBe(two.hunks[0].fingerprint);
    });

    it('changes fingerprint when change position differs', () => {
      const before = numberedLines(12).join('\n');
      const linesOne = numberedLines(12);
      const linesTwo = numberedLines(12);
      linesOne[1] = 'line-2-updated';
      linesTwo[9] = 'line-10-updated';
      const afterOne = linesOne.join('\n');
      const afterTwo = linesTwo.join('\n');

      const one = diffToHunks(before, afterOne);
      const two = diffToHunks(before, afterTwo);

      expect(one.hunks[0].oldStart).not.toBe(two.hunks[0].oldStart);
      expect(one.hunks[0].fingerprint).not.toBe(two.hunks[0].fingerprint);
    });

    it('uses no context lines when contextLines is zero', () => {
      const result = diffToHunks('a\nb\nc', 'a\nx\nc', 0);
      const hunk = result.hunks[0];

      expect(hunk.lines).toHaveLength(2);
      expect(hunk.lines.every(l => l.kind !== 'context')).toBe(true);
    });

    it('uses one context line on each side when contextLines is one', () => {
      const result = diffToHunks('a\nb\nc', 'a\nx\nc', 1);
      const hunk = result.hunks[0];

      expect(hunk.lines).toHaveLength(4);
      expect(hunk.lines[0].kind).toBe('context');
      expect(hunk.lines[3].kind).toBe('context');
      expect(hunk.lines.slice(1, 3).every(l => l.kind !== 'context')).toBe(true);
    });
  });
});
