import {
  ORL_LANGUAGE_FILE_EXTENSIONS,
  isOrlScopableFilePath,
  parseOrlLanguageDetectionMap,
  resolveScopeLanguage,
} from '../orlLanguageDetection';

describe('parseOrlLanguageDetectionMap', () => {
  it('parses the bicep detect-language example', () => {
    const map = parseOrlLanguageDetectionMap({
      '.': [
        {
          name: 'bicep',
          recursionDefault: true,
          ruleSpaceRuleCount: 0,
        },
      ],
    });

    expect(map).toEqual({
      '.': [
        {
          name: 'bicep',
          recursionDefault: true,
          ruleSpaceRuleCount: 0,
        },
      ],
    });
  });

  it('returns null for invalid payloads', () => {
    expect(parseOrlLanguageDetectionMap(null)).toBeNull();
    expect(parseOrlLanguageDetectionMap({ '.': 'terraform' })).toBeNull();
  });
});

describe('resolveScopeLanguage', () => {
  it('returns null when the root directory has no languages', () => {
    expect(
      resolveScopeLanguage({
        map: { '.': [] },
      }),
    ).toBeNull();
  });

  it('returns the single detected language name', () => {
    expect(
      resolveScopeLanguage({
        map: {
          '.': [
            {
              name: 'bicep',
              recursionDefault: true,
              ruleSpaceRuleCount: 0,
            },
          ],
        },
      }),
    ).toBe('bicep');
  });

  it('disambiguates multiple languages using the active file extension', () => {
    const map = {
      '.': [
        {
          name: 'terraform',
          recursionDefault: true,
          ruleSpaceRuleCount: 2,
        },
        {
          name: 'bicep',
          recursionDefault: true,
          ruleSpaceRuleCount: 5,
        },
      ],
    };

    expect(
      resolveScopeLanguage({
        map,
        activeFilePath: '/repo/main.tf',
      }),
    ).toBe('terraform');
    expect(
      resolveScopeLanguage({
        map,
        activeFilePath: '/repo/main.bicep',
      }),
    ).toBe('bicep');
  });

  it('prefers highest ruleSpaceRuleCount when extension does not disambiguate', () => {
    expect(
      resolveScopeLanguage({
        map: {
          '.': [
            {
              name: 'terraform',
              recursionDefault: true,
              ruleSpaceRuleCount: 1,
            },
            {
              name: 'hcl',
              recursionDefault: true,
              ruleSpaceRuleCount: 4,
            },
          ],
        },
      }),
    ).toBe('hcl');
  });
});

describe('isOrlScopableFilePath', () => {
  it('accepts known ORL file extensions', () => {
    expect(isOrlScopableFilePath('/repo/main.tf')).toBe(true);
    expect(isOrlScopableFilePath('/repo/main.bicep')).toBe(true);
    expect(isOrlScopableFilePath('/repo/main.unknown')).toBe(false);
  });

  it('includes extensions from the language map', () => {
    for (const extensions of Object.values(ORL_LANGUAGE_FILE_EXTENSIONS)) {
      for (const ext of extensions) {
        if (ext.startsWith('.')) {
          expect(isOrlScopableFilePath(`/repo/file${ext}`)).toBe(true);
        }
      }
    }
  });
});
