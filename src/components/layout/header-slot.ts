/**
 * Id of the empty region in `AppHeader` that views teleport their toolbar into.
 *
 * Views render inside the shell's default slot, so they cannot fill a named slot
 * on the header above them; a teleport target keeps the app to one compact top
 * bar without the shell needing to know what any view puts there.
 */
export const HEADER_SLOT_ID = 'app-header-actions'
export const HEADER_SLOT_SELECTOR = `#${HEADER_SLOT_ID}`
