import { DiffContentAnalyzer } from '../diffContentAnalyzer';

// Mock logger to avoid setImmediate issues in tests
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('DiffContentAnalyzer', () => {
  describe('analyzeDiffContent', () => {
    it('should analyze Terraform resource encryption changes', () => {
      const diff = {
        newLines: ['  encryption {', '    algorithm = "AES256"', '  }'],
        type: 'ADD' as const,
        targetLine: 5,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.changeType).toBe('Add encryption block');
      expect(analysis.propertyName).toBe('encryption');
      expect(analysis.description).toContain('Add encryption block');
    });

    it('should analyze S3 bucket versioning changes', () => {
      const diff = {
        newLines: ['  versioning {', '    enabled = true', '  }'],
        type: 'ADD' as const,
        targetLine: 8,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.changeType).toBe('Add versioning block');
      expect(analysis.propertyName).toBe('versioning');
      expect(analysis.description).toContain('Add versioning block');
    });

    it('should analyze RDS backup window changes', () => {
      const diff = {
        newLines: ['  backup_window = "03:00-04:00"'],
        type: 'ADD' as const,
        targetLine: 12,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.changeType).toBe('Set backup_window');
      expect(analysis.propertyName).toBe('backup_window');
      expect(analysis.description).toContain('Set backup_window');
    });

    it('should analyze resource definitions', () => {
      const diff = {
        newLines: [
          'resource "aws_s3_bucket" "example" {',
          '  bucket = "my-bucket"',
          '}',
        ],
        type: 'ADD' as const,
        targetLine: 1,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.resourceType).toBe('aws_s3_bucket');
      expect(analysis.resourceName).toBe('example');
      expect(analysis.description).toContain('aws_s3_bucket "example"');
    });

    it('should handle generic property assignments', () => {
      const diff = {
        newLines: ['  auto_minor_version_upgrade = false'],
        type: 'ADD' as const,
        targetLine: 15,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.changeType).toBe('Set auto_minor_version_upgrade');
      expect(analysis.propertyName).toBe('auto_minor_version_upgrade');
      expect(analysis.description).toContain('Set auto_minor_version_upgrade');
    });

    it('should use actual content when no specific patterns match', () => {
      const diff = {
        newLines: ['  some_unknown_property = "value"'],
        type: 'ADD' as const,
        targetLine: 20,
      };

      const analysis = DiffContentAnalyzer.analyzeDiffContent(diff);

      expect(analysis.changeType).toBe('Set some_unknown_property');
      expect(analysis.propertyName).toBe('some_unknown_property');
      expect(analysis.description).toContain('Set some_unknown_property');
    });
  });
});
