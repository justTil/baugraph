/**
 * Just enough of the `vscode` module to load the extension host outside VS Code.
 *
 * The real module only exists inside the editor's process, so a test that wants
 * to know what `activate` registers — or what the formatter does to a file — has
 * to stand in for it. Aliased in `vitest.config.ts`.
 *
 * Everything here is a recorder: it remembers what the extension asked for and
 * returns the smallest thing that keeps it running.
 */

export interface Registration {
  kind: 'customEditor' | 'formatter' | 'command'
  id: string
  value: unknown
  options?: unknown
}

/** What the extension registered during the last `activate`. */
export const registrations: Registration[] = []

/** Messages the extension raised, so a test can assert it complained. */
export const messages: { level: string; message: string }[] = []

export function reset() {
  registrations.length = 0
  messages.length = 0
}

const disposable = { dispose() {} }

export class Disposable {
  dispose() {}
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position
  readonly end: Position
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter)
    this.end = new Position(endLine, endCharacter)
  }
}

export class TextEdit {
  constructor(
    readonly range: Range,
    readonly newText: string,
  ) {}

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText)
  }
}

export class WorkspaceEdit {
  readonly edits: { uri: unknown; range: Range; text: string }[] = []
  replace(uri: unknown, range: Range, text: string) {
    this.edits.push({ uri, range, text })
  }
}

export class TabInputCustom {
  constructor(
    readonly uri: unknown,
    readonly viewType: string,
  ) {}
}

export class TabInputText {
  constructor(readonly uri: unknown) {}
}

export const ColorThemeKind = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 } as const

export const Uri = {
  file: (path: string) => ({ scheme: 'file', path, toString: () => `file://${path}` }),
  joinPath: (base: { path: string }, ...parts: string[]) => Uri.file([base.path, ...parts].join('/')),
}

export const window = {
  activeTextEditor: undefined as unknown,
  activeColorTheme: { kind: ColorThemeKind.Dark },
  tabGroups: { activeTabGroup: { activeTab: undefined as unknown } },
  registerCustomEditorProvider(id: string, value: unknown, options?: unknown) {
    registrations.push({ kind: 'customEditor', id, value, options })
    return disposable
  },
  showErrorMessage(message: string) {
    messages.push({ level: 'error', message })
    return Promise.resolve(undefined)
  },
  showWarningMessage(message: string) {
    messages.push({ level: 'warning', message })
    return Promise.resolve(undefined)
  },
  showInformationMessage(message: string) {
    messages.push({ level: 'info', message })
    return Promise.resolve(undefined)
  },
  showInputBox: () => Promise.resolve(undefined),
  showSaveDialog: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  onDidChangeActiveColorTheme: () => disposable,
}

export const languages = {
  registerDocumentFormattingEditProvider(selector: unknown, value: unknown) {
    registrations.push({ kind: 'formatter', id: 'formatter', value, options: selector })
    return disposable
  },
}

export const commands = {
  registerCommand(id: string, value: unknown) {
    registrations.push({ kind: 'command', id, value })
    return disposable
  },
  executeCommand: () => Promise.resolve(undefined),
}

export const workspace = {
  workspaceFolders: undefined as unknown,
  textDocuments: [] as unknown[],
  fs: {
    readFile: () => Promise.reject(new Error('not stubbed')),
    writeFile: () => Promise.resolve(),
    isWritableFileSystem: () => true,
  },
  applyEdit: () => Promise.resolve(true),
  onDidChangeTextDocument: () => disposable,
  onDidSaveTextDocument: () => disposable,
}
