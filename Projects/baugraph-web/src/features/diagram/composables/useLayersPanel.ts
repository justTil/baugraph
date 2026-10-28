import { ref, watch } from 'vue'

/**
 * Whether the layers panel is open over the left of the canvas.
 *
 * One flag for the whole app, the same as the inspector's fold (see
 * `useInspectorPanel`): it is a preference about the screen, not about any one
 * diagram. Persisted so a panel left open for a big diagram is still open after
 * a reload.
 */
const STORAGE_KEY = 'baugraph:layers-open'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const open = ref(readStored())

watch(open, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Private browsing, storage full, quota denied — the panel just won't
    // remember being open, which is no worse than not having it at all.
  }
})

/** The layers panel's open state, shared by every open document. */
export function useLayersPanel() {
  return { open }
}
