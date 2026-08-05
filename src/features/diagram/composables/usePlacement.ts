import type { PaletteItem } from '@/features/diagram/data/palette'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * Adds palette items to the canvas.
 *
 * Shared by the sidebar (click to place, drag to drop) and the canvas itself
 * (drop handling), so both routes go through the same undo bookkeeping.
 */
export function usePlacement() {
  const { vueFlowRef, screenToFlowCoordinate, addSelectedNodes, findNode } = useCanvas()
  const { commit, addNode, endCoalesce } = useDiagram()

  /** Canvas coordinate at the centre of the visible viewport. */
  function viewportCentre() {
    const rect = vueFlowRef.value?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return screenToFlowCoordinate({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  function place(item: PaletteItem, at?: { x: number; y: number }) {
    commit()
    endCoalesce()
    const node = addNode(item, at ?? viewportCentre())
    // Selecting the new node opens the inspector on it straight away.
    requestAnimationFrame(() => {
      const added = findNode(node.id)
      if (added) addSelectedNodes([added])
    })
    return node
  }

  function placeAtScreen(item: PaletteItem, screen: { x: number; y: number }) {
    return place(item, screenToFlowCoordinate(screen))
  }

  return { place, placeAtScreen, viewportCentre }
}
