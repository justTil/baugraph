import type {
  DockviewApi,
  DockviewIDisposable,
  IDockviewPanel,
  SerializedDockview,
} from 'dockview-vue'
import { computed, ref, shallowRef } from 'vue'
import { defaultNavItemId, navItem } from '@/config/navigation'
import { views } from '@/config/views'

/**
 * The single component id registered with dockview. Every panel renders the
 * same wrapper and picks its view from `params.viewId`, which keeps serialized
 * layouts stable when views are added or renamed.
 */
export const PANEL_COMPONENT = 'view'

/** Params carried by every panel; also what gets written to the saved layout. */
export interface PanelParams {
  viewId: string
}

const STORAGE_KEY = 'baugraph:workspace:v1'

/** `shallowRef` deliberately: the dockview api must not be made reactive. */
const dock = shallowRef<DockviewApi | null>(null)

const openViewIds = ref<string[]>([])
const visibleViewIds = ref<string[]>([])
const activeViewId = ref<string | null>(null)
const activeItem = computed(() => (activeViewId.value ? navItem(activeViewId.value) : undefined))

/** Suppresses the autosave while `fromJSON` replays its own layout events. */
let restoring = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function viewIdOf(panel: IDockviewPanel): string {
  return (panel.params as PanelParams | undefined)?.viewId ?? panel.id
}

/** Mirrors the dock's state into refs so Vue templates can follow it. */
function sync() {
  const api = dock.value
  if (!api) {
    openViewIds.value = []
    visibleViewIds.value = []
    activeViewId.value = null
    return
  }
  openViewIds.value = api.panels.map(viewIdOf)
  visibleViewIds.value = api.panels.filter((p) => p.api.isVisible).map(viewIdOf)
  activeViewId.value = api.activePanel ? viewIdOf(api.activePanel) : null
}

/* ------------------------------------------------------------- persistence */

function persist() {
  const api = dock.value
  if (!api || restoring) return
  clearTimeout(saveTimer)
  // Dragging a sash fires a change per frame; one write per settle is plenty.
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()))
    } catch {
      // Private mode or a full quota - the layout is a convenience, not data.
    }
  }, 250)
}

/**
 * Restores the saved arrangement. A layout that no longer matches the app -
 * a view was removed, or the entry is corrupt - must not leave the user with a
 * dock full of dead tabs, so anything unrecognised is dropped and a `false`
 * return hands control back to the default layout.
 */
function restore(): boolean {
  const api = dock.value
  if (!api) return false

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false

  restoring = true
  try {
    api.fromJSON(JSON.parse(raw) as SerializedDockview)
    api.panels.filter((p) => !views[viewIdOf(p)]).forEach((p) => api.removePanel(p))
    return api.totalPanels > 0
  } catch {
    api.clear()
    return false
  } finally {
    restoring = false
  }
}

function clearSavedLayout() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See `persist`.
  }
}

/* ----------------------------------------------------------------- actions */

/**
 * Focuses the panel for `viewId`, opening it as a new tab first if it is not on
 * screen.
 *
 * Views are single-instance on purpose: the diagram store is a module singleton
 * and Vue Flow keys its instance by a fixed id, so a second editor panel would
 * render the same canvas twice over one store.
 */
export function openView(viewId: string): IDockviewPanel | undefined {
  const api = dock.value
  if (!api) return undefined

  const existing = api.getPanel(viewId)
  if (existing) {
    existing.api.setActive()
    return existing
  }
  if (!views[viewId]) return undefined

  return api.addPanel<PanelParams>({
    id: viewId,
    component: PANEL_COMPONENT,
    title: navItem(viewId)?.label ?? viewId,
    params: { viewId },
  })
}

/** The arrangement the dock falls back to: the editor alone, filling the dock. */
function applyDefaultLayout() {
  const api = dock.value
  if (!api) return
  api.clear()
  openView(defaultNavItemId)
}

export function resetLayout() {
  clearSavedLayout()
  applyDefaultLayout()
}

/* ------------------------------------------------------------------- setup */

/**
 * Adopts a dockview instance. Called once from `WorkspaceDock` on `ready`;
 * returns the disposables the host tears down when it unmounts.
 */
export function registerDock(api: DockviewApi): DockviewIDisposable[] {
  dock.value = api

  const subscriptions = [
    api.onDidLayoutChange(() => {
      sync()
      persist()
    }),
    // Selecting another tab moves nothing, so it does not always reach the
    // layout event above - but it does change which panels are on screen.
    api.onDidActivePanelChange(sync),
    api.onDidAddPanel(sync),
    api.onDidRemovePanel(sync),
  ]

  if (!restore()) applyDefaultLayout()
  sync()

  return [
    ...subscriptions,
    {
      dispose: () => {
        clearTimeout(saveTimer)
        dock.value = null
        sync()
      },
    },
  ]
}

/** Shared handle on the docked workspace. */
export function useWorkspace() {
  return {
    activeViewId,
    activeItem,
    isOpen: (id: string) => openViewIds.value.includes(id),
    /** On screen right now - open *and* the selected tab of its group. */
    isVisible: (id: string) => visibleViewIds.value.includes(id),
    isActive: (id: string) => activeViewId.value === id,
    openView,
    resetLayout,
  }
}
