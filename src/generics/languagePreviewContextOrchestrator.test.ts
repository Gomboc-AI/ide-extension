import { buildLanguagePreviewResourceContexts } from './languagePreviewContextOrchestrator';

describe('languagePreviewContextOrchestrator', () => {
  it('builds terraform contexts using block boundaries', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/main.tf',
      content: [
        'resource "aws_s3_bucket" "logs" {',
        '  bucket = "logs-bucket"',
        '}',
        '',
        'resource "aws_db_instance" "main" {',
        '  allocated_storage = 20',
        '}',
      ].join('\n'),
      hunks: [{ fingerprint: 'h-1', newStart: 6 }],
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'resource "aws_db_instance" "main" {',
      startLine: 5,
      endLine: 7,
      relatedHunkFingerprints: ['h-1'],
    });
  });

  it('builds yaml contexts from document boundaries', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/deployment.yaml',
      content: [
        '---',
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: web',
        'spec:',
        '  replicas: 2',
      ].join('\n'),
      hunks: [{ fingerprint: 'h-1', newStart: 4 }],
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'YAML document: Deployment/web',
      startLine: 1,
      endLine: 7,
      relatedHunkFingerprints: ['h-1'],
    });
  });

  it('builds docker contexts from stage boundaries', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/Dockerfile',
      content: [
        'FROM node:20 AS build',
        'RUN npm ci',
        'FROM node:20-alpine',
        'COPY --from=build /app /app',
      ].join('\n'),
      hunks: [{ fingerprint: 'h-2', newStart: 4 }],
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'Docker stage: FROM node:20-alpine',
      startLine: 3,
      endLine: 4,
      relatedHunkFingerprints: ['h-2'],
    });
  });

  it('builds json container contexts for package manifests', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/package.json',
      content: ['{', '  "name": "svc",', '  "version": "1.0.0"', '}'].join(
        '\n',
      ),
      hunks: [{ fingerprint: 'h-3', newStart: 2 }],
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'JSON container',
      startLine: 1,
      endLine: 4,
      relatedHunkFingerprints: ['h-3'],
    });
  });

  it('falls back to line-window context for unknown language files', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/notes.txt',
      content: Array.from({ length: 30 }, (_, idx) => `line-${idx + 1}`).join(
        '\n',
      ),
      hunks: [{ fingerprint: 'h-4', newStart: 25 }],
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      title: 'Context around line 25',
      startLine: 1,
      endLine: 30,
      relatedHunkFingerprints: ['h-4'],
    });
  });

  it('dedupes contexts and keeps truncation behavior', () => {
    const contexts = buildLanguagePreviewResourceContexts({
      filePath: '/workspace/notes.txt',
      content: Array.from({ length: 120 }, (_, idx) => `line-${idx + 1}`).join(
        '\n',
      ),
      hunks: [
        { fingerprint: 'h-5', newStart: 80 },
        { fingerprint: 'h-6', newStart: 80 },
      ],
      maxLinesPerContext: 50,
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].relatedHunkFingerprints).toEqual(['h-5', 'h-6']);
    expect(contexts[0].truncated).toBe(true);
    expect(contexts[0].text.split('\n').slice(-1)[0]).toBe('… (truncated)');
  });
});
