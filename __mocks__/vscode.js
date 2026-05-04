const path = require('path');

class Disposable {
  constructor(fn) {
    this._fn = typeof fn === 'function' ? fn : () => {};
  }

  dispose() {
    this._fn();
  }
}

class EventEmitter {
  constructor() {
    this._listeners = new Set();
    this.event = listener => {
      this._listeners.add(listener);
      return new Disposable(() => this._listeners.delete(listener));
    };
  }

  fire(value) {
    for (const listener of this._listeners) {
      listener(value);
    }
  }

  dispose() {
    this._listeners.clear();
  }
}

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }

  isEqual(other) {
    return (
      !!other &&
      this.start.line === other.start.line &&
      this.start.character === other.start.character &&
      this.end.line === other.end.line &&
      this.end.character === other.end.character
    );
  }
}

class Selection extends Range {
  constructor(start, end) {
    super(start, end);
  }
}

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }

  static file(filePath) {
    return new Uri(path.resolve(filePath));
  }
}

class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
    this.diagnostics = [];
  }
}

class WorkspaceEdit {
  constructor() {
    this.edits = [];
  }

  replace(uri, range, newText) {
    this.edits.push({ type: 'replace', uri, range, newText });
  }

  insert(uri, position, newText) {
    this.edits.push({ type: 'insert', uri, position, newText });
  }
}

const createMockFn = () =>
  typeof jest !== 'undefined' ? jest.fn() : () => undefined;

module.exports = {
  Disposable,
  EventEmitter,
  Position,
  Range,
  Selection,
  Uri,
  Diagnostic,
  CodeAction,
  WorkspaceEdit,
  CodeActionKind: {
    QuickFix: 'quickfix',
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
  TextEditorRevealType: {
    InCenter: 0,
  },
  ViewColumn: {
    One: 1,
  },
  FileType: {
    File: 1,
    Directory: 2,
  },
  CancellationToken: {
    None: {},
  },
  languages: {
    getDiagnostics: createMockFn(),
    registerCodeActionsProvider: createMockFn(),
  },
  commands: {
    registerCommand: createMockFn(),
    executeCommand: createMockFn(),
  },
  extensions: {
    getExtension: createMockFn(),
  },
  env: {
    clipboard: {
      writeText: createMockFn(),
    },
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: createMockFn(),
    openTextDocument: createMockFn(),
    applyEdit: createMockFn(),
  },
  window: {
    showTextDocument: createMockFn(),
    showInformationMessage: createMockFn(),
    showErrorMessage: createMockFn(),
    createWebviewPanel: createMockFn(),
  },
};
