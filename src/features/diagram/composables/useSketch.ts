import type { Ref } from 'vue'
import { ref } from 'vue'
import type { ColorKey, SketchTool } from '@/model'
import { SKETCH_STROKE_DEFAULTS } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * The Canvas layer's editing mode.
 *
 * The strokes themselves live in the document store (undo, autosave, the file)
 * — this is only the transient "am I drawing" state and the current pen: none of
 * it belongs on disk, and it is per document so turning Canvas mode on in one
 * editor tab does not freeze another.
 *
 * While `active` is on the diagram is frozen (nodes and connections cannot be
 * moved, selected or connected) and a press on the canvas draws instead.
 */

/** Pen widths the toolbar offers, in canvas units. */
export const SKETCH_WIDTHS = [2, 3, 6] as const

interface SketchMode {
  active: Ref<boolean>
  tool: Ref<SketchTool>
  color: Ref<ColorKey>
  width: Ref<number>
}

const modes = new Map<string, SketchMode>()

export function sketchModeOf(documentId: string): SketchMode {
  let mode = modes.get(documentId)
  if (!mode) {
    mode = {
      active: ref(false),
      tool: ref<SketchTool>('pen'),
      color: ref<ColorKey>(SKETCH_STROKE_DEFAULTS.color),
      width: ref<number>(SKETCH_STROKE_DEFAULTS.width),
    }
    modes.set(documentId, mode)
  }
  return mode
}

/** The Canvas mode of the document this component's panel belongs to. */
export function useSketchMode(): SketchMode {
  return sketchModeOf(useDiagram().documentId)
}
