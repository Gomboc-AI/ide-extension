jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import * as vscode from 'vscode';
import { PathConverter } from '../pathConverter';

type WorkspaceFolderLike = { uri: { fsPath: string } };
type WorkspaceWithFolders = { workspaceFolders: WorkspaceFolderLike[] };

describe('PathConverter.convertOrlPathToActualPath', () => {
  const mockedWorkspace = vscode.workspace as unknown as WorkspaceWithFolders;

  afterEach(() => {
    mockedWorkspace.workspaceFolders = [];
  });

  it('converts workspace path using current file directory', () => {
    const result = PathConverter.convertOrlPathToActualPath(
      '/workspace/main.tf',
      '/home/user/project/vars.tf',
    );

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('uses only basename when ORL path has a subdirectory and current file path is provided', () => {
    const result = PathConverter.convertOrlPathToActualPath(
      '/workspace/subdir/main.tf',
      '/home/user/project/vars.tf',
    );

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('handles bare filename with current file path provided', () => {
    const result = PathConverter.convertOrlPathToActualPath(
      'main.tf',
      '/home/user/project/vars.tf',
    );

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('uses workspace root for /workspace path when current file path is not provided', () => {
    mockedWorkspace.workspaceFolders = [
      { uri: { fsPath: '/home/user/project' } },
    ];

    const result = PathConverter.convertOrlPathToActualPath('/workspace/main.tf');

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('uses basename for non-workspace absolute paths in fallback mode', () => {
    mockedWorkspace.workspaceFolders = [
      { uri: { fsPath: '/home/user/project' } },
    ];

    const result = PathConverter.convertOrlPathToActualPath(
      '/absolute/other/path/main.tf',
    );

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('uses bare filename with workspace root in fallback mode', () => {
    mockedWorkspace.workspaceFolders = [
      { uri: { fsPath: '/home/user/project' } },
    ];

    const result = PathConverter.convertOrlPathToActualPath('main.tf');

    expect(result).toBe('/home/user/project/main.tf');
  });

  it('returns original ORL path when workspace folders are empty', () => {
    mockedWorkspace.workspaceFolders = [];

    const result = PathConverter.convertOrlPathToActualPath('/workspace/main.tf');

    expect(result).toBe('/workspace/main.tf');
  });
});
