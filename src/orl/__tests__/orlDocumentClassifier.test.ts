import {
  buildCloudFormationTemplateContext,
  detectOrlDocumentKinds,
} from '../orlDocumentClassifier';

describe('detectOrlDocumentKinds()', () => {
  it('classifies CloudFormation YAML as cloudformation', () => {
    const kinds = detectOrlDocumentKinds({
      filePath: '/workspace/template.yaml',
      content: [
        'AWSTemplateFormatVersion: "2010-09-09"',
        'Resources:',
        '  Bucket:',
        '    Type: AWS::S3::Bucket',
      ].join('\n'),
    });

    expect(kinds.isCloudFormation).toBe(true);
    expect(kinds.isKubernetes).toBe(false);
    expect(kinds.isHelm).toBe(false);
  });

  it('does not classify Kubernetes YAML as cloudformation', () => {
    const kinds = detectOrlDocumentKinds({
      filePath: '/workspace/deployment.yaml',
      content: [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: web',
      ].join('\n'),
    });

    expect(kinds.isKubernetes).toBe(true);
    expect(kinds.isCloudFormation).toBe(false);
  });

  it('does not classify Helm templates as cloudformation', () => {
    const kinds = detectOrlDocumentKinds({
      filePath: '/workspace/charts/app/templates/deployment.yaml',
      content: [
        '{{- if .Values.enabled }}',
        'apiVersion: apps/v1',
        'kind: Deployment',
      ].join('\n'),
    });

    expect(kinds.isHelm).toBe(true);
    expect(kinds.isCloudFormation).toBe(false);
  });
});

describe('buildCloudFormationTemplateContext()', () => {
  it('anchors CloudFormation templates to the full document', () => {
    expect(
      buildCloudFormationTemplateContext({
        filePath: '/workspace/template.json',
        totalLines: 7,
      }),
    ).toEqual({
      resourceName: 'cloudformation_template',
      resourceInstanceName: 'template.json',
      resourceStartLine: 0,
      resourceEndLine: 6,
    });
  });
});
