import { useVueFlow } from '@vue-flow/core'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * Shared handle on a document's Vue Flow instance.
 *
 * Passing a fixed id lets components outside the `<VueFlow>` subtree — the
 * palette in the sidebar, the toolbar in the app header — read the viewport and
 * add nodes without prop-drilling a ref through the layout. The id carries the
 * document with it so two editor tabs drive two separate canvases.
 */
export const canvasId = (documentId: string) => `baugraph-canvas:${documentId}`

/** The canvas of a named document; for callers that resolve it themselves. */
export function canvasOf(documentId: string) {
  return useVueFlow(canvasId(documentId))
}

/** The canvas of the document this component's panel belongs to. */
export function useCanvas() {
  return canvasOf(useDiagram().documentId)
}
