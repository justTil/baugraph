import { createSharedComposable, useKeyModifier } from '@vueuse/core'

/**
 * Whether ⇧ is down, shared by every component that asks.
 *
 * Every node on the canvas wants to know — ⇧ turns a node's connection dots
 * from "drag to connect" into "drag to slide along the side", and the cursor
 * over them should say so before the press, not after. Shared, so a diagram of
 * two hundred nodes listens to the keyboard once rather than two hundred times.
 */
export const useShiftHeld = createSharedComposable(() =>
  useKeyModifier('Shift', { initial: false }),
)
