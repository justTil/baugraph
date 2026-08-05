/**
 * Custom MIME type used to move a palette item onto the canvas.
 *
 * A dedicated type (rather than `text/plain`) means the canvas can ignore drags
 * that originate anywhere else — a dragged image or a text selection, say.
 */
export const PALETTE_DRAG_TYPE = 'application/x-baugraph-palette-item'
