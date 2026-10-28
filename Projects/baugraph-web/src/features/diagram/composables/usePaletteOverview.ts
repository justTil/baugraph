import { ref } from 'vue'

/**
 * Whether the palette overview is open.
 *
 * The dialog lives with the palette in the sidebar, but `B` is caught by the
 * canvas, which has no other way to reach it — so the flag is shared rather
 * than owned by either. Not persisted: it is a moment, not a preference.
 */
const open = ref(false)

/** The palette overview's open state, shared by the sidebar and the canvas. */
export function usePaletteOverview() {
  return { open }
}
