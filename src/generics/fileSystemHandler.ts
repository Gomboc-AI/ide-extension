import * as fs from 'fs';
import * as path from 'path';
import {
  CopyFileArgs,
  IStorage,
  MkdtempArgs,
  MkdirArgs,
  ReadTextArgs,
  RemoveArgs,
  StorageEntry,
  StorageEntryType,
  WriteBytesArgs,
  WriteTextArgs,
} from './types';

function mapStatToEntryType(s: fs.Stats): StorageEntryType {
  if (s.isSymbolicLink()) {
    return 'symlink';
  }
  if (s.isDirectory()) {
    return 'directory';
  }
  if (s.isFile()) {
    return 'file';
  }
  return 'other';
}

/**
 * Local filesystem-backed {@link IStorage} using Node `fs.promises`.
 */
export class FileSystemHandler implements IStorage {
  /**
   * Heuristic: typical Windows and macOS default volumes are case-insensitive;
   * most Linux filesystems are case-sensitive.
   */
  isCaseSensitive: boolean = !['win32', 'darwin'].includes(process.platform);

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async stat(
    filePath: string,
  ): Promise<{ type: StorageEntryType; size?: number; mtimeMs?: number }> {
    const s = await fs.promises.lstat(filePath);
    return {
      type: mapStatToEntryType(s),
      size: typeof s.size === 'number' ? s.size : undefined,
      mtimeMs:
        typeof s.mtimeMs === 'number'
          ? s.mtimeMs
          : s.mtime instanceof Date
            ? s.mtime.getTime()
            : undefined,
    };
  }

  async readText(args: ReadTextArgs): Promise<string> {
    const encoding = args.opts?.encoding ?? 'utf8';
    return await fs.promises.readFile(args.path, { encoding });
  }

  async readBytes(filePath: string): Promise<Uint8Array> {
    const buf = await fs.promises.readFile(filePath);
    return new Uint8Array(buf);
  }

  async writeText(args: WriteTextArgs): Promise<void> {
    await fs.promises.mkdir(path.dirname(args.path), { recursive: true });
    await fs.promises.writeFile(args.path, args.content, {
      encoding: args.opts?.encoding ?? 'utf8',
      mode: args.opts?.mode,
    });
    if (typeof args.opts?.mode === 'number') {
      await fs.promises.chmod(args.path, args.opts.mode);
    }
  }

  async writeBytes(args: WriteBytesArgs): Promise<void> {
    await fs.promises.mkdir(path.dirname(args.path), { recursive: true });
    await fs.promises.writeFile(args.path, args.content, {
      mode: args.opts?.mode,
    });
    if (typeof args.opts?.mode === 'number') {
      await fs.promises.chmod(args.path, args.opts.mode);
    }
  }

  async mkdir(args: MkdirArgs): Promise<void> {
    await fs.promises.mkdir(args.path, {
      recursive: Boolean(args.opts?.recursive),
    });
  }

  /** Delegates to Node `fs.promises.mkdtemp` (unique directory under `prefix`). */
  async mkdtemp(args: MkdtempArgs): Promise<string> {
    return await fs.promises.mkdtemp(args.prefix);
  }

  async listDir(dirPath: string): Promise<StorageEntry[]> {
    const entries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });
    const out: StorageEntry[] = [];
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      let type: StorageEntryType;
      if (e.isSymbolicLink()) {
        type = 'symlink';
      } else if (e.isDirectory()) {
        type = 'directory';
      } else if (e.isFile()) {
        type = 'file';
      } else {
        type = 'other';
      }
      out.push({ name: e.name, path: full, type });
    }
    return out;
  }

  async copy(args: CopyFileArgs): Promise<void> {
    await fs.promises.mkdir(path.dirname(args.destPath), { recursive: true });
    await fs.promises.copyFile(args.srcPath, args.destPath);
  }

  async remove(args: RemoveArgs): Promise<void> {
    const recursive = Boolean(args.opts?.recursive);
    const force = args.opts?.force !== false;

    if (recursive) {
      await fs.promises.rm(args.path, { recursive: true, force });
      return;
    }

    try {
      const s = await fs.promises.lstat(args.path);
      if (s.isDirectory()) {
        await fs.promises.rmdir(args.path);
      } else {
        await fs.promises.unlink(args.path);
      }
    } catch (err) {
      if (!force) {
        throw err;
      }
    }
  }


}
