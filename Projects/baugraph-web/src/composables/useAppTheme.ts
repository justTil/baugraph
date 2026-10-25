import { computed, ref, watch, type Ref } from 'vue'

/**
 * Whether the whole app — chrome, canvas, JSON view — is dark.
 *
 * One flag for the entire app, not one per document: it used to be that the
 * canvas read a per-diagram `canvas.theme` while everything around it read
 * nothing, so night mode only ever covered the canvas, and switching tabs
 * could change what "on" meant. There is exactly one switch now, and it
 * drives every part of the UI.
 *
 * What backs that switch differs by host, the same way `FileHost` does (see
 * `useDocumentFile`): in the browser it is a preference stored in this
 * browser, defaulting to light. Inside VS Code (`src/vscode/main.ts`) it
 * instead mirrors the editor's own colour theme, with an explicit override the
 * user can set and VS Code remembers — see `setThemeSource`.
 */
export interface ThemeSource {
  /** Resolved dark/light state to render with. */
  dark: Ref<boolean>
  /** What the toolbar's toggle calls to request a change. */
  setDark(value: boolean): void
}

const STORAGE_KEY = 'baugraph:app-theme'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark'
  } catch {
    return false
  }
}

function createBrowserSource(): ThemeSource {
  const dark = ref(readStored())
  watch(
    dark,
    (value) => {
      document.documentElement.classList.toggle('dark', value)
      try {
        localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light')
      } catch {
        // Private browsing, storage full, quota denied — the choice just
        // won't survive a reload, which is no worse than not having it at all.
      }
    },
    { immediate: true },
  )
  return { dark, setDark: (value) => (dark.value = value) }
}

let source: ThemeSource | null = null

function activeSource(): ThemeSource {
  if (!source) source = createBrowserSource()
  return source
}

/**
 * Installed once, before the app mounts — see `setFileHost`. Whatever is
 * installed here backs every `useAppTheme()` call from then on, so it must run
 * before the first component that uses one is set up.
 */
export function setThemeSource(next: ThemeSource) {
  source = next
}

/** The app's dark/light state, shared by every open tab and the canvas alike. */
export function useAppTheme() {
  const dark = computed({
    get: () => activeSource().dark.value,
    set: (value: boolean) => activeSource().setDark(value),
  })
  const mode = computed<'light' | 'dark'>(() => (dark.value ? 'dark' : 'light'))
  return { dark, mode }
}
