import { applyHunksToText } from '../applyHunks';
import { diffToHunks } from '../diffRender';

const numberedLines = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `line-${i + 1}`);

describe('applyHunksToText', () => {
  it('returns beforeText unchanged when keptFingerprints is empty', () => {
    const before = 'a\nb\nc';
    const after = 'a\nx\nc';
    const { hunks } = diffToHunks(before, after);

    const result = applyHunksToText({
      beforeText: before,
      hunks,
      keptFingerprints: new Set<string>(),
    });

    expect(result).toBe(before);
  });

  it('returns fully applied content when all fingerprints are kept', () => {
    const before = 'a\nb\nc';
    const after = 'a\nx\nc';
    const { hunks } = diffToHunks(before, after);

    const result = applyHunksToText({
      beforeText: before,
      hunks,
      keptFingerprints: new Set(hunks.map(h => h.fingerprint)),
    });

    expect(result).toBe(after);
  });

  it('applies a single hunk by removing and inserting at the correct position', () => {
    const before = 'a\nb\nc';
    const after = 'a\nx\nc';
    const { hunks } = diffToHunks(before, after);

    const result = applyHunksToText({
      beforeText: before,
      hunks,
      keptFingerprints: new Set([hunks[0].fingerprint]),
    });

    expect(result).toBe(after);
  });

  it('applies multiple non-adjacent hunks with correct delta offsets', () => {
    const before = numberedLines(20);
    const after = [...before];
    after.splice(2, 0, 'line-3a-inserted');
    after.splice(18, 1);

    const beforeText = before.join('\n');
    const afterText = after.join('\n');
    const { hunks } = diffToHunks(beforeText, afterText);

    expect(hunks).toHaveLength(2);

    const result = applyHunksToText({
      beforeText,
      hunks,
      keptFingerprints: new Set(hunks.map(h => h.fingerprint)),
    });

    expect(result).toBe(afterText);
  });

  it('skips hunks not in keptFingerprints while still applying others', () => {
    const before = numberedLines(20);
    const after = [...before];
    after[1] = 'line-2-updated';
    after[15] = 'line-16-updated';

    const beforeText = before.join('\n');
    const afterText = after.join('\n');
    const { hunks } = diffToHunks(beforeText, afterText);

    expect(hunks).toHaveLength(2);

    const result = applyHunksToText({
      beforeText,
      hunks,
      keptFingerprints: new Set([hunks[0].fingerprint]),
    });

    expect(result).not.toBe(beforeText);
    expect(result).not.toBe(afterText);
  });

  it('returns empty string when beforeText is empty', () => {
    const result = applyHunksToText({
      beforeText: '',
      hunks: [],
      keptFingerprints: new Set<string>(),
    });

    expect(result).toBe('');
  });

  it('returns beforeText unchanged when hunks is empty', () => {
    const before = 'a\nb\nc';

    const result = applyHunksToText({
      beforeText: before,
      hunks: [],
      keptFingerprints: new Set<string>(['unused']),
    });

    expect(result).toBe(before);
  });

  it('round-trips diffToHunks to fully applied text', () => {
    const before = 'a\nb\nc\nd';
    const after = 'a\nx\nc\nd\ne';
    const { hunks } = diffToHunks(before, after);

    const result = applyHunksToText({
      beforeText: before,
      hunks,
      keptFingerprints: new Set(hunks.map(h => h.fingerprint)),
    });

    expect(result).toBe(after);
  });
});
