import type { Ref, ShallowRef } from 'vue'
import { ref, shallowRef } from 'vue'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

/**
 * The 3D view of one open diagram.
 *
 * A way of looking at the diagram rather than a part of it: whether it is on,
 * how far apart the planes stand, which flow is in the spotlight. None of it is
 * written to the file — the same as the 2D viewport — so a diagram opens flat
 * every time, and the 3D view is always something chosen on top of it.
 *
 * State is per document: switching one tab to 3D must not switch another.
 */

/** Where the camera can be sent in one move. */
export type CameraPreset = 'iso' | 'top' | 'side'

/**
 * What the canvas, the toolbar and the keyboard can ask of the 3D scene. The
 * scene registers these while it is mounted — it is loaded lazily, with three.js
 * behind it, so nothing else may reach into it directly.
 */
export interface View3DCommands {
  /** Brings the whole stack into view. */
  frame(): void
  view(preset: CameraPreset): void
  /** Moves the camera in (`< 1`) or out (`> 1`) by a factor of its distance. */
  zoom(factor: number): void
  /** Flies to one plane of the stack. */
  focusPlane(id: string): void
  /** The current frame as a PNG. */
  snapshot(): Promise<Blob | null>
}

export interface View3DState {
  active: Ref<boolean>
  /** How far apart the planes stand: `0` lays them flat on each other, `1` is the default. */
  spread: Ref<number>
  /** A slow turntable, for leaving a diagram on screen while talking over it. */
  autoRotate: Ref<boolean>
  /** Whether connection labels are drawn. Off thins out a busy stack. */
  labels: Ref<boolean>
  /** The one flow drawn at full strength, everything else dimmed. `null` shows them all. */
  spotlight: Ref<string | null>
  /** Planes taken out of the view — not out of the diagram. */
  hiddenPlanes: Ref<string[]>
  commands: ShallowRef<View3DCommands | null>
}

const states = new Map<string, View3DState>()

export function view3DOf(documentId: string): View3DState {
  let state = states.get(documentId)
  if (!state) {
    state = {
      active: ref(false),
      spread: ref(1),
      autoRotate: ref(false),
      labels: ref(true),
      spotlight: ref(null),
      hiddenPlanes: ref([]),
      commands: shallowRef(null),
    }
    states.set(documentId, state)
  }
  return state
}

export function disposeView3D(documentId: string) {
  states.delete(documentId)
}

/**
 * Steps the spotlight through `flows` and back out to "all of them": one press
 * per flow, which is how a presenter walks a room through a diagram's traffic.
 */
export function nextSpotlight(current: string | null, flows: string[], by: -1 | 1): string | null {
  if (!flows.length) return null
  // `null` sits at both ends of the cycle, between the last flow and the first.
  const ring: (string | null)[] = [null, ...flows]
  const at = Math.max(0, ring.indexOf(current))
  return ring[(at + by + ring.length) % ring.length] ?? null
}

/** The 3D view of the document this component's panel belongs to. */
export function useView3D(): View3DState {
  return view3DOf(useDiagram().documentId)
}
