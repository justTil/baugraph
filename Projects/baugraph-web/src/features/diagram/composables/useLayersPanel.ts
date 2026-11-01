import { ref, watch } from 'vue'

/**
 * Whether the layers panel is open over the left of the canvas, and which of
 * its tabs is showing — every node by zone, or by the 3D view's planes.
 *
 * One state for the whole app, the same as the inspector's fold (see
 * `useInspectorPanel`): it is a preference about the screen, not about any one
 * diagram. Persisted so a panel left open for a big diagram is still open after
 * a reload.
 */
const STORAGE_KEY = 'baugraph:layers-open'
const TAB_KEY = 'baugraph:layers-tab'

export type LayersTab = 'layers' | 'planes'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private browsing, storage full, quota denied — the panel just won't
    // remember being open, which is no worse than not having it at all.
  }
}

const open = ref(readStored(STORAGE_KEY) === 'true')
const tab = ref<LayersTab>(readStored(TAB_KEY) === 'planes' ? 'planes' : 'layers')

watch(open, (value) => store(STORAGE_KEY, String(value)))
watch(tab, (value) => store(TAB_KEY, value))

/** The layers panel's open state and tab, shared by every open document. */
export function useLayersPanel() {
  return { open, tab }
}
