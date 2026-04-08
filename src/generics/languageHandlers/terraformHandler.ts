import path from 'path';
import {
  BuildDiagnosticContextArgs,
  DiagnosticContext,
  DocumentInfo,
  FindNearestResourceArgs,
  FindResourceAtLineArgs,
  GetDocumentInfoArgs,
  ILanguageHandler,
  ListResourcesArgs,
  ResourceRange,
} from '../types';

export class TerraformLanguageHandler implements ILanguageHandler {
  displayName = 'Terraform';
  extensions = ['.tf', '.tfvars', '.hcl'];

  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo {
    const ext = path.extname(args.filePath).toLowerCase();
    const fileName = path.basename(args.filePath);

    return {
      languageId: 'terraform',
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
      languageId: 'terraform',
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
