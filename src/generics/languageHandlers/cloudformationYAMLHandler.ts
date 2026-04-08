import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestResourceArgs,
  FindResourceAtLineArgs,
  ILanguageHandler,
  ListResourcesArgs,
  ResourceRange,
  GetDocumentInfoArgs,
} from '../types';

export class CloudFormationYAMLLanguageHandler implements ILanguageHandler {
  displayName = 'CloudFormation YAML';
  extensions = ['.yaml', '.yml'];

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'cloudformation-yaml',
      filePath: args.filePath,
      fileName,
      extension: ext,
      isConfigLike: true,
      supportsResources: true,
    };
  }

  findResourceAtLine(args: FindResourceAtLineArgs): ResourceRange | null {
    void args;
    return null;
  }

  findNearestResource(args: FindNearestResourceArgs): ResourceRange | null {
    void args;
    return null;
  }

  listResources(args: ListResourcesArgs): ResourceRange[] {
    void args;
    return [];
  }

  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext {
    return {
      languageId: 'cloudformation-yaml',
      filePath: args.filePath,
      resource: this.findResourceAtLine({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      }) ?? undefined,
      nearestResource: this.findNearestResource({
        filePath: args.filePath,
        content: args.content,
        line: args.hint.line,
      }) ?? undefined,
      tags: [],
    };
  }
}
