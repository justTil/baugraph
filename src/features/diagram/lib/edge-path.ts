import type { Route, Side } from '@/model'
import { EDGE_PX } from '@/features/diagram/lib/theme'

/**
 * Edge routing.
 *
 * Vue Flow's built-in path helpers only know handle coordinates; Baugraph needs
 * `auto` side resolution, self-loops and a shared implementation between the
 * canvas and the SVG export, so the geometry is computed here from node boxes.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Vec {
  x: number
  y: number
}

export interface EdgeGeometry {
  /** SVG path data for the connector. */
  path: string
  /** Midpoint of the path, where the label sits. */
  mid: Vec
  start: Vec
  end: Vec
  /** Unit vectors pointing outwards at each end, for arrowheads. */
  startDir: Vec
  endDir: Vec
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The point and outward normal where a connector meets one side of a box. */
interface Anchor {
  point: Vec
  normal: Vec
}

function anchor(box: Box, side: Exclude<Side, 'auto'>): Anchor {
  const { x, y, width: w, height: h } = box
  switch (side) {
    case 'top':
      return { point: { x: x + w / 2, y }, normal: { x: 0, y: -1 } }
    case 'bottom':
      return { point: { x: x + w / 2, y: y + h }, normal: { x: 0, y: 1 } }
    case 'left':
      return { point: { x, y: y + h / 2 }, normal: { x: -1, y: 0 } }
    default:
      return { point: { x: x + w, y: y + h / 2 }, normal: { x: 1, y: 0 } }
  }
}

/** Picks the side of `from` that faces `to`. */
export function autoSide(from: Box, to: Box): Exclude<Side, 'auto'> {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/** Rounds the corners of a polyline. */
function polylinePath(points: Vec[], radius: number): string {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last || points.length < 2) return ''

  let d = `M${first.x},${first.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const a = points[i - 1]!
    const b = points[i + 1]!
    const l1 = Math.hypot(p.x - a.x, p.y - a.y)
    const l2 = Math.hypot(b.x - p.x, b.y - p.y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r < 1) {
      d += `L${p.x},${p.y}`
      continue
    }
    const u1 = { x: (p.x - a.x) / (l1 || 1), y: (p.y - a.y) / (l1 || 1) }
    const u2 = { x: (b.x - p.x) / (l2 || 1), y: (b.y - p.y) / (l2 || 1) }
    d += `L${p.x - u1.x * r},${p.y - u1.y * r}Q${p.x},${p.y} ${p.x + u2.x * r},${p.y + u2.y * r}`
  }
  return `${d}L${last.x},${last.y}`
}

function polylineMid(points: Vec[]): Vec {
  const first = points[0]
  if (!first) return { x: 0, y: 0 }

  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(l)
    total += l
  }

  let remaining = total / 2
  for (let i = 0; i < lengths.length; i++) {
    const segment = lengths[i]!
    if (remaining <= segment || i === lengths.length - 1) {
      const a = points[i]!
      const b = points[i + 1]!
      const t = segment ? remaining / segment : 0
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= segment
  }
  return first
}

function bezierPoint(a: Vec, b: Vec, c: Vec, d: Vec, t: number): Vec {
  const m = 1 - t
  return {
    x: m * m * m * a.x + 3 * m * m * t * b.x + 3 * m * t * t * c.x + t * t * t * d.x,
    y: m * m * m * a.y + 3 * m * m * t * b.y + 3 * m * t * t * c.y + t * t * t * d.y,
  }
}

/** An edge whose source and target are the same node loops out of its top-right. */
function selfLoop(box: Box): EdgeGeometry {
  const sx = box.x + box.width
  const sy = box.y + box.height * 0.3
  const ex = box.x + box.width * 0.7
  const ey = box.y - 2
  return {
    path: `M${sx},${sy}C${sx + 62},${sy - 26} ${ex + 40},${ey - 52} ${ex},${ey}`,
    mid: { x: sx + 30, y: ey - 32 },
    start: { x: sx, y: sy },
    end: { x: ex, y: ey },
    startDir: { x: 1, y: -0.4 },
    endDir: { x: -0.6, y: 0.8 },
  }
}

/**
 * How far apart two facing anchors may sit before the connector keeps the offset.
 *
 * Two nodes of different heights almost never share a centre line: a couple of
 * pixels is enough for a curved connector to visibly S-bend, or an orthogonal
 * one to grow a jog nobody asked for. Within this much, both ends are pulled
 * onto one shared line and the connector comes out straight — the design that
 * was intended, without demanding the impossible of the grid.
 */
const ALIGN_TOLERANCE = 14

/**
 * Pulls two facing anchors onto a shared line when they are nearly aligned.
 *
 * Only ends that face along the same axis qualify (left/right against
 * left/right, top/bottom against top/bottom); the shared line is the average of
 * the two, clamped so neither anchor leaves the side it sits on.
 */
function align(source: Box, target: Box, sa: Anchor, ta: Anchor): void {
  const horizontal = sa.normal.x !== 0 && ta.normal.x !== 0
  const vertical = sa.normal.y !== 0 && ta.normal.y !== 0
  if (!horizontal && !vertical) return

  const axis = horizontal ? 'y' : 'x'
  const offset = ta.point[axis] - sa.point[axis]
  if (offset === 0 || Math.abs(offset) > ALIGN_TOLERANCE) return

  const lo = horizontal ? Math.max(source.y, target.y) : Math.max(source.x, target.x)
  const hi = horizontal
    ? Math.min(source.y + source.height, target.y + target.height)
    : Math.min(source.x + source.width, target.x + target.width)
  if (hi <= lo) return

  const shared = clamp((sa.point[axis] + ta.point[axis]) / 2, lo, hi)
  sa.point[axis] = shared
  ta.point[axis] = shared
}

export interface EdgeRouteOptions {
  sourceSide: Side
  targetSide: Side
  route: Route
}

export function edgeGeometry(
  source: Box,
  target: Box,
  { sourceSide, targetSide, route }: EdgeRouteOptions,
): EdgeGeometry {
  if (source === target || (source.x === target.x && source.y === target.y && source.width === target.width)) {
    return selfLoop(source)
  }

  const sa = anchor(source, sourceSide === 'auto' ? autoSide(source, target) : sourceSide)
  const ta = anchor(target, targetSide === 'auto' ? autoSide(target, source) : targetSide)
  align(source, target, sa, ta)

  const gap = 2
  const s: Vec = { x: sa.point.x + sa.normal.x * gap, y: sa.point.y + sa.normal.y * gap }
  const t: Vec = { x: ta.point.x + ta.normal.x * gap, y: ta.point.y + ta.normal.y * gap }

  if (route === 'straight') {
    const dx = t.x - s.x
    const dy = t.y - s.y
    const len = Math.hypot(dx, dy) || 1
    return {
      path: `M${s.x},${s.y}L${t.x},${t.y}`,
      mid: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 },
      start: s,
      end: t,
      startDir: { x: -dx / len, y: -dy / len },
      endDir: { x: dx / len, y: dy / len },
    }
  }

  if (route === 'curved') {
    const reach = clamp(Math.hypot(t.x - s.x, t.y - s.y) * 0.42, 34, 150)
    const c1 = { x: s.x + sa.normal.x * reach, y: s.y + sa.normal.y * reach }
    const c2 = { x: t.x + ta.normal.x * reach, y: t.y + ta.normal.y * reach }
    const nearEnd = bezierPoint(s, c1, c2, t, 0.96)
    const nearStart = bezierPoint(s, c1, c2, t, 0.04)
    const le = Math.hypot(t.x - nearEnd.x, t.y - nearEnd.y) || 1
    const ls = Math.hypot(s.x - nearStart.x, s.y - nearStart.y) || 1
    return {
      path: `M${s.x},${s.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`,
      mid: bezierPoint(s, c1, c2, t, 0.5),
      start: s,
      end: t,
      startDir: { x: (s.x - nearStart.x) / ls, y: (s.y - nearStart.y) / ls },
      endDir: { x: (t.x - nearEnd.x) / le, y: (t.y - nearEnd.y) / le },
    }
  }

  /* orthogonal */
  const stub = 22
  const s1 = { x: s.x + sa.normal.x * stub, y: s.y + sa.normal.y * stub }
  const t1 = { x: t.x + ta.normal.x * stub, y: t.y + ta.normal.y * stub }
  const sourceHorizontal = sa.normal.x !== 0
  const targetHorizontal = ta.normal.x !== 0

  const points: Vec[] = [s, s1]
  if (sourceHorizontal && targetHorizontal) {
    if (Math.abs(s1.y - t1.y) >= 1) {
      const mx = (s1.x + t1.x) / 2
      points.push({ x: mx, y: s1.y }, { x: mx, y: t1.y })
    }
  } else if (!sourceHorizontal && !targetHorizontal) {
    if (Math.abs(s1.x - t1.x) > 1) {
      const my = (s1.y + t1.y) / 2
      points.push({ x: s1.x, y: my }, { x: t1.x, y: my })
    }
  } else if (sourceHorizontal) {
    points.push({ x: t1.x, y: s1.y })
  } else {
    points.push({ x: s1.x, y: t1.y })
  }
  points.push(t1, t)

  const cleaned = points.filter((p, i) => {
    const previous = points[i - 1]
    return !previous || Math.abs(p.x - previous.x) > 0.5 || Math.abs(p.y - previous.y) > 0.5
  })
  const last = cleaned.at(-1) ?? t
  const beforeLast = cleaned.at(-2) ?? last
  const le = Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y) || 1
  const first = cleaned[0] ?? s
  const afterFirst = cleaned[1] ?? first
  const ls = Math.hypot(afterFirst.x - first.x, afterFirst.y - first.y) || 1

  return {
    path: polylinePath(cleaned, 10),
    mid: polylineMid(cleaned),
    start: first,
    end: last,
    startDir: { x: (first.x - afterFirst.x) / ls, y: (first.y - afterFirst.y) / ls },
    endDir: { x: (last.x - beforeLast.x) / le, y: (last.y - beforeLast.y) / le },
  }
}

/** Triangular arrowhead pointing along `dir`, with its tip at `point`. */
export function arrowHeadPath(point: Vec, dir: Vec, stroke = EDGE_PX.regular): string {
  // The head follows the line's weight, but not one-for-one: a thick connection
  // wants a bigger arrow to keep its point, not one two and a half times the
  // size of everything else on the diagram.
  const scale = 1 + Math.max(0, stroke - EDGE_PX.regular) * 0.22
  const length = 10 * scale
  const halfWidth = 4.6 * scale
  const n = { x: -dir.y, y: dir.x }
  const base = { x: point.x - dir.x * length, y: point.y - dir.y * length }
  return (
    `M${point.x},${point.y}` +
    `L${base.x + n.x * halfWidth},${base.y + n.y * halfWidth}` +
    `L${base.x - n.x * halfWidth},${base.y - n.y * halfWidth}Z`
  )
}

/**
 * Dash pattern for a line style, or `undefined` for solid.
 *
 * The pattern scales with the line's weight. Left fixed, a thick dotted line
 * closes up into a solid one — the dots grow with the stroke while the gaps
 * between them do not.
 */
export function dashArray(
  line: 'solid' | 'dashed' | 'dotted',
  stroke = EDGE_PX.regular,
): string | undefined {
  const f = stroke / EDGE_PX.regular
  const pattern = line === 'dashed' ? [8, 5] : line === 'dotted' ? [1.5, 4.5] : null
  if (!pattern) return undefined
  return pattern.map((n) => Math.round(n * f * 100) / 100).join(' ')
}
