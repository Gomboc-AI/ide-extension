import { getFileType } from '../lib';

describe('getFileType', () => {
  it('returns tf for main.tf', () => {
    expect(getFileType('main.tf')).toBe('tf');
  });

  it('returns Dockerfile when there is no extension', () => {
    expect(getFileType('Dockerfile')).toBe('Dockerfile');
  });

  it('returns yaml for config.yaml', () => {
    expect(getFileType('config.yaml')).toBe('yaml');
  });

  it('returns only last extension for archive.tar.gz', () => {
    expect(getFileType('archive.tar.gz')).toBe('gz');
  });

  it('returns empty string for empty filename', () => {
    expect(getFileType('')).toBe('');
  });

  it('returns empty string for trailing dot', () => {
    expect(getFileType('file.')).toBe('');
  });
});
