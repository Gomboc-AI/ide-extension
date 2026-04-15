import { buildLanguageDiagnosticContextWithFallback } from './languageDiagnosticOrchestrator';

describe('languageDiagnosticOrchestrator', () => {
  it('uses content-aware selection for kubernetes yaml', () => {
    const context = buildLanguageDiagnosticContextWithFallback({
      filePath: '/workspace/k8s/deploy.yaml',
      originalContent: [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: web',
      ].join('\n'),
      modifiedContent: '',
      line: 2,
    });
    expect(context.languageId).toBe('kubernetes-yaml');
    expect(context.blockHeader).toContain('Deployment');
  });

  it('falls back to modified content when original has no blocks', () => {
    const context = buildLanguageDiagnosticContextWithFallback({
      filePath: '/workspace/Dockerfile',
      originalContent: 'RUN echo hello',
      modifiedContent: ['FROM node:20 AS base', 'RUN npm ci'].join('\n'),
      line: 1,
    });
    expect(context.languageId).toBe('dockerfile');
    expect(context.blockHeader).toContain('FROM');
  });
});
