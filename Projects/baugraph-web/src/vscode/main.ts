/**
 * Entry point for the build that runs inside the VS Code extension's webview.
 *
 * The web app's entry (`src/main.ts`) mounts a workspace: a dock, a document
 * index, a sidebar of views. This one mounts a single diagram bound to a single
 * file, because that is what a VS Code editor is. Everything below that is the
 * same code.
 */
import '@/style.css'
import '@/vscode/vscode.css'

import { createApp } from 'vue'
import { setDownloadHandler } from '@/features/diagram/lib/export'
import { setFileHost } from '@/features/diagram/composables/useDocumentFile'
import { setThemeSource } from '@/composables/useAppTheme'
import VscodeEditor from '@/vscode/VscodeEditor.vue'
import { VSCODE_DOCUMENT_ID, dark, fileName, save, sendDownload, setThemePreference } from '@/vscode/bridge'

/**
 * The canvas, chrome and JSON view all read `useAppTheme()`; inside VS Code
 * that has to mean the editor's own colour theme rather than the browser
 * preference the web app defaults to (see `useAppTheme`'s `ThemeSource`).
 */
setThemeSource({
  dark,
  setDark: (value) => setThemePreference(value ? 'dark' : 'light'),
})

/**
 * Saving is VS Code's. The editor still calls `saveDocument` and it still means
 * "put this on disk" — it is just that the disk is reached by asking the
 * extension host to save the `TextDocument` this webview was opened for, rather
 * than through a file handle the page holds.
 *
 * `saveAs` is the same call: saving a copy elsewhere is `File > Save As`, which
 * VS Code does to the document without the editor's help.
 */
setFileHost({
  canOverwriteFiles: true,
  fileName: () => fileName.value,
  save: async (documentId) => accept(documentId),
  saveAs: async (documentId) => accept(documentId),
})

function accept(documentId: string): boolean {
  if (documentId !== VSCODE_DOCUMENT_ID) return false
  save()
  return true
}

/** A webview may not start a download, so exports go out through the host. */
setDownloadHandler(sendDownload)

createApp(VscodeEditor).mount('#app')
