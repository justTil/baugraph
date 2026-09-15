/**
 * The wire between the VS Code extension and the editor running in its webview.
 *
 * Shared by both sides — the extension host imports the types straight from
 * here, so a message that changes shape cannot go on meaning two things.
 *
 * The split of responsibilities it encodes:
 *   - The **host** owns the file. It never parses a diagram; it moves text, and
 *     every change it makes goes through a `WorkspaceEdit` so that VS Code's
 *     undo, dirty marker and save all behave as they do for any other editor.
 *   - The **webview** owns the diagram. It is the only side that parses and
 *     writes the format, using the same `@/model` the web app uses, so the two
 *     can never disagree about what a `.baugraph.json` file looks like.
 */

/** How the colour theme is chosen: VS Code's own, or an explicit override. */
export type ThemePreference = 'system' | 'light' | 'dark'

/** Sent by the webview to the extension host. */
export type WebviewMessage =
  /** First thing the webview says; the host answers with `init`. */
  | { type: 'ready' }
  /** The diagram changed. `text` is the complete new file. */
  | { type: 'edit'; text: string }
  /** Write the document to disk (the editor's own save button / key). */
  | { type: 'save' }
  /** The toolbar's theme toggle, saved as a `baugraph.theme` setting. */
  | { type: 'setTheme'; preference: ThemePreference }
  /**
   * An export the webview produced. A webview cannot put a file on disk — it
   * cannot even start a download — so the bytes come out here and the host
   * offers a save dialog.
   */
  | { type: 'download'; fileName: string; mime: string; base64: string }
  /**
   * A file-level action that belongs to VS Code rather than to the canvas:
   * a new diagram, opening an existing one, or dropping to the raw JSON.
   */
  | { type: 'command'; command: 'new' | 'open' | 'openSource' }

/** Sent by the extension host to the webview. */
export type HostMessage =
  /** The document as it stands, once the webview reports itself ready. */
  | {
      type: 'init'
      text: string
      fileName: string
      /** False for a diff view or a file the workspace will not let us write. */
      editable: boolean
      dirty: boolean
      dark: boolean
    }
  /** The file changed underneath us — a text edit, an undo, a revert, git. */
  | { type: 'update'; text: string }
  /** Name or dirty state changed; the editor mirrors VS Code rather than guessing. */
  | { type: 'state'; fileName: string; dirty: boolean }
  /** The VS Code colour theme changed. */
  | { type: 'theme'; dark: boolean }
