/**
 * Ids of the two empty regions in `AppHeader` that views teleport into.
 *
 * Views render inside the shell's default slot, so they cannot fill a named slot
 * on the header above them; a teleport target keeps the app to a compact header
 * without the shell needing to know what any view puts there.
 *
 * - `HEADER_SLOT_ID` is the second row: a view's full toolbar.
 * - `HEADER_ACTIONS_SLOT_ID` sits in the app-chrome row itself, beside the
 *   title, for the handful of file-level actions (new/open/save/export, …)
 *   that belong with the rest of the app chrome rather than the view's own
 *   toolbar row below it.
 */
export const HEADER_SLOT_ID = 'app-header-actions'
export const HEADER_SLOT_SELECTOR = `#${HEADER_SLOT_ID}`

export const HEADER_ACTIONS_SLOT_ID = 'app-header-primary-actions'
export const HEADER_ACTIONS_SLOT_SELECTOR = `#${HEADER_ACTIONS_SLOT_ID}`
