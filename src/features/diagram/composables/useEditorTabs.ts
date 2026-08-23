import type { IDockviewPanel } from 'dockview-vue'
import { ref } from 'vue'
import type { DiagramDocument } from '@/model'
import { blankDocument } from '@/model'
import { closePanel, openPanel, setPanelTitle } from '@/features/workspace/composables/useWorkspace'
import { diagramStore } from '@/features/diagram/composables/useDiagram'
import { unlinkDocumentFile } from '@/features/diagram/composables/useDocumentFile'
import {
  adoptDocument,
  createDocument,
  ensureDocument,
  forgetDocument,
  migrateLegacyDocument,
  touchDocument,
  useDocuments,
} from '@/features/diagram/composables/useDocuments'
import { sampleDocument } from '@/features/diagram/data/sample'
import { fontsReady } from '@/features/diagram/lib/text'

/**
 * Editor tabs: the join between a stored diagram and a panel in the dock.
 *
 * Unlike the settings or the legal pages, the editor has one panel *per
 * document* rather than one panel outright, so every entry point here goes
 * through a document id and derives the panel from it.
 */
export const EDITOR_VIEW_ID = 'editor'

/** Panel id for a document. Prefixed so it cannot collide with a view id. */
export const editorPanelId = (documentId: string) => `doc:${documentId}`

/** Focuses the tab holding `documentId`, opening one if it is not on screen. */
export function openDocumentTab(documentId: string): IDockviewPanel | undefined {
  touchDocument(documentId)
  return openPanel({
    id: editorPanelId(documentId),
    viewId: EDITOR_VIEW_ID,
    title: diagramStore(documentId).meta.title,
    documentId,
  })
}

/* ------------------------------------------------------------------ closing */

/**
 * The document whose tab is waiting on an answer about its unsaved changes.
 *
 * One at a time: the prompt is modal, so a second tab cannot be closed while it
 * is up. The editor panel for this document renders the dialog, because that is
 * the component that can actually write the file. Others asked about in the
 * same breath — a "close all" sweeping up several dirty tabs at once — queue
 * behind it instead of clobbering which one is showing.
 */
const pendingClose = ref<string | null>(null)
const closeQueue: string[] = []

export function useCloseRequest() {
  return { pendingClose }
}

function advanceCloseQueue() {
  pendingClose.value = closeQueue[0] ?? null
}

/**
 * Whether the tab holding `documentId` may close now. A diagram with changes
 * that are not in a file yet puts the question to the user instead, and the
 * answer comes back through {@link resolveCloseRequest}.
 */
export function requestCloseDocument(documentId: string | undefined): boolean {
  if (!documentId || !diagramStore(documentId).dirty.value) return true
  if (!closeQueue.includes(documentId)) closeQueue.push(documentId)
  if (pendingClose.value === null) advanceCloseQueue()
  return false
}

/** Answers the prompt: close the tab, or leave it open. */
export function resolveCloseRequest(documentId: string, close: boolean) {
  const index = closeQueue.indexOf(documentId)
  if (index !== -1) closeQueue.splice(index, 1)
  if (pendingClose.value === documentId) advanceCloseQueue()
  if (close) closePanel(editorPanelId(documentId))
}

/**
 * Deletes a diagram and everything holding it: its tab first, because a panel
 * left open on a discarded document would be editing a store nothing saves.
 */
export function discardDocument(documentId: string) {
  closePanel(editorPanelId(documentId))
  unlinkDocumentFile(documentId)
  forgetDocument(documentId)
}

/** Deletes every stored diagram, closing the tabs still showing them. */
export function discardAllDocuments() {
  useDocuments().documents.value.forEach((entry) => discardDocument(entry.id))
}

/** Keeps a tab's label on the document it holds, as the title is edited. */
export function renameDocumentTab(documentId: string, title: string) {
  setPanelTitle(editorPanelId(documentId), title)
}

/** A blank diagram under `title`, in its own tab. */
export function newDocumentTab(title: string): IDockviewPanel | undefined {
  return openDocumentTab(createDocument(title))
}

/** A diagram read from a file, in its own tab. */
export function openDocumentTabFrom(doc: DiagramDocument): IDockviewPanel | undefined {
  return openDocumentTab(adoptDocument(doc))
}

/**
 * What the sidebar's "Diagram" entry does: go to an editor rather than open
 * another one. Falls back to the most recent stored diagram, and to a fresh
 * one when this browser has never held any.
 */
export function focusOrOpenEditor(): IDockviewPanel | undefined {
  const recent = useDocuments().documents.value.find((d) => ensureDocument(d.id))
  return recent ? openDocumentTab(recent.id) : newDocumentTab('Untitled diagram')
}

/**
 * The editor shown when the dock has no saved layout to restore: the diagram
 * carried over from the single-document version of the app, else the most
 * recent one, else the worked example.
 */
export function openStartupEditor() {
  const carriedOver = migrateLegacyDocument()
  if (carriedOver) {
    openDocumentTab(carriedOver)
    return
  }

  const recent = useDocuments().documents.value.find((d) => ensureDocument(d.id))
  if (recent) {
    openDocumentTab(recent.id)
    return
  }

  // The example sizes its nodes from their own text, so it has to be built with
  // the font it will be drawn in — which the tab cannot wait around for.
  const id = adoptDocument(blankDocument('Order processing — reference architecture'))
  openDocumentTab(id)
  void fontsReady().then(() => diagramStore(id).loadDocument(sampleDocument()))
}

/**
 * Whether a restored editor tab still has a diagram behind it. Storage cleared
 * in another tab, or a document deleted, leaves the layout pointing at nothing.
 */
export function canRestoreEditor(documentId: string | undefined): boolean {
  return !!documentId && ensureDocument(documentId)
}
