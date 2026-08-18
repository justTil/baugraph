import { computed, ref, shallowReactive } from 'vue'
import { diagramStore } from '@/features/diagram/composables/useDiagram'
import {
  canOverwriteFiles,
  exportJson,
  slug,
  writeJson,
  writeJsonAs,
} from '@/features/diagram/lib/export'
import type { FileLink } from '@/features/diagram/lib/file-handles'
import {
  forgetFileLink,
  recallFileLink,
  rememberFileLink,
} from '@/features/diagram/lib/file-handles'

/**
 * The file on disk each open diagram is saving to.
 *
 * Without a link, every save is a fresh download and the browser numbers them
 * — `diagram.json`, `diagram (1).json`, `diagram (2).json`. With one, saving
 * writes back over the same file, which is what "save" is supposed to mean.
 *
 * `shallowReactive`: handles are opaque platform objects and must not be
 * proxied, but the map itself has to be reactive for the toolbar to follow it.
 */
const links = shallowReactive(new Map<string, FileLink>())

/**
 * Files whose name the user has said to leave alone. Keyed by document, valued
 * by the file it applies to, so the question is asked once per file rather than
 * once per rename.
 */
const pinnedNames = new Map<string, string>()

export function linkedFile(documentId: string): FileSystemFileHandle | undefined {
  return links.get(documentId)?.handle
}

/** Binds a document to the file it was opened from. */
export function linkDocumentFile(
  documentId: string,
  handle: FileSystemFileHandle,
  titleSlug: string,
) {
  setLink(documentId, { handle, slug: titleSlug })
}

function setLink(documentId: string, link: FileLink) {
  links.set(documentId, link)
  rememberFileLink(documentId, link)
}

export function unlinkDocumentFile(documentId: string) {
  links.delete(documentId)
  pinnedNames.delete(documentId)
  forgetFileLink(documentId)
}

/** Restores the link a previous session left behind. */
export async function hydrateDocumentFile(documentId: string) {
  if (links.has(documentId)) return
  const link = await recallFileLink(documentId)
  if (link) links.set(documentId, link)
}

/* -------------------------------------------------------------- renaming */

/**
 * The question raised when a renamed diagram is saved to a file the browser
 * will not rename in place. One at a time; the editor panel holding the
 * document renders the dialog.
 */
export interface RenamePrompt {
  documentId: string
  /** What the file is called now. */
  currentName: string
  /** What the diagram's new title asks for. */
  suggestedName: string
}

const pendingRename = ref<RenamePrompt | null>(null)
let answerRename: ((saved: boolean) => void) | null = null

export function useRenamePrompt() {
  return { pendingRename }
}

function ask(prompt: RenamePrompt): Promise<boolean> {
  return new Promise((resolve) => {
    pendingRename.value = prompt
    answerRename = resolve
  })
}

function finish(saved: boolean) {
  pendingRename.value = null
  answerRename?.(saved)
  answerRename = null
}

/**
 * Renames the file to match the diagram's new title.
 *
 * `move` is Chromium-only and is not granted for every handle it hands out, so
 * a rejection here is expected rather than exceptional — it just means this
 * file can only be replaced, not renamed.
 */
async function renameInPlace(handle: FileSystemFileHandle, to: string): Promise<boolean> {
  if (!handle.move) return false
  try {
    await handle.move(to)
    return true
  } catch {
    return false
  }
}

/** Writes the diagram to `link`, recording the title it went out under. */
async function writeTo(documentId: string, link: FileLink, titleSlug: string): Promise<boolean> {
  const store = diagramStore(documentId)
  if (!(await writeJson(link.handle, store.toDocument()))) return false
  setLink(documentId, { handle: link.handle, slug: titleSlug })
  store.markSaved()
  return true
}

/* ---------------------------------------------------------------- saving */

/**
 * Writes the diagram to the file it came from, asking for one the first time.
 *
 * Returns false when nothing was written — the user backed out of the picker,
 * or refused the permission a remembered file needs in a new session — so a
 * caller waiting on the save (closing a tab) can stay put.
 */
export async function saveDocument(documentId: string): Promise<boolean> {
  const store = diagramStore(documentId)

  if (!canOverwriteFiles) {
    // Nothing to write back to; a download is the whole of what this browser
    // can do, and the numbering that comes with it is the browser's.
    exportJson(store.toDocument())
    store.markSaved()
    return true
  }

  const link = links.get(documentId)
  if (!link) return saveDocumentAs(documentId)

  const titleSlug = slug(store.toDocument())
  const renamed = titleSlug !== link.slug

  if (renamed && pinnedNames.get(documentId) !== link.handle.name) {
    const suggestedName = `${titleSlug}.baugraph.json`
    if (!(await renameInPlace(link.handle, suggestedName))) {
      // The file cannot follow the title, so the choice is the user's: a second
      // file under the new name, or leave this one named as it is.
      return ask({ documentId, currentName: link.handle.name, suggestedName })
    }
  }

  if (await writeTo(documentId, link, titleSlug)) return true

  // A refused grant means the link is no longer usable; ask for a destination
  // rather than failing on every subsequent save.
  unlinkDocumentFile(documentId)
  return saveDocumentAs(documentId)
}

/** Always asks for a destination, and saves to it from then on. */
export async function saveDocumentAs(documentId: string): Promise<boolean> {
  const store = diagramStore(documentId)

  if (!canOverwriteFiles) {
    exportJson(store.toDocument())
    store.markSaved()
    return true
  }

  const doc = store.toDocument()
  const handle = await writeJsonAs(doc)
  if (!handle) return false
  pinnedNames.delete(documentId)
  setLink(documentId, { handle, slug: slug(doc) })
  store.markSaved()
  return true
}

/* ------------------------------------------------- answers to the prompt */

/**
 * Each of these runs straight off the dialog's click, so the file picker still
 * has the user activation it needs.
 */
export async function saveUnderNewName() {
  const prompt = pendingRename.value
  if (!prompt) return
  finish(await saveDocumentAs(prompt.documentId))
}

export async function keepFileName() {
  const prompt = pendingRename.value
  const link = prompt && links.get(prompt.documentId)
  if (!prompt || !link) return finish(false)

  // Remembered against the file, not the title: having said this name is
  // deliberate, the user should not be asked again every time they edit it.
  pinnedNames.set(prompt.documentId, link.handle.name)
  finish(await writeTo(prompt.documentId, link, slug(diagramStore(prompt.documentId).toDocument())))
}

export function cancelRename() {
  finish(false)
}

/** What the document is saving to, for the toolbar to name. */
export function useDocumentFile(documentId: string) {
  return {
    canOverwriteFiles,
    fileName: computed(() => links.get(documentId)?.handle.name ?? null),
  }
}
