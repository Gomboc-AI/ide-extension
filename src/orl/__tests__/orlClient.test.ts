import { OrlClient } from '../orlClient';

// Mock the logger to avoid setImmediate issues in test environment
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('OrlClient', () => {
  let orlClient: OrlClient;

  beforeEach(() => {
    orlClient = new OrlClient({
      containerImage: 'gomboc/orl:latest',
      rulesServiceUrl: 'https://rules.app.gomboc.ai',
      rulesServiceToken: 'test-token',
    });
  });

  describe('parseOrlOutput', () => {
    it('should parse ORL dry-run output correctly', () => {
      const mockOutput = `---
main.tf
resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
  acl    = "private"
}
---
variables.tf
variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}`;

      // Access private method for testing
      const result = (orlClient as any).parseOrlOutput(mockOutput);

      expect(result).toEqual({
        '/workspace/main.tf':
          'resource "aws_s3_bucket" "example" {\n  bucket = "my-bucket"\n  acl    = "private"\n}',
        '/workspace/variables.tf':
          'variable "bucket_name" {\n  description = "Name of the S3 bucket"\n  type        = string\n}',
      });
    });

    it('should handle unchanged files', () => {
      const mockOutput = `---
main.tf is unchanged.
---
variables.tf
variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}`;

      const result = (orlClient as any).parseOrlOutput(mockOutput);

      expect(result).toEqual({
        '/workspace/variables.tf':
          'variable "bucket_name" {\n  description = "Name of the S3 bucket"\n  type        = string\n}',
      });
    });

    it('should handle empty output', () => {
      const result = (orlClient as any).parseOrlOutput('');
      expect(result).toEqual({});
    });
  });

  describe('isIacFile', () => {
    it('should identify IaC files correctly', () => {
      expect((orlClient as any).isIacFile('main.tf')).toBe(true);
      expect((orlClient as any).isIacFile('template.yaml')).toBe(true);
      expect((orlClient as any).isIacFile('config.yml')).toBe(true);
      expect((orlClient as any).isIacFile('template.json')).toBe(true);
      expect((orlClient as any).isIacFile('cloudformation.json')).toBe(true);
      expect((orlClient as any).isIacFile('stack.json')).toBe(true);
    });

    it('should reject non-IaC files', () => {
      expect((orlClient as any).isIacFile('README.md')).toBe(false);
      expect((orlClient as any).isIacFile('script.sh')).toBe(false);
      expect((orlClient as any).isIacFile('package.json')).toBe(false);
      expect((orlClient as any).isIacFile('data.json')).toBe(false);
    });
  });
});
