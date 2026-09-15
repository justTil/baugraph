import { computed, ref, watch } from 'vue'

/**
 * Whether the whole app — chrome, canvas, JSON view — is dark.
 *
 * One flag for the entire app, not one per document: it used to be that the
 * canvas read a per-diagram `canvas.theme` while everything around it read
 * nothing, so night mode only ever covered the canvas, and switching tabs
 * could change what "on" meant. There is exactly one switch now, it drives
 * every part of the UI, and it is persisted so it survives a reload. (The
 * VS Code extension is unrelated: there, the canvas intentionally follows the
 * diagram file's own `canvas.theme`, since the chrome is VS Code's.)
 */
const STORAGE_KEY = 'baugraph:app-theme'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark'
  } catch {
    return false
  }
}

const dark = ref(readStored())
const mode = computed<'light' | 'dark'>(() => (dark.value ? 'dark' : 'light'))

watch(
  dark,
  (value) => {
    document.documentElement.classList.toggle('dark', value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light')
    } catch {
      // Private browsing, storage full, quota denied — the choice just won't
      // survive a reload, which is no worse than not having it at all.
    }
  },
  { immediate: true },
)

/** The app's dark/light state, shared by every open tab and the canvas alike. */
export function useAppTheme() {
  return { dark, mode }
}
