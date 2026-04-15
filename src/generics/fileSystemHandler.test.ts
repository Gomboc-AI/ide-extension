/**
 * @jest-environment node
 *
 * Uses real `fs` against the OS temp directory so behavior is validated on
 * Windows, macOS, and Linux CI.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSystemHandler } from './fileSystemHandler';

function uniqueRoot(): string {
  return path.join(
    os.tmpdir(),
    `fsh-test-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
  );
}

describe('FileSystemHandler', () => {
  let root: string;
  let handler: FileSystemHandler;

  beforeEach(() => {
    handler = new FileSystemHandler();
    root = uniqueRoot();
    fs.mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  it('exposes isCaseSensitive as a boolean', () => {
    expect(typeof handler.isCaseSensitive).toBe('boolean');
  });

  it('exists returns false for missing paths and true after write', async () => {
    const file = path.join(root, 'nested', 'a.txt');
    expect(await handler.exists(file)).toBe(false);
    await handler.writeText({ path: file, content: 'hello' });
    expect(await handler.exists(file)).toBe(true);
  });

  it('writeText and readText round-trip utf8 content', async () => {
    const file = path.join(root, 'utf8.txt');
    const content = 'line1\nunicode: \u2603\n';
    await handler.writeText({ path: file, content });
    expect(await handler.readText({ path: file })).toBe(content);
  });

  it('stat reports file type and size for a regular file', async () => {
    const file = path.join(root, 'st.txt');
    const content = 'abc';
    await handler.writeText({ path: file, content });
    const st = await handler.stat(file);
    expect(st.type).toBe('file');
    expect(st.size).toBe(Buffer.byteLength(content, 'utf8'));
    expect(typeof st.mtimeMs).toBe('number');
    expect(Number.isFinite(st.mtimeMs)).toBe(true);
  });

  it('writeBytes and readBytes round-trip binary content', async () => {
    const file = path.join(root, 'bin.dat');
    const bytes = new Uint8Array([0, 255, 1, 128]);
    await handler.writeBytes({ path: file, content: bytes });
    const out = await handler.readBytes(file);
    expect([...out]).toEqual([...bytes]);
  });

  it('mkdir creates nested directories when recursive', async () => {
    const dir = path.join(root, 'a', 'b', 'c');
    await handler.mkdir({ path: dir, opts: { recursive: true } });
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('mkdtemp creates a unique directory whose path starts with the prefix', async () => {
    const prefix = path.join(root, 'mkdtemp-');
    const created = await handler.mkdtemp({ prefix });
    expect(created.startsWith(prefix)).toBe(true);
    expect(fs.statSync(created).isDirectory()).toBe(true);
  });

  it('listDir returns files and subdirectories with correct types', async () => {
    await handler.writeText({ path: path.join(root, 'f.txt'), content: 'x' });
    await handler.mkdir({
      path: path.join(root, 'sub'),
      opts: { recursive: true },
    });
    const entries = await handler.listDir(root);
    const names = new Set(entries.map(e => e.name));
    expect(names.has('f.txt')).toBe(true);
    expect(names.has('sub')).toBe(true);
    const f = entries.find(e => e.name === 'f.txt');
    const d = entries.find(e => e.name === 'sub');
    expect(f?.type).toBe('file');
    expect(d?.type).toBe('directory');
    expect(f?.path).toBe(path.join(root, 'f.txt'));
  });

  it('copy duplicates file content to a new path', async () => {
    const src = path.join(root, 'src.txt');
    const dest = path.join(root, 'out', 'dest.txt');
    await handler.writeText({ path: src, content: 'copied' });
    await handler.copy({ srcPath: src, destPath: dest });
    expect(await handler.readText({ path: dest })).toBe('copied');
  });

  it('remove deletes a file', async () => {
    const file = path.join(root, 'gone.txt');
    await handler.writeText({ path: file, content: 'x' });
    await handler.remove({ path: file });
    expect(await handler.exists(file)).toBe(false);
  });

  it('remove recursively deletes a directory tree', async () => {
    const dir = path.join(root, 'tree');
    await handler.writeText({ path: path.join(dir, 'x.txt'), content: 'y' });
    await handler.remove({ path: dir, opts: { recursive: true } });
    expect(await handler.exists(dir)).toBe(false);
  });

  it('remove with force does not throw when the path is missing', async () => {
    await expect(
      handler.remove({
        path: path.join(root, 'definitely-missing.bin'),
        opts: { force: true },
      }),
    ).resolves.toBeUndefined();
  });

  it('applies chmod after write when mode is set (POSIX)', async () => {
    if (process.platform === 'win32') {
      const file = path.join(root, 'mode-win.txt');
      await handler.writeText({
        path: file,
        content: 'x',
        opts: { mode: 0o644 },
      });
      expect(await handler.exists(file)).toBe(true);
      return;
    }

    const file = path.join(root, 'mode.sh');
    await handler.writeText({
      path: file,
      content: '#!/bin/sh\necho hi\n',
      opts: { mode: 0o755 },
    });
    const st = await fs.promises.stat(file);
    expect(st.mode & 0o777).toBe(0o755);
  });
});
