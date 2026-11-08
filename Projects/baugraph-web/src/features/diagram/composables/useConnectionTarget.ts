import { computed } from 'vue'
import type { ConnectingHandle } from '@vue-flow/core'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * Where a connection being dragged would land if it were released right now.
 *
 * Vue Flow already tracks the handle nearest the pointer; what it cannot know is
 * whether letting go there would actually produce a connection. `addEdge` turns
 * two of them down — a node connecting to itself, and a second connection
 * between a pair that is already joined — and in loose mode both are perfectly
 * reachable, since every handle on the canvas is a drop target including the
 * ones on the node the drag came out of.
 *
 * So the rule lives here once, and everything that shows the user an answer —
 * the dot on the node, the line trailing the cursor — reads the same one. A
 * green that promised a connection the release then refused would be worse than
 * no indicator at all.
 */
export function useConnectionTarget() {
  const { connectionStartHandle, connectionEndHandle } = useCanvas()
  const { edges } = useDiagram()

  /** The point the drag came out of, for as long as it lasts. */
  const from = computed<ConnectingHandle | null>(() => connectionStartHandle.value)

  /** The point a release would connect to, or `null` while there is nothing to land on. */
  const to = computed<ConnectingHandle | null>(() => {
    const start = connectionStartHandle.value
    const end = connectionEndHandle.value
    if (!start || !end || end.nodeId === start.nodeId) return null
    if (edges.value.some((e) => e.source === start.nodeId && e.target === end.nodeId)) return null
    return end
  })

  return {
    /** Whether a connection is being dragged anywhere on this canvas. */
    connecting: computed(() => !!connectionStartHandle.value),
    from,
    to,
  }
}
