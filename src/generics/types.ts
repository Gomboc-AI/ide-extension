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

/**
 * This represents the implementation of a language and it's associated behavior and
 * properties.
 */
export interface ILanguageHandler {
  displayName: string;
  detectLanguage(args: DetectLanguageArgs): boolean;
  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo;
  findBlockAtLine(args: FindBlockAtLineArgs): BlockRange | null;
  findNearestBlock(args: FindNearestBlockArgs): BlockRange | null;
  findScopedEditRange(args: FindScopedEditRangeArgs): ScopedEditRange | null;
  listBlocks(args: ListBlocksArgs): BlockRange[];
  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext;
}
