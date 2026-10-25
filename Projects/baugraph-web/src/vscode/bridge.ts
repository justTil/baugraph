/**
 * The webview half of the VS Code bridge.
 *
 * One webview holds exactly one diagram — the file VS Code opened it for — so
 * there is no document index here, no autosave and no file picker. The document
 * lives in the `TextDocument` on the other side of `postMessage`, and this
 * module's whole job is keeping the two in step:
 *
 *   file → webview     `init` / `update`, parsed with the shared model
 *   webview → file     `edit`, debounced, written with the shared model
 *
 * Both directions carry the complete file. That is deliberate: `stringify` is
 * deterministic down to the byte (see `model/sort.ts`), so replacing the whole
 * text still produces a minimal diff, and neither side has to reason about
 * ranges it cannot see.
 *
 * State lives at module scope rather than inside the composable because there
 * is exactly one of each per webview — one file, one theme, one connection.
 */
import { nextTick, ref, watch } from 'vue'
import type { DiagramDocument } from '@/model'
import { DiagramParseError, blankDocument, safeParse, stringify } from '@/model'
import { diagramStore } from '@/features/diagram/composables/useDiagram'
import type { HostMessage, ThemePreference, WebviewMessage } from '@/vscode/protocol'

interface VsCodeApi {
  postMessage(message: WebviewMessage): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

/** May be called only once per webview, so it is called here and nowhere else. */
const vscode = acquireVsCodeApi()

export function post(message: WebviewMessage) {
  vscode.postMessage(message)
}

/** The one document this webview edits. */
export const VSCODE_DOCUMENT_ID = 'vscode'

/**
 * How long the editor waits before pushing a change into the `TextDocument`.
 * Long enough that dragging a node across the canvas is one edit rather than
 * sixty, short enough that a save a moment later already has it.
 */
const EDIT_DEBOUNCE_MS = 200

/** False until the file has arrived; the canvas waits for it. */
export const ready = ref(false)
/** False for a diff view, or a file the workspace will not let us write. */
export const editable = ref(true)
/**
 * Whether the editor is dark right now — VS Code's own colour theme, unless
 * the user has picked an explicit override (see `setThemePreference`).
 */
export const dark = ref(false)
/** The file this editor is open on, as VS Code names it. */
export const fileName = ref<string | null>(null)
/** Set when the file is not a diagram this build can read. */
export const parseError = ref<DiagramParseError | null>(null)

const store = diagramStore(VSCODE_DOCUMENT_ID)

/**
 * The file's text as far as this webview knows: what it last received, or last
 * sent. Both directions check against it, which is what stops one edit from
 * echoing back and forth forever.
 */
let current: string | null = null
/** True while a document from the host is being applied, so it is not sent back. */
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined
let connected = false

function load(document: DiagramDocument) {
  applying = true
  store.loadDocument(document)
  // `loadDocument` touches every source the watcher below is on; the flag has to
  // outlive that pass, which settles on the next tick.
  void nextTick(() => {
    applying = false
  })
}

function applyText(text: string) {
  current = text

  // An empty file is what "New diagram" leaves behind, and what an untitled
  // buffer starts as. Fill it in rather than opening an editor on nothing, and
  // write it straight back so the file says what the canvas shows.
  if (!text.trim()) {
    parseError.value = null
    load(blankDocument('Untitled diagram'))
    void nextTick(() => flush({ force: true }))
    return
  }

  const result = safeParse(text)
  if (!result.ok) {
    // Left on screen rather than thrown away: the file is still the user's, and
    // VS Code's text editor is one button away for fixing it.
    parseError.value = result.error
    return
  }
  parseError.value = null
  load(result.document)
}

/** Sends the diagram to the host, unless it is already what the file says. */
function flush({ force = false } = {}) {
  clearTimeout(timer)
  timer = undefined
  if (!editable.value) return
  const text = stringify(store.toDocument())
  if (!force && text === current) return
  current = text
  post({ type: 'edit', text })
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => flush(), EDIT_DEBOUNCE_MS)
}

/**
 * Saves the file.
 *
 * Flushed first, so a save pressed inside the debounce window writes the
 * diagram on screen rather than the one from a fifth of a second ago.
 */
export function save() {
  flush()
  post({ type: 'save' })
}

/**
 * Overrides the colour theme, or hands it back to VS Code's own — saved as
 * the `baugraph.theme` setting, so it's remembered next time this file opens.
 */
export function setThemePreference(preference: ThemePreference) {
  post({ type: 'setTheme', preference })
}

function onMessage(event: MessageEvent<HostMessage>) {
  const message = event.data
  switch (message.type) {
    case 'init':
      fileName.value = message.fileName
      editable.value = message.editable
      dark.value = message.dark
      applyText(message.text)
      store.dirty.value = message.dirty
      ready.value = true
      break
    case 'update':
      // Our own edit, coming back around. Re-applying it would cost the
      // selection and the undo stack for no change at all.
      if (message.text === current) return
      applyText(message.text)
      break
    case 'state':
      fileName.value = message.fileName
      // Mirrored rather than tracked separately: VS Code owns this file now, so
      // the editor's own "unsaved changes" marker has to mean VS Code's.
      store.dirty.value = message.dirty
      break
    case 'theme':
      dark.value = message.dark
      break
  }
}

/**
 * Connects the editor to the file. Safe to call more than once; only the first
 * call wires anything up.
 */
export function useVscodeDocument() {
  if (connected) return { store, ready, editable, dark, fileName, parseError, save, flush }
  connected = true

  /**
   * Gated on `dirty` rather than on the sources themselves: Vue Flow writes
   * measurements back into the nodes as it lays the canvas out, and a diagram
   * that has only been *rendered* must not mark the file as changed. `dirty` is
   * raised by `commit`, the checkpoint every real edit already takes.
   */
  watch(
    [store.dirty, store.nodes, store.edges, store.flows, store.meta, store.canvas],
    () => {
      if (applying || !store.dirty.value) return
      schedule()
    },
    { deep: true },
  )

  window.addEventListener('message', onMessage)
  post({ type: 'ready' })

  return { store, ready, editable, dark, fileName, parseError, save, flush }
}

/**
 * Hands an exported file to VS Code, which has a save dialog and a disk. The
 * web app's download path does not exist inside a webview.
 */
export function sendDownload(name: string, blob: Blob) {
  void blob.arrayBuffer().then((buffer) => {
    post({ type: 'download', fileName: name, mime: blob.type, base64: base64Of(buffer) })
  })
}

/** Chunked, because a GIF export runs to megabytes and `apply` has a limit. */
function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
