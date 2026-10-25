import type { Box } from '@/features/diagram/lib/edge-path'

/**
 * Alignment snapping.
 *
 * The grid alone cannot line two nodes up: it quantises their top-left corners,
 * while what a diagram reads by is their centres — and two nodes of different
 * heights on the same grid never share one. Dragging therefore also snaps to the
 * edges and centres of the nodes already on the canvas, which is the alignment
 * the connectors between them are drawn from.
 */

export type Axis = 'x' | 'y'

/** A line drawn while a drag is held against something already on the canvas. */
export interface AlignGuide {
  axis: Axis
  /** Canvas coordinate of the line, on `axis`. */
  position: number
  /** Extent of the line along the other axis. */
  from: number
  to: number
}

export interface AlignSnap {
  dx: number
  dy: number
  guides: AlignGuide[]
}

const NONE: AlignSnap = { dx: 0, dy: 0, guides: [] }

/** How much a centre-on-centre hit is favoured over an edge hit, in units. */
const CENTRE_BIAS = 1.5

/** How far a guide runs past the boxes it connects, so the line reads as one. */
const GUIDE_OVERHANG = 14

/** Smallest bounding box around every dragged node. */
export function boundsOf(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes) {
    x1 = Math.min(x1, b.x)
    y1 = Math.min(y1, b.y)
    x2 = Math.max(x2, b.x + b.width)
    y2 = Math.max(y2, b.y + b.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** The three lines a box can be aligned by on one axis: near edge, centre, far edge. */
function marks(box: Box, axis: Axis): [number, number, number] {
  const start = axis === 'x' ? box.x : box.y
  const size = axis === 'x' ? box.width : box.height
  return [start, start + size / 2, start + size]
}

/** The nearest alignment within `tolerance`, or `null` if the drag is free. */
function nearest(moving: Box, others: Box[], axis: Axis, tolerance: number): number | null {
  const own = marks(moving, axis)
  let delta: number | null = null
  let score = Infinity
  for (const other of others) {
    const theirs = marks(other, axis)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const d = theirs[j]! - own[i]!
        if (Math.abs(d) > tolerance) continue
        const s = Math.abs(d) - (i === 1 && j === 1 ? CENTRE_BIAS : 0)
        if (s < score) {
          score = s
          delta = d
        }
      }
    }
  }
  return delta
}

/** Every line the snapped box now shares with a node on the canvas. */
function guidesFor(snapped: Box, others: Box[], axis: Axis): AlignGuide[] {
  const own = marks(snapped, axis)
  const lines = new Map<number, AlignGuide>()
  for (const other of others) {
    const hit = marks(other, axis).find((t) => own.some((o) => Math.abs(o - t) < 0.05))
    if (hit === undefined) continue
    const from = axis === 'x' ? Math.min(snapped.y, other.y) : Math.min(snapped.x, other.x)
    const to =
      axis === 'x'
        ? Math.max(snapped.y + snapped.height, other.y + other.height)
        : Math.max(snapped.x + snapped.width, other.x + other.width)
    const previous = lines.get(hit)
    lines.set(hit, {
      axis,
      position: hit,
      from: Math.min(previous?.from ?? Infinity, from - GUIDE_OVERHANG),
      to: Math.max(previous?.to ?? -Infinity, to + GUIDE_OVERHANG),
    })
  }
  return [...lines.values()]
}

/**
 * Where a drag wants to land: the offset that lines the dragged nodes up with
 * the rest of the diagram, and the guides to draw while it is held there.
 *
 * `moving` and `others` are absolute boxes; the offset is in the same units.
 */
export function alignSnap(moving: Box[], others: Box[], tolerance: number): AlignSnap {
  const bounds = boundsOf(moving)
  if (!bounds || !others.length || tolerance <= 0) return NONE

  const dx = nearest(bounds, others, 'x', tolerance)
  const dy = nearest(bounds, others, 'y', tolerance)
  if (dx === null && dy === null) return NONE

  const snapped = { ...bounds, x: bounds.x + (dx ?? 0), y: bounds.y + (dy ?? 0) }
  return {
    dx: dx ?? 0,
    dy: dy ?? 0,
    guides: [
      ...(dx === null ? [] : guidesFor(snapped, others, 'x')),
      ...(dy === null ? [] : guidesFor(snapped, others, 'y')),
    ],
  }
}
