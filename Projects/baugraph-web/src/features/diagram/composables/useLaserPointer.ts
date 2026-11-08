import type { Ref } from 'vue'
import { ref } from 'vue'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * The presentation laser pointer.
 *
 * A meeting aid rather than an editing tool: while it is on, the pointer leaves
 * a glowing dot and a short fading tail over the canvas, and holding the button
 * draws a stroke of "ink" that lingers a couple of seconds before fading — the
 * way you would circle a box on a whiteboard. It touches nothing in the
 * document, so it is kept out here rather than in `canvas`.
 *
 * State is per document: turning it on in one editor tab must not light up the
 * canvas of another.
 */

const active = new Map<string, Ref<boolean>>()

export function laserPointerOf(documentId: string) {
  let flag = active.get(documentId)
  if (!flag) {
    flag = ref(false)
    active.set(documentId, flag)
  }
  return { active: flag }
}

/** The laser pointer of the document this component's panel belongs to. */
export function useLaserPointer() {
  return laserPointerOf(useDiagram().documentId)
}
