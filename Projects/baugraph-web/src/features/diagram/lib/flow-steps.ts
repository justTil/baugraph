/**
 * Rearranging a flow's steps.
 *
 * A flow's order is a list of steps, and a step is a list of connections that
 * travel at the same time. Everything the editor lets you do to that order is
 * one of the moves below, and each one is a pure function from one order to
 * the next — so the editor never mutates what the store holds, and every move
 * is a single undoable edit.
 *
 * The one rule they all share: a step left empty by a move disappears. That is
 * what lets a move be written as "take it out, put it in" against the indices
 * of the order as it was, without first working out how the removal shifted
 * everything after it.
 */

/** Where a dragged connection is dropped: into a step, or between two of them. */
export type StepTarget =
  /** Travel at the same time as everything in step `join`. */
  | { join: number }
  /** Become a step of its own, in front of step `gap` (`steps.length` for last). */
  | { gap: number }

const tidy = (steps: string[][]) => steps.filter((step) => step.length > 0)

/** The index of the step `edge` is in, or `-1`. */
export function stepIndexOf(steps: readonly (readonly string[])[], edge: string): number {
  return steps.findIndex((step) => step.includes(edge))
}

/** Moves `edge` into a step, or into a step of its own between two others. */
export function moveToStep(
  steps: readonly (readonly string[])[],
  edge: string,
  target: StepTarget,
): string[][] {
  const next = steps.map((step) => step.filter((id) => id !== edge))
  if ('join' in target) {
    const step = next[target.join]
    if (!step) return steps.map((s) => [...s])
    step.push(edge)
  } else {
    next.splice(Math.max(0, Math.min(target.gap, next.length)), 0, [edge])
  }
  return tidy(next)
}

/**
 * One place earlier. A connection sharing its step is lifted out in front of
 * it — it now goes first, on its own — and one alone in its step swaps with the
 * step before. Never a merge: "earlier" should not quietly mean "together".
 */
export function moveEarlier(steps: readonly (readonly string[])[], edge: string): string[][] {
  const at = stepIndexOf(steps, edge)
  if (at < 0) return steps.map((s) => [...s])
  if (steps[at]!.length > 1) return moveToStep(steps, edge, { gap: at })
  if (at === 0) return steps.map((s) => [...s])
  return moveToStep(steps, edge, { gap: at - 1 })
}

/** One place later; the mirror of {@link moveEarlier}. */
export function moveLater(steps: readonly (readonly string[])[], edge: string): string[][] {
  const at = stepIndexOf(steps, edge)
  if (at < 0) return steps.map((s) => [...s])
  if (steps[at]!.length > 1) return moveToStep(steps, edge, { gap: at + 1 })
  if (at === steps.length - 1) return steps.map((s) => [...s])
  return moveToStep(steps, edge, { gap: at + 2 })
}

/** Whether {@link moveEarlier} would change anything. */
export function canMoveEarlier(steps: readonly (readonly string[])[], edge: string): boolean {
  const at = stepIndexOf(steps, edge)
  return at > 0 || (at === 0 && steps[0]!.length > 1)
}

/** Whether {@link moveLater} would change anything. */
export function canMoveLater(steps: readonly (readonly string[])[], edge: string): boolean {
  const at = stepIndexOf(steps, edge)
  return at >= 0 && (at < steps.length - 1 || steps[at]!.length > 1)
}

/** Step `index` and the one after it, made one: they now travel together. */
export function joinWithNext(steps: readonly (readonly string[])[], index: number): string[][] {
  const next = steps.map((s) => [...s])
  if (index < 0 || index >= next.length - 1) return next
  next.splice(index, 2, [...next[index]!, ...next[index + 1]!])
  return next
}

/** Step `index` taken apart, its connections one after another in the order shown. */
export function splitStep(steps: readonly (readonly string[])[], index: number): string[][] {
  const next = steps.map((s) => [...s])
  const step = next[index]
  if (!step || step.length < 2) return next
  next.splice(index, 1, ...step.map((edge) => [edge]))
  return next
}

/** Whether two orders say the same thing. */
export function sameSteps(
  a: readonly (readonly string[])[],
  b: readonly (readonly string[])[],
): boolean {
  return (
    a.length === b.length &&
    a.every((step, i) => step.length === b[i]!.length && step.every((id, j) => id === b[i]![j]))
  )
}
