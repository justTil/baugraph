import type {
  DockviewApi,
  DockviewIDisposable,
  IDockviewPanel,
  SerializedDockview,
} from 'dockview-vue'
import { computed, ref, shallowRef } from 'vue'
import { navItem } from '@/config/navigation'
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
  /** Set on panels that hold one document of a multi-document view. */
  documentId?: string
}

/**
 * The app-specific half of the dock: what to show when there is nothing to
 * restore, and whether a restored panel still has something to render. Kept as
 * a hook so the workspace stays ignorant of what a document is; supplied by
 * `@/config/workspace`.
 */
export interface WorkspacePolicy {
  defaultLayout: () => void
  canRestore: (params: PanelParams) => boolean
  /**
   * Called before a tab is closed by hand. Returning `false` cancels the close
   * and leaves the view to take over — asking about unsaved work, say — after
   * which it closes the panel itself.
   */
  confirmClose: (params: PanelParams) => boolean
  /** Whether the tab holds changes nothing has captured yet — what "close saved" skips. */
  isDirty: (params: PanelParams) => boolean
}

const STORAGE_KEY = 'baugraph:workspace:v1'

/** `shallowRef` deliberately: the dockview api must not be made reactive. */
const dock = shallowRef<DockviewApi | null>(null)

let policy: WorkspacePolicy = {
  defaultLayout: () => {},
  canRestore: () => true,
  confirmClose: () => true,
  isDirty: () => false,
}

const openViewIds = ref<string[]>([])
const visibleViewIds = ref<string[]>([])
const activeViewId = ref<string | null>(null)
const activeItem = computed(() => (activeViewId.value ? navItem(activeViewId.value) : undefined))

/** Suppresses the autosave while `fromJSON` replays its own layout events. */
let restoring = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function paramsOf(panel: IDockviewPanel): PanelParams {
  return (panel.params as PanelParams | undefined) ?? { viewId: panel.id }
}

const viewIdOf = (panel: IDockviewPanel) => paramsOf(panel).viewId

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

  const active = api.activePanel
  activeViewId.value = active ? viewIdOf(active) : null
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
    api.panels
      .filter((p) => !views[viewIdOf(p)] || !policy.canRestore(paramsOf(p)))
      .forEach((p) => api.removePanel(p))
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

export interface OpenPanelOptions {
  /** Unique across the dock. A view that holds one document per panel derives
   *  it from the document, so the same document never opens twice. */
  id: string
  viewId: string
  title: string
  documentId?: string
}

/** Focuses `id`, opening it as a new tab first if it is not on screen. */
export function openPanel(options: OpenPanelOptions): IDockviewPanel | undefined {
  const api = dock.value
  if (!api) return undefined

  const existing = api.getPanel(options.id)
  if (existing) {
    existing.api.setActive()
    return existing
  }
  if (!views[options.viewId]) return undefined

  return api.addPanel<PanelParams>({
    id: options.id,
    component: PANEL_COMPONENT,
    title: options.title,
    params: { viewId: options.viewId, documentId: options.documentId },
  })
}

/** Opens a view that has a single shared panel, such as the settings. */
export function openView(viewId: string): IDockviewPanel | undefined {
  return openPanel({ id: viewId, viewId, title: navItem(viewId)?.label ?? viewId })
}

/** Closes a tab, if it is open. Bypasses {@link WorkspacePolicy.confirmClose}. */
export function closePanel(panelId: string) {
  dock.value?.getPanel(panelId)?.api.close()
}

/**
 * Closes a tab the way the user asked to — through its close button — giving
 * the view a chance to intervene first.
 */
export function requestClosePanel(panelId: string) {
  const panel = dock.value?.getPanel(panelId)
  if (!panel) return
  if (policy.confirmClose(paramsOf(panel))) panel.api.close()
}

/** Renames an open tab, for a view whose title follows its content. */
export function setPanelTitle(panelId: string, title: string) {
  dock.value?.getPanel(panelId)?.api.setTitle(title)
}

/** Every panel sharing a tab strip with `panelId`, left to right. */
function groupOf(panelId: string): IDockviewPanel[] {
  return dock.value?.getPanel(panelId)?.group.panels ?? []
}

/** Closes every other tab in the same group as `panelId`. */
export function closeOtherPanels(panelId: string) {
  groupOf(panelId)
    .filter((p) => p.id !== panelId)
    .forEach((p) => requestClosePanel(p.id))
}

/** Closes every tab to the right of `panelId` in its group. */
export function closePanelsToTheRight(panelId: string) {
  const panels = groupOf(panelId)
  const index = panels.findIndex((p) => p.id === panelId)
  if (index === -1) return
  panels.slice(index + 1).forEach((p) => requestClosePanel(p.id))
}

/** Closes every tab to the left of `panelId` in its group. */
export function closePanelsToTheLeft(panelId: string) {
  const panels = groupOf(panelId)
  const index = panels.findIndex((p) => p.id === panelId)
  if (index <= 0) return
  panels.slice(0, index).forEach((p) => requestClosePanel(p.id))
}

/** Closes every tab across the whole dock that has no unsaved changes. */
export function closeSavedPanels() {
  dock.value?.panels
    .filter((p) => !policy.isDirty(paramsOf(p)))
    .forEach((p) => requestClosePanel(p.id))
}

/** Closes every tab in the dock. */
export function closeAllPanels() {
  dock.value?.panels.forEach((p) => requestClosePanel(p.id))
}

/** The arrangement the dock falls back to when there is nothing to restore. */
function applyDefaultLayout() {
  const api = dock.value
  if (!api) return
  api.clear()
  policy.defaultLayout()
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
export function registerDock(api: DockviewApi, workspacePolicy: WorkspacePolicy): DockviewIDisposable[] {
  dock.value = api
  policy = workspacePolicy

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
