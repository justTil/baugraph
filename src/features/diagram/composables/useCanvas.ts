import { useVueFlow } from '@vue-flow/core'

/**
 * Shared handle on the editor's Vue Flow instance.
 *
 * Passing a fixed id lets components outside the `<VueFlow>` subtree — the
 * palette in the sidebar, the toolbar in the app header — read the viewport and
 * add nodes without prop-drilling a ref through the layout.
 */
export const CANVAS_ID = 'baugraph-canvas'

export function useCanvas() {
  return useVueFlow(CANVAS_ID)
}
