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

export interface CacheGetArgs {
  key: string;
}

export interface CacheSetArgs<V = unknown> {
  key: string;
  value: V;
}

export interface CacheDeleteArgs {
  key: string;
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
  /** Not all backends support hierarchical folders (e.g. flat object stores). */
  mkdir?(args: MkdirArgs): Promise<void>;
  /** Not all backends support listing children (e.g. write-only sinks). */
  listDir?(path: string): Promise<StorageEntry[]>;
  copy(args: CopyFileArgs): Promise<void>;
  remove(args: RemoveArgs): Promise<void>;
}

/**
 * Key/value cache abstraction (in-memory, disk-backed, etc.).
 * @typeParam V - value type stored under each key
 */
export interface ICache<V = unknown> {
  get(args: CacheGetArgs): Promise<V | undefined>;
  has(args: CacheGetArgs): Promise<boolean>;
  set(args: CacheSetArgs<V>): Promise<void>;
  del(args: CacheDeleteArgs): Promise<void>;
  clr(): Promise<void>;
  count(): Promise<number>;
}

export interface GetDocumentInfoArgs {
  filePath: string;
  content: string;
}
export interface FindResourceAtLineArgs {
  filePath: string;
  content: string;
  line: number;
}
export interface FindNearestResourceArgs {
  filePath: string;
  content: string;
  line: number;
}
export interface ListResourcesArgs {
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
}

export interface DocumentInfo {
  languageId: string;
  filePath: string;
  fileName: string;
  extension: string;
  isConfigLike?: boolean;
  supportsResources?: boolean;
}

export interface ResourceRange {
  type: string; // e.g. "aws_instance", "Deployment", "docker_stage"
  name?: string; // e.g. "web", "my-app"
  startLine: number; // 1-based
  endLine: number; // 1-based
  header: string; // display label for diagnostics/code actions
}

export interface DiagnosticContext {
  languageId: string;
  filePath: string;
  resource?: ResourceRange;
  nearestResource?: ResourceRange;
  tags?: string[]; // optional hints for rule matching
}

/**
 * This represents the implementation of a language and it's associated behavior and
 * properties.
 */
export interface ILanguageHandler {
  displayName: string;
  extensions: string[];
  getDocumentInfo(args: GetDocumentInfoArgs): DocumentInfo;
  findResourceAtLine(args: FindResourceAtLineArgs): ResourceRange | null;
  findNearestResource(args: FindNearestResourceArgs): ResourceRange | null;
  listResources(args: ListResourcesArgs): ResourceRange[];
  buildDiagnosticContext(args: BuildDiagnosticContextArgs): DiagnosticContext;
}
