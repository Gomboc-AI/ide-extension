export type StorageEntryType = 'file' | 'directory' | 'symlink' | 'other';
export interface StorageEntry {
  name: string;
  path: string;
  type: StorageEntryType;
}

export interface ReadTextOptions {
  encoding?: BufferEncoding; // default 'utf8'
}
export interface WriteTextOptions {
  encoding?: BufferEncoding; // default 'utf8'
  mode?: number; // e.g. 0o755 for hooks
}
export interface RemoveOptions {
  recursive?: boolean;
  force?: boolean;
}
export interface MkdirOptions {
  recursive?: boolean;
}

export interface ReadTextArgs {
  path: string;
  opts?: ReadTextOptions;
}

export interface WriteTextArgs {
  path: string;
  content: string;
  opts?: WriteTextOptions;
}

export interface WriteBytesArgs {
  path: string;
  content: Uint8Array;
  opts?: { mode?: number };
}

export interface MkdirArgs {
  path: string;
  opts?: MkdirOptions;
}

export interface CopyFileArgs {
  srcPath: string;
  destPath: string;
}

export interface RemoveArgs {
  path: string;
  opts?: RemoveOptions;
}

/** Arguments for {@link IStorage.mkdtemp}, mirroring Node `fs.promises.mkdtemp`. */
export interface MkdtempArgs {
  /**
   * Directory name prefix; Node appends random characters to the final path segment
   * (e.g. `path.join(os.tmpdir(), 'orl-discovery-')`).
   */
  prefix: string;
}

/**
 * This is a interface to represent a storage system with read, write, copy properties
 */
export interface IStorage {
  // identity/capabilities
  isCaseSensitive: boolean;
  // path-independent file operations
  exists(path: string): Promise<boolean>;
  stat(
    path: string,
  ): Promise<{ type: StorageEntryType; size?: number; mtimeMs?: number }>;
  readText(args: ReadTextArgs): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(args: WriteTextArgs): Promise<void>;
  writeBytes(args: WriteBytesArgs): Promise<void>;
  mkdir(args: MkdirArgs): Promise<void>;
  listDir(path: string): Promise<StorageEntry[]>;
  copy(args: CopyFileArgs): Promise<void>;
  remove(args: RemoveArgs): Promise<void>;
  /** Create a unique temporary directory; not all storage backends support this. */
  mkdtemp?(args: MkdtempArgs): Promise<string>;
}

export interface GetDocumentInfoArgs {
  filePath: string;
  content: string;
}

export interface DetectLanguageArgs {
  filePath: string;
  content: string;
}
export interface FindBlockAtLineArgs {
  filePath: string;
  content: string;
  line: number;
}
export interface FindNearestBlockArgs {
  filePath: string;
  content: string;
  line: number;
}
export interface FindScopedEditRangeArgs {
  filePath: string;
  content: string;
  line: number;
}
export interface ListBlocksArgs {
  filePath: string;
  content: string;
}
export interface BuildDiagnosticContextArgs {
  filePath: string;
  content: string;
  hint: DiagnosticHint;
}

export interface DiagnosticHint {
  line: number;
  message?: string;
  ruleName?: string;
  filePath: string;
  newLines?: string[];
}

export interface DocumentInfo {
  languageId: string;
  filePath: string;
  fileName: string;
  extension: string;
  isConfigLike?: boolean;
  supportsBlocks?: boolean;
}

export interface BlockRange {
  type: string; // e.g. "aws_instance", "Deployment", "docker_stage"
  name?: string; // e.g. "web", "my-app"
  startLine: number; // 1-based
  endLine: number; // 1-based
  header: string; // display label for diagnostics/code actions
}

export interface ScopedEditRange {
  startLine: number; // 1-based
  endLine: number; // 1-based
}

export interface DiagnosticContext {
  languageId: string;
  filePath: string;
  block?: BlockRange;
  nearestBlock?: BlockRange;
  diagnosticAnchorLine?: number; // 1-based diagnostic line anchor
  blockHeader: string; // user-facing block label
  fallbackBlock?: boolean; // true when block context could not be resolved
  tags?: string[]; // optional hints for rule matching
}

export interface DescribeBlockArgs {
  filePath: string;
  content: string;
  line: number;
  block?: BlockRange;
}

export interface BlockDescription {
  blockType: string;
  blockName: string | null;
  blockStartLine: number;
  blockEndLine: number;
}

export interface BuildDiagnosticRangeArgs {
  line1Based: number;
  content: string;
  uniqueOffset?: number;
}

export interface DiagnosticRangeResult {
  startChar: number;
  endChar: number;
}

export interface ResolveDiagnosticAnchorLineArgs {
  content: string;
  suggestedLine: number;
  fromFixOperation: boolean;
}

export interface MatchRulesToDiffArgs {
  blockType: string;
  blockName: string | null;
  allFileRules: string[];
  diffLine: number;
  diffContent: string;
  properties: string[];
}

/**
 * This represents the implementation of a language and it's associated behavior and
 * properties.
 */
export interface FormatBlockDisplayNameArgs {
  blockType: string;
  blockName: string | null;
  filePath: string;
}

/**
 * Strategy for grouping fix-preview resource snippets around diff hunks
 * (see fixpreviews/resourceContext.ts).
 */
export type ResourceContextExtractKind =
  | 'terraform'
  | 'yaml'
  | 'dockerfile'
  | 'json'
  | 'unknown';

export interface PreviewContextHunk {
  fingerprint: string;
  newStart: number;
}

export interface PreviewResourceContext {
  id: string;
  title: string;
  startLine: number;
  endLine: number;
  text: string;
  truncated?: boolean;
  relatedHunkFingerprints: string[];
}

export interface BuildPreviewResourceContextsArgs {
  filePath: string;
  content: string;
  hunks: PreviewContextHunk[];
  maxContexts?: number;
  maxLinesPerContext?: number;
}

export interface ILanguageHandler {
  displayName: string;

  /** Scope used when clearing diagnostics after a fix is applied. */
  diagnosticClearScope: 'file' | 'directory';

  /** Short token used for the codeResourceInstance.type field (e.g. "terraform", "docker"). */
  codeResourceType: string;

  detectLanguage(args: DetectLanguageArgs): boolean;
  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo;

  /** How fix previews scope context around hunks; see {@link ResourceContextExtractKind}. */
  getResourceContextExtractKind(): ResourceContextExtractKind;
  buildPreviewResourceContexts(
    args: BuildPreviewResourceContextsArgs,
  ): PreviewResourceContext[];

  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null;
  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null;
  findScopedEditRange(args: FindScopedEditRangeArgs): ScopedEditRange | null;
  listBlocks(args: ListBlocksArgs): BlockRange[];
  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext;

  // --- Diff strategy ---
  groupRelatedLines(lines: string[]): string[][];
  isWeakAnchorLine(line: string): boolean;

  // --- Diagnostic placement ---
  buildDiagnosticRange(args: BuildDiagnosticRangeArgs): DiagnosticRangeResult;
  resolveDiagnosticAnchorLine(args: ResolveDiagnosticAnchorLineArgs): number;

  // --- Block context for converter ---
  describeBlock(args: DescribeBlockArgs): BlockDescription;

  /** Format block type + name for user-facing display in diagnostics. */
  formatBlockDisplayName(args: FormatBlockDisplayNameArgs): string;

  // --- Rule matching strategy ---
  matchRulesToDiff(args: MatchRulesToDiffArgs): string[];
}
