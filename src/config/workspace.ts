import type { WorkspacePolicy } from '@/features/workspace/composables/useWorkspace'
import {
  EDITOR_VIEW_ID,
  canRestoreEditor,
  openStartupEditor,
} from '@/features/diagram/composables/useEditorTabs'

/**
 * The app-specific half of the dock, kept next to `views` rather than inside the
 * workspace so the dock itself stays a generic tab host.
 */
export const workspacePolicy: WorkspacePolicy = {
  defaultLayout: openStartupEditor,
  canRestore: (params) =>
    params.viewId !== EDITOR_VIEW_ID || canRestoreEditor(params.documentId),
}
