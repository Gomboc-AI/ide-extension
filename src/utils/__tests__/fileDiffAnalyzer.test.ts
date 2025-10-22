import { FileDiffAnalyzer } from '../fileDiffAnalyzer';

// Mock logger to avoid setImmediate issues in tests
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('FileDiffAnalyzer - Improved Grouping', () => {
  describe('findDifferences', () => {
    it('should group related lines together to maintain syntax integrity', () => {
      const originalContent = `resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
}`;

      const modifiedContent = `resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  encryption {
    algorithm = "AES256"
  }
  versioning {
    enabled = true
  }
}`;

      const differences = FileDiffAnalyzer.findDifferences(
        originalContent,
        modifiedContent,
      );

      // Should create grouped changes instead of individual line changes
      expect(differences.length).toBeLessThan(4); // Less than individual lines

      // Each difference should contain related lines
      differences.forEach(diff => {
        expect(diff.newLines.length).toBeGreaterThan(0);
        // Should contain complete blocks, not orphaned lines
        if (diff.newLines.some(line => line.includes('encryption'))) {
          expect(diff.newLines.some(line => line.includes('algorithm'))).toBe(
            true,
          );
        }
        if (diff.newLines.some(line => line.includes('versioning'))) {
          expect(diff.newLines.some(line => line.includes('enabled'))).toBe(
            true,
          );
        }
      });
    });

    it('should handle nested blocks correctly', () => {
      const originalContent = `resource "aws_rds_cluster" "example" {
  cluster_identifier = "test"
}`;

      const modifiedContent = `resource "aws_rds_cluster" "example" {
  cluster_identifier = "test"
  encryption {
    algorithm = "AES256"
    kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
  }
}`;

      const differences = FileDiffAnalyzer.findDifferences(
        originalContent,
        modifiedContent,
      );

      // Should group the entire encryption block together
      const encryptionDiff = differences.find(diff =>
        diff.newLines.some(line => line.includes('encryption')),
      );

      expect(encryptionDiff).toBeDefined();
      expect(encryptionDiff!.newLines.length).toBeGreaterThan(1);
      expect(
        encryptionDiff!.newLines.some(line => line.includes('algorithm')),
      ).toBe(true);
      expect(
        encryptionDiff!.newLines.some(line => line.includes('kms_key_id')),
      ).toBe(true);
    });

    it('should not create orphaned closing braces', () => {
      const originalContent = `resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
}`;

      const modifiedContent = `resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  encryption {
    algorithm = "AES256"
  }
}`;

      const differences = FileDiffAnalyzer.findDifferences(
        originalContent,
        modifiedContent,
      );

      // Check that no difference contains orphaned braces
      differences.forEach(diff => {
        const content = diff.newLines.join('');
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;

        // Each group should have balanced braces or be part of a larger balanced structure
        expect(Math.abs(openBraces - closeBraces)).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('groupRelatedLines', () => {
    it('should group lines by brace depth', () => {
      const lines = [
        '  encryption {',
        '    algorithm = "AES256"',
        '  }',
        '  versioning {',
        '    enabled = true',
        '  }',
      ];

      const groups = (FileDiffAnalyzer as any).groupRelatedLines(lines);

      expect(groups.length).toBe(2); // Two separate blocks
      expect(groups[0]).toEqual([
        '  encryption {',
        '    algorithm = "AES256"',
        '  }',
      ]);
      expect(groups[1]).toEqual([
        '  versioning {',
        '    enabled = true',
        '  }',
      ]);
    });

    it('should handle single-line additions', () => {
      const lines = [
        '  backup_window = "03:00-04:00"',
        '  auto_minor_version_upgrade = false',
      ];

      const groups = (FileDiffAnalyzer as any).groupRelatedLines(lines);

      expect(groups.length).toBe(2); // Two separate single-line additions
      expect(groups[0]).toEqual(['  backup_window = "03:00-04:00"']);
      expect(groups[1]).toEqual(['  auto_minor_version_upgrade = false']);
    });
  });
});
