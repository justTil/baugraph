import type { WorkspacePolicy } from '@/features/workspace/composables/useWorkspace'
import { diagramStore } from '@/features/diagram/composables/useDiagram'
import {
  EDITOR_VIEW_ID,
  canRestoreEditor,
  openStartupEditor,
  requestCloseDocument,
} from '@/features/diagram/composables/useEditorTabs'

/**
 * The app-specific half of the dock, kept next to `views` rather than inside the
 * workspace so the dock itself stays a generic tab host.
 */
export const workspacePolicy: WorkspacePolicy = {
  defaultLayout: openStartupEditor,
  canRestore: (params) =>
    params.viewId !== EDITOR_VIEW_ID || canRestoreEditor(params.documentId),
  confirmClose: (params) =>
    params.viewId !== EDITOR_VIEW_ID || requestCloseDocument(params.documentId),
  isDirty: (params) =>
    params.viewId === EDITOR_VIEW_ID &&
    !!params.documentId &&
    diagramStore(params.documentId).dirty.value,
}
