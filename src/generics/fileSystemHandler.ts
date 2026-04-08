import {
  CopyFileArgs,
  IStorage,
  MkdirArgs,
  ReadTextArgs,
  RemoveArgs,
  StorageEntry,
  StorageEntryType,
  WriteBytesArgs,
  WriteTextArgs,
} from './types';

export class FileSystemHandler implements IStorage {
  storageType: string = 'node-fs';
  isCaseSensitive: boolean = true;

  async exists(path: string): Promise<boolean> {
    void path;
    throw new Error('FileSystemHandler.exists not implemented');
  }

  async stat(
    path: string,
  ): Promise<{ type: StorageEntryType; size?: number; mtimeMs?: number }> {
    void path;
    throw new Error('FileSystemHandler.stat not implemented');
  }

  async readText(args: ReadTextArgs): Promise<string> {
    void args;
    throw new Error('FileSystemHandler.readText not implemented');
  }

  async readBytes(path: string): Promise<Uint8Array> {
    void path;
    throw new Error('FileSystemHandler.readBytes not implemented');
  }

  async writeText(args: WriteTextArgs): Promise<void> {
    void args;
    throw new Error('FileSystemHandler.writeText not implemented');
  }

  async writeBytes(args: WriteBytesArgs): Promise<void> {
    void args;
    throw new Error('FileSystemHandler.writeBytes not implemented');
  }

  async mkdir(args: MkdirArgs): Promise<void> {
    void args;
    throw new Error('FileSystemHandler.mkdir not implemented');
  }

  async listDir(path: string): Promise<StorageEntry[]> {
    void path;
    throw new Error('FileSystemHandler.listDir not implemented');
  }

  async copy(args: CopyFileArgs): Promise<void> {
    void args;
    throw new Error('FileSystemHandler.copy not implemented');
  }

  async chmod(path: string, mode: number): Promise<void> {
    void path;
    void mode;
    throw new Error('FileSystemHandler.chmod not implemented');
  }

  async remove(args: RemoveArgs): Promise<void> {
    void args;
    throw new Error('FileSystemHandler.remove not implemented');
  }

  async mkdtemp(prefix: string): Promise<string> {
    void prefix;
    throw new Error('FileSystemHandler.mkdtemp not implemented');
  }
}
