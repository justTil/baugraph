import { computed, ref } from 'vue'
import type { DiagramDocument } from '@/model'
import { blankDocument, safeParse, slugify, uniqueId } from '@/model'
import {
  diagramStore,
  disposeDiagramStore,
  hasDiagramStore,
} from '@/features/diagram/composables/useDiagram'
import { disposeFlowRuntime } from '@/features/diagram/composables/useFlows'

/**
 * The diagrams this browser is holding on to.
 *
 * One editor tab is one document, and each keeps its own autosave, so the index
 * is what tells the app which of them exist once the tabs are gone. Ids are
 * slugged from the title in the same spirit as node ids: a storage key that can
 * be read in devtools beats a uuid.
 */
export interface StoredDocument {
  id: string
  title: string
  /** ISO timestamp of the last time it was opened or renamed. Newest first. */
  usedAt: string
}

const INDEX_KEY = 'baugraph:documents:v1'
/** The single-document key this app used before diagrams got their own tabs. */
const LEGACY_KEY = 'baugraph:document:v1'

const index = ref<StoredDocument[]>(readIndex())

function readIndex(): StoredDocument[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is StoredDocument =>
        !!entry && typeof entry.id === 'string' && typeof entry.title === 'string',
    )
  } catch {
    return []
  }
}

function writeIndex() {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index.value))
  } catch {
    // Quota or private-mode failures are not worth interrupting the user for.
  }
}

/** Records a document, or refreshes the title a tab has since been renamed to. */
export function rememberDocument(id: string, title: string) {
  const entry = index.value.find((d) => d.id === id)
  if (entry) {
    if (entry.title === title) return
    entry.title = title
    entry.usedAt = new Date().toISOString()
  } else {
    index.value = [{ id, title, usedAt: new Date().toISOString() }, ...index.value]
  }
  writeIndex()
}

/**
 * Marks a document as the one most recently reached for. What "most recent"
 * means when the app has to pick a diagram on its own — reopening after every
 * tab was closed, or on a first run with nothing to restore.
 */
export function touchDocument(id: string) {
  const entry = index.value.find((d) => d.id === id)
  if (!entry) return
  entry.usedAt = new Date().toISOString()
  writeIndex()
}

function freshId(title: string): string {
  return uniqueId(slugify(title, 'diagram'), index.value.map((d) => d.id))
}

/* ----------------------------------------------------------------- opening */

/** A new, empty diagram under `title`. Returns its document id. */
export function createDocument(title: string): string {
  return adoptDocument(blankDocument(title.trim() || 'Untitled diagram'))
}

/** Takes a parsed document — a dropped file, the sample — as a new document. */
export function adoptDocument(doc: DiagramDocument): string {
  const title = doc.meta.title || 'Untitled diagram'
  const id = freshId(title)
  diagramStore(id).loadDocument(doc)
  rememberDocument(id, title)
  return id
}

/**
 * Brings a stored document back into memory. Returns `false` when its autosave
 * has gone — a layout restored from a browser whose storage was cleared, say —
 * so the caller can drop the tab instead of opening an empty one.
 */
export function ensureDocument(id: string): boolean {
  if (hasDiagramStore(id)) return true

  const store = diagramStore(id)
  const stored = store.restorePersisted()
  const parsed = stored ? safeParse(stored) : null
  if (!parsed?.ok) {
    disposeDiagramStore(id)
    return false
  }
  store.loadDocument(parsed.document)
  rememberDocument(id, parsed.document.meta.title || id)
  return true
}

/** Whether `id` can still be opened, without loading it. */
export function documentExists(id: string): boolean {
  if (hasDiagramStore(id)) return true
  try {
    return localStorage.getItem(`baugraph:document:v1:${id}`) !== null
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- forgetting */

/** Drops a document for good: its autosave, its store and its flow runtime. */
export function forgetDocument(id: string) {
  disposeFlowRuntime(id)
  if (hasDiagramStore(id)) diagramStore(id).clearPersisted()
  else {
    try {
      localStorage.removeItem(`baugraph:document:v1:${id}`)
    } catch {
      /* ignore */
    }
  }
  disposeDiagramStore(id)
  index.value = index.value.filter((d) => d.id !== id)
  writeIndex()
}

/* ------------------------------------------------------------------ legacy */

/**
 * Adopts the diagram saved by the single-document version of the app, once.
 * Returns its new id, or null when there is nothing to carry over.
 */
export function migrateLegacyDocument(): string | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let id: string | null = null
  try {
    const parsed = safeParse(JSON.parse(raw))
    if (parsed.ok) id = adoptDocument(parsed.document)
  } catch {
    // A corrupt legacy entry is dropped along with the key below.
  }
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* ignore */
  }
  return id
}

/** Stored diagrams, most recently touched first. */
export function useDocuments() {
  return {
    documents: computed(() => [...index.value].sort((a, b) => b.usedAt.localeCompare(a.usedAt))),
    createDocument,
    adoptDocument,
    forgetDocument,
  }
}
