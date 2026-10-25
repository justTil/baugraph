import { ref, watch } from 'vue'

/**
 * Whether the inspector is folded away to a thin rail.
 *
 * One flag for the whole app, not one per document: it is a preference about
 * how much of the screen the inspector gets, the same way the window itself
 * isn't a per-document choice. Persisted so it survives a reload — folding it
 * away to work on a big diagram would be undone by every refresh otherwise.
 */
const STORAGE_KEY = 'baugraph:inspector-collapsed'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const collapsed = ref(readStored())

watch(collapsed, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Private browsing, storage full, quota denied — the fold just won't
    // survive a reload, which is no worse than not having it at all.
  }
})

/** The inspector's fold state, shared by every open document. */
export function useInspectorPanel() {
  return { collapsed }
}
