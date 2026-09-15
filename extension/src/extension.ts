import * as vscode from 'vscode'
import { blankDocument, parse, slugify, stringify } from '@/model'
import type { HostMessage, ThemePreference, WebviewMessage } from '@/vscode/protocol'

/**
 * Baugraph for VS Code.
 *
 * A `.baugraph.json` file opens on the diagram it describes instead of on its
 * JSON. The editor itself is the web app, built for a webview
 * (`vite.vscode.config.ts`); this side owns the *file* and nothing else:
 *
 *   - it never parses a diagram to edit one — it moves text;
 *   - every change it makes goes through a `WorkspaceEdit`, so undo, the dirty
 *     marker, save, revert, hot exit and the diff view all work exactly as they
 *     do for a text editor, because underneath it *is* a text editor;
 *   - the format is written by `@/model`, the same module the web app uses, so
 *     a file written here and a file written there are byte-identical.
 *
 * It does read the format in one place: the formatter below, which is how the
 * canonical ordering reaches a file nobody has opened on a canvas.
 */

const VIEW_TYPE = 'baugraph.editor'
/** What a diagram file is called. Kept in step with `contributes.customEditors`. */
const FILE_SUFFIX = '.baugraph.json'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new BaugraphEditorProvider(context),
      {
        // The canvas holds a viewport, a selection and an undo stack. Rebuilding
        // it every time the tab loses focus would throw all three away.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      [
        { language: 'json', pattern: `**/*${FILE_SUFFIX}` },
        { language: 'jsonc', pattern: `**/*${FILE_SUFFIX}` },
      ],
      new DiagramFormatter(),
    ),
    ...commands(),
  )
}

export function deactivate() {}

/* ------------------------------------------------------------------ editor */

class BaugraphEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const { webview } = panel
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')

    webview.options = { enableScripts: true, localResourceRoots: [media] }
    webview.html = await page(webview, media)

    /**
     * The text this webview last sent. A change that matches it is our own edit
     * arriving back from the document, and re-sending it would cost the canvas
     * its selection for no change at all.
     */
    let pushed: string | null = null

    /**
     * Edits are applied one at a time. Two `applyEdit` calls in flight together
     * race over the same range, and the loser silently does nothing.
     */
    let queue: Promise<void> = Promise.resolve()

    const post = (message: HostMessage) => {
      void webview.postMessage(message)
    }
    const state = (): HostMessage => ({
      type: 'state',
      fileName: name(document.uri),
      dirty: document.isDirty,
    })

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return
        post(state())
        if (!event.contentChanges.length) return
        const text = document.getText()
        if (text === pushed) return
        post({ type: 'update', text })
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved.uri.toString() === document.uri.toString()) post(state())
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        // Irrelevant to a webview that has picked its own light/dark rather
        // than following VS Code's — nothing changed for it.
        if (themePreference() === 'system') post({ type: 'theme', dark: resolveDark() })
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('baugraph.theme')) post({ type: 'theme', dark: resolveDark() })
      }),
      webview.onDidReceiveMessage((message: WebviewMessage) => {
        queue = queue
          .then(() => this.handle(message, document, post, (text) => (pushed = text)))
          .catch((error: unknown) => {
            void vscode.window.showErrorMessage(`Baugraph: ${describe(error)}`)
          })
      }),
    ]

    panel.onDidDispose(() => subscriptions.forEach((subscription) => subscription.dispose()))
  }

  private async handle(
    message: WebviewMessage,
    document: vscode.TextDocument,
    post: (message: HostMessage) => void,
    remember: (text: string) => void,
  ): Promise<void> {
    switch (message.type) {
      case 'ready':
        post({
          type: 'init',
          text: document.getText(),
          fileName: name(document.uri),
          editable: isWritable(document),
          dirty: document.isDirty,
          dark: resolveDark(),
        })
        return

      case 'setTheme':
        await vscode.workspace
          .getConfiguration('baugraph')
          .update('theme', message.preference, vscode.ConfigurationTarget.Global)
        return

      case 'edit':
        if (!isWritable(document)) return
        remember(message.text)
        await replaceAll(document, message.text)
        return

      case 'save':
        await document.save()
        return

      case 'download':
        await exportFile(document.uri, message.fileName, message.base64)
        return

      case 'command':
        await runCommand(message.command, document.uri)
        return
    }
  }
}

/**
 * Writes `text` over the whole document.
 *
 * Whole-file replacement rather than a computed patch: the writer is
 * deterministic, so the text differs only where the diagram does, and VS Code
 * reduces the replacement to that difference itself — for the editor it paints,
 * for the undo entry it records, and for the diff the SCM view shows.
 */
async function replaceAll(document: vscode.TextDocument, text: string): Promise<void> {
  if (document.getText() === text) return
  const edit = new vscode.WorkspaceEdit()
  edit.replace(document.uri, everything(document), text)
  await vscode.workspace.applyEdit(edit)
}

const everything = (document: vscode.TextDocument) =>
  new vscode.Range(0, 0, document.lineCount, 0)

/* --------------------------------------------------------------- webview */

/**
 * The page the webview loads.
 *
 * Built from Vite's manifest rather than from hard-coded file names: the bundle
 * is content-hashed, and an extension that guesses at a stale name shows a blank
 * panel with nothing in the console to say why.
 */
async function page(webview: vscode.Webview, media: vscode.Uri): Promise<string> {
  let entry: { file: string; css?: string[] }
  try {
    const raw = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(media, '.vite', 'manifest.json'),
    )
    const manifest = JSON.parse(new TextDecoder().decode(raw)) as Record<
      string,
      { file: string; css?: string[]; isEntry?: boolean }
    >
    const found = Object.values(manifest).find((chunk) => chunk.isEntry)
    if (!found) throw new Error('no entry chunk in the webview manifest')
    entry = found
  } catch (error) {
    return missingBuild(describe(error))
  }

  const nonce = randomNonce()
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, entry.file))
  const styles = (entry.css ?? [])
    .map((file) => webview.asWebviewUri(vscode.Uri.joinPath(media, file)))
    .map((uri) => `<link rel="stylesheet" href="${uri.toString()}">`)
    .join('\n    ')

  /*
   * Everything is denied and then allowed back one source at a time.
   *   - `script-src` names the resource origin as well as the nonce: the entry
   *     script carries the nonce, but the chunks it imports cannot, and a module
   *     import is checked against the source list rather than against its
   *     importer.
   *   - `worker-src blob:` is Monaco's, which the webview build inlines and
   *     starts from a blob (see `src/vscode/monaco-env.ts`).
   *   - The font sources are the app's typeface. Without a network it falls back
   *     to the system sans and nothing else changes.
   */
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `font-src ${webview.cspSource} https://fonts.gstatic.com data:`,
    `style-src ${webview.cspSource} https://fonts.googleapis.com 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    `worker-src blob:`,
    `connect-src ${webview.cspSource} https://fonts.googleapis.com https://fonts.gstatic.com`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baugraph</title>
    ${styles}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${script.toString()}"></script>
  </body>
</html>`
}

/** Shown when the extension is running without its webview bundle beside it. */
function missingBuild(reason: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Baugraph</title></head>
  <body style="font-family: sans-serif; padding: 2rem; line-height: 1.5">
    <h1 style="font-size: 1rem">The editor has not been built</h1>
    <p><code>media/</code> is produced by <code>npm run extension:webview</code> in the
    repository root, and is packaged into the .vsix from there.</p>
    <p style="opacity: .7"><code>${escapeHtml(reason)}</code></p>
  </body>
</html>`
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  for (let i = 0; i < 32; i++) nonce += alphabet[Math.floor(Math.random() * alphabet.length)]
  return nonce
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* -------------------------------------------------------------- formatter */

/**
 * Formatting a diagram file rewrites it in canonical form: sorted, defaults
 * dropped, keys in the format's own order.
 *
 * This is the same writer the canvas saves through, which is the point — a file
 * edited as text and a file edited as a diagram come out spelled the same way,
 * so the two never trade whitespace-only diffs back and forth. With
 * `editor.formatOnSave` on, a hand-edited diagram canonicalises itself.
 */
class DiagramFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
    const text = document.getText()
    let canonical: string
    try {
      canonical = stringify(parse(text))
    } catch (error) {
      // A file that does not parse is left alone rather than half-rewritten;
      // the JSON language service is already complaining about it in the gutter.
      void vscode.window.showWarningMessage(`Baugraph: ${describe(error)}`)
      return []
    }
    if (canonical === text) return []
    return [vscode.TextEdit.replace(everything(document), canonical)]
  }
}

/* --------------------------------------------------------------- commands */

function commands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('baugraph.openDiagram', async (uri?: vscode.Uri) => {
      const target = uri ?? activeUri()
      if (!target) return
      await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE)
    }),

    vscode.commands.registerCommand('baugraph.openSource', async (uri?: vscode.Uri) => {
      const target = uri ?? activeUri()
      if (!target) return
      await vscode.commands.executeCommand('vscode.openWith', target, 'default')
    }),

    vscode.commands.registerCommand('baugraph.newDiagram', () => newDiagram()),

    vscode.commands.registerCommand('baugraph.normalize', async (uri?: vscode.Uri) => {
      const target = uri ?? activeUri()
      if (!target) return
      await normalize(target)
    }),

    vscode.commands.registerCommand('baugraph.setTheme', () => setThemeCommand()),
  ]
}

/** The toolbar's toggle only ever picks light or dark; this is the way back to "system". */
async function setThemeCommand(): Promise<void> {
  const current = themePreference()
  const pick = await vscode.window.showQuickPick(
    (
      [
        { preference: 'system', label: "Follow VS Code's colour theme" },
        { preference: 'light', label: 'Light' },
        { preference: 'dark', label: 'Dark' },
      ] satisfies { preference: ThemePreference; label: string }[]
    ).map(({ preference, label }) => ({
      label,
      description: preference === current ? 'Current' : undefined,
      preference,
    })),
    { title: 'Baugraph: Diagram Theme' },
  )
  if (!pick) return
  await vscode.workspace
    .getConfiguration('baugraph')
    .update('theme', pick.preference, vscode.ConfigurationTarget.Global)
}

/** Creates a diagram file, then opens it on the canvas. */
async function newDiagram(): Promise<void> {
  const title = await vscode.window.showInputBox({
    prompt: 'Title of the new diagram',
    value: 'Untitled diagram',
    validateInput: (value) => (value.trim() ? null : 'The diagram needs a title'),
  })
  if (title === undefined) return

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri
  const target = await vscode.window.showSaveDialog({
    title: 'New Baugraph diagram',
    saveLabel: 'Create',
    filters: { 'Baugraph diagram': ['json'] },
    defaultUri: folder
      ? vscode.Uri.joinPath(folder, `${slugify(title, 'diagram')}${FILE_SUFFIX}`)
      : undefined,
  })
  if (!target) return

  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(stringify(blankDocument(title.trim())), 'utf-8'),
  )
  await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE)
}

/**
 * Rewrites a diagram file in canonical form without opening it on a canvas.
 *
 * The same thing formatting does, reachable for a file that is not in an editor
 * at all — a whole folder of diagrams written by an older build, or by hand.
 */
async function normalize(uri: vscode.Uri): Promise<void> {
  const open = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  )
  const text = open
    ? open.getText()
    : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))

  let canonical: string
  try {
    canonical = stringify(parse(text))
  } catch (error) {
    void vscode.window.showErrorMessage(`Baugraph: ${describe(error)}`)
    return
  }

  if (canonical === text) {
    void vscode.window.showInformationMessage(`${name(uri)} is already in canonical form.`)
    return
  }

  // Through the document when one is open, so the rewrite is undoable and the
  // user decides when it reaches the disk.
  if (open) await replaceAll(open, canonical)
  else await vscode.workspace.fs.writeFile(uri, Buffer.from(canonical, 'utf-8'))

  void vscode.window.showInformationMessage(`Rewrote ${name(uri)} in canonical form.`)
}

/** The file-level actions the editor's own toolbar asks for. */
async function runCommand(command: 'new' | 'open' | 'openSource', uri: vscode.Uri): Promise<void> {
  switch (command) {
    case 'new':
      await newDiagram()
      return
    case 'openSource':
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default')
      return
    case 'open': {
      const picked = await vscode.window.showOpenDialog({
        title: 'Open a Baugraph diagram',
        canSelectMany: false,
        filters: { 'Baugraph diagram': ['json'] },
        defaultUri: vscode.Uri.joinPath(uri, '..'),
      })
      const target = picked?.[0]
      if (target) await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE)
    }
  }
}

/** Puts an export (PNG, SVG, GIF, a copy of the JSON) somewhere the user picks. */
async function exportFile(source: vscode.Uri, fileName: string, base64: string): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    title: 'Export diagram',
    saveLabel: 'Export',
    defaultUri: vscode.Uri.joinPath(source, '..', fileName),
  })
  if (!target) return
  await vscode.workspace.fs.writeFile(target, Buffer.from(base64, 'base64'))

  const open = 'Open'
  const answer = await vscode.window.showInformationMessage(`Exported ${name(target)}`, open)
  if (answer === open) await vscode.commands.executeCommand('vscode.open', target)
}

/* ----------------------------------------------------------------- shared */

/**
 * The file the user is looking at, whichever kind of editor is showing it: a
 * text editor, or one of our own canvases — which is not a text editor at all,
 * so `activeTextEditor` is undefined while one is focused.
 */
function activeUri(): vscode.Uri | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (tab instanceof vscode.TabInputCustom || tab instanceof vscode.TabInputText) return tab.uri
  return vscode.window.activeTextEditor?.document.uri
}

const name = (uri: vscode.Uri) => uri.path.split('/').pop() ?? uri.toString()

const isDark = (theme: vscode.ColorTheme) =>
  theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast

/**
 * The `baugraph.theme` setting: VS Code's own colour theme by default, or an
 * explicit override the user picked from the toolbar / `Baugraph: Set Theme`.
 * A plain setting rather than `globalState`, so it shows up in Settings UI,
 * settings.json and syncs the way every other VS Code preference does.
 */
const themePreference = (): ThemePreference =>
  vscode.workspace.getConfiguration('baugraph').get<ThemePreference>('theme', 'system')

const resolveDark = (): boolean => {
  const preference = themePreference()
  if (preference === 'system') return isDark(vscode.window.activeColorTheme)
  return preference === 'dark'
}

/** False for a diff's left-hand side, or a file system opened read-only. */
const isWritable = (document: vscode.TextDocument) =>
  !document.isClosed && vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) !== false

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
