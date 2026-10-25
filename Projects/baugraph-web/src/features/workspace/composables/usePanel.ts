import type { DockviewApi, DockviewPanelApi } from 'dockview-vue'
import type { PanelParams } from '@/features/workspace/composables/useWorkspace'
import type { InjectionKey, Ref } from 'vue'
import { computed, inject } from 'vue'

/**
 * What a view can learn about the panel it is docked in.
 *
 * A docked view stays mounted when its tab is deselected - dockview only hides
 * the element - so anything that must not run off-screen (a teleported toolbar,
 * a global key handler, a canvas that needs re-measuring) has to ask.
 */
export interface PanelContext {
  viewId: string
  /** Everything the panel was opened with, including its document if it has one. */
  params: PanelParams
  /** The selected tab of its group, i.e. actually painted. */
  isVisible: Ref<boolean>
  /** Visible *and* the dock's focused panel. At most one panel at a time. */
  isActive: Ref<boolean>
  api: DockviewPanelApi
  containerApi: DockviewApi
}

export const PANEL_CONTEXT: InjectionKey<PanelContext> = Symbol('workspace-panel')

/**
 * Reads the surrounding panel. Views are also usable outside the dock (tests,
 * a standalone mount), so an absent provider reports "always on screen"
 * rather than throwing.
 */
export function usePanel(): Pick<PanelContext, 'isVisible' | 'isActive'> &
  Partial<PanelContext> {
  const context = inject(PANEL_CONTEXT, null)
  return (
    context ?? {
      isVisible: computed(() => true),
      isActive: computed(() => true),
    }
  )
}
