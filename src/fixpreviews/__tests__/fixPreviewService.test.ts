import { FixPreviewService, PreviewCache } from '../fixPreviewService';

describe('PreviewCache', () => {
  it('returns cached values within ttl', () => {
    let nowMs = 1_000;
    const cache = new PreviewCache<string>(100, () => nowMs);
    cache.set('k', 'v');
    nowMs = 1_050;
    expect(cache.get('k')).toBe('v');
  });

  it('expires cache entries after ttl', () => {
    let nowMs = 1_000;
    const cache = new PreviewCache<string>(100, () => nowMs);
    cache.set('k', 'v');
    nowMs = 1_200;
    expect(cache.get('k')).toBe(undefined);
  });

  it('clears all entries', () => {
    const cache = new PreviewCache<string>(100);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBe(undefined);
    expect(cache.get('b')).toBe(undefined);
  });
});

describe('FixPreviewService injection seams', () => {
  it('returns cached preview and skips ORL client creation', async () => {
    const cachedPayload = { scannedAt: 'now', files: [] };
    const fakeCache = {
      get: jest.fn().mockReturnValue(cachedPayload),
      set: jest.fn(),
      clear: jest.fn(),
    } as unknown as PreviewCache<{ scannedAt?: string; files: [] }>;
    const createClient = jest.fn();

    const service = new FixPreviewService(
      { extensionPath: '/ext', storagePath: '/tmp' },
      createClient,
      jest.fn(),
      jest.fn(),
      fakeCache as unknown as PreviewCache<never>,
    );

    const result = await service.previewSelected({
      scanScope: {
        workspacePath: '/repo',
        language: 'terraform',
        scannedAt: 'now',
      },
      selectedIssues: [{ ruleName: 'rule', filePath: '/repo/main.tf' }],
    });

    expect(result).toBe(cachedPayload);
    expect(createClient).not.toHaveBeenCalled();
  });
});
