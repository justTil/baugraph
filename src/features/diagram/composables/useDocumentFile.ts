import { computed, shallowReactive } from 'vue'
import { diagramStore } from '@/features/diagram/composables/useDiagram'
import {
  canOverwriteFiles,
  exportJson,
  writeJson,
  writeJsonAs,
} from '@/features/diagram/lib/export'
import {
  forgetFileHandle,
  recallFileHandle,
  rememberFileHandle,
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
const links = shallowReactive(new Map<string, FileSystemFileHandle>())

export function linkedFile(documentId: string): FileSystemFileHandle | undefined {
  return links.get(documentId)
}

export function linkDocumentFile(documentId: string, handle: FileSystemFileHandle) {
  links.set(documentId, handle)
  rememberFileHandle(documentId, handle)
}

export function unlinkDocumentFile(documentId: string) {
  links.delete(documentId)
  forgetFileHandle(documentId)
}

/** Restores the link a previous session left behind. */
export async function hydrateDocumentFile(documentId: string) {
  if (links.has(documentId)) return
  const handle = await recallFileHandle(documentId)
  if (handle) links.set(documentId, handle)
}

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

  const handle = links.get(documentId)
  if (handle && (await writeJson(handle, store.toDocument()))) {
    store.markSaved()
    return true
  }
  // A refused grant means the link is no longer usable; fall through to asking
  // for a destination rather than failing on every subsequent save.
  if (handle) unlinkDocumentFile(documentId)

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

  const handle = await writeJsonAs(store.toDocument())
  if (!handle) return false
  linkDocumentFile(documentId, handle)
  store.markSaved()
  return true
}

/** What the document is saving to, for the toolbar to name. */
export function useDocumentFile(documentId: string) {
  return {
    canOverwriteFiles,
    fileName: computed(() => links.get(documentId)?.name ?? null),
  }
}
