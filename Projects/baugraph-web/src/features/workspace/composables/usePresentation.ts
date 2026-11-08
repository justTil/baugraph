import { ref } from 'vue'

/**
 * Presentation mode: a chrome-free, full-screen view of the canvas for
 * screen-sharing a diagram in a call — the nav, the header, the toolbar and
 * the inspector all drop away, and, where the browser allows it, the page
 * claims the whole screen too.
 *
 * One flag for the whole app rather than one per document: only whatever is
 * on screen can be presented, so there is nothing to key this to the way the
 * laser pointer is kept per document.
 */
const presenting = ref(false)

/**
 * Best-effort: a sandboxed frame — the VS Code webview, an iframe without
 * `allow="fullscreen"` — refuses this silently, and the chrome-free overlay
 * on its own still gives a clean view to share.
 */
async function requestFullscreen() {
  const el = document.documentElement
  if (!document.fullscreenEnabled || !el.requestFullscreen) return
  try {
    await el.requestFullscreen()
  } catch {
    // Denied or unsupported here — nothing else to fall back to.
  }
}

async function exitFullscreen() {
  if (!document.fullscreenElement) return
  try {
    await document.exitFullscreen()
  } catch {
    // The browser refused; there is no second way to ask.
  }
}

// Esc, F11, or the browser's own "exit fullscreen" control all end fullscreen
// without going through `exit()` below — this is what notices and keeps the
// flag in step, so the chrome-free overlay doesn't outlive the real thing.
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) presenting.value = false
  })
}

async function enter() {
  presenting.value = true
  await requestFullscreen()
}

async function exit() {
  presenting.value = false
  await exitFullscreen()
}

function toggle() {
  return presenting.value ? exit() : enter()
}

/** The app's presentation mode — one flag, read wherever the chrome hides for it. */
export function usePresentation() {
  return { presenting, enter, exit, toggle }
}
