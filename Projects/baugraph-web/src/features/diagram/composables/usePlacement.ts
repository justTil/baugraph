import type { PaletteItem } from '@/features/diagram/data/palette'
import { canvasOf } from '@/features/diagram/composables/useCanvas'
import { diagramStore, useDocumentId } from '@/features/diagram/composables/useDiagram'

/**
 * Adds palette items to the canvas.
 *
 * Shared by the sidebar (click to place, drag to drop) and the canvas itself
 * (drop handling), so both routes go through the same undo bookkeeping. The
 * sidebar outlives any one document, so the target is resolved per call rather
 * than captured at setup: it places into whichever editor is focused now.
 */
export function usePlacement() {
  const documentId = useDocumentId()

  function target() {
    const id = documentId.value
    return id ? { canvas: canvasOf(id), diagram: diagramStore(id) } : null
  }

  /** Canvas coordinate at the centre of the visible viewport. */
  function viewportCentre() {
    const to = target()
    const rect = to?.canvas.vueFlowRef.value?.getBoundingClientRect()
    if (!to || !rect) return { x: 0, y: 0 }
    return to.canvas.screenToFlowCoordinate({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  function place(item: PaletteItem, at?: { x: number; y: number }) {
    const to = target()
    if (!to) return null

    to.diagram.commit()
    to.diagram.endCoalesce()
    const node = to.diagram.addNode(item, at ?? viewportCentre())
    // Selecting the new node opens the inspector on it straight away.
    requestAnimationFrame(() => {
      const added = to.canvas.findNode(node.id)
      if (added) to.canvas.addSelectedNodes([added])
    })
    return node
  }

  function placeAtScreen(item: PaletteItem, screen: { x: number; y: number }) {
    const to = target()
    if (!to) return null
    return place(item, to.canvas.screenToFlowCoordinate(screen))
  }

  return { place, placeAtScreen, viewportCentre }
}
