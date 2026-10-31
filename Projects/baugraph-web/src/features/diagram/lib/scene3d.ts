import type { ColorKey, DiagramDocument, DiagramEdge, DiagramNode, Extrusion } from '@/model'
import { nodePlane } from '@/model'
import type { Box, Vec } from '@/features/diagram/lib/edge-path'
import { edgeGeometry } from '@/features/diagram/lib/edge-path'
import { absoluteBoxes } from '@/features/diagram/lib/render-svg'

/**
 * The 3D view's layout: the 2D diagram, stood up in layers.
 *
 * Nothing is laid out anew here. Every node keeps the position it has on the 2D
 * canvas and only gains a height — the level of the plane it stands on — so the
 * 3D view is the same diagram looked at from a different angle, never a second
 * arrangement of it that could drift. A connection between two nodes on one
 * plane keeps the very route the canvas draws; one between two planes becomes a
 * cable from one level to the other, which is what makes a boundary crossing
 * stand out.
 *
 * Pure and free of three.js on purpose: it is what the tests pin down, and it
 * keeps the 3D renderer's weight out of everything that only needs the numbers.
 *
 * Coordinates: canvas `x` stays `x`, canvas `y` becomes `z`, and `y` is up.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** How tall each extrusion setting stands, in canvas units. */
export const EXTRUSION_HEIGHT: Record<Extrusion, number> = {
  flat: 3,
  low: 12,
  regular: 24,
  tall: 52,
  tower: 96,
}

/**
 * A zone is a floor with glass walls rather than a block, and its walls are
 * kept lower than a node of the same setting would stand — it surrounds what
 * it holds instead of hiding it.
 */
export const ZONE_WALL: Record<Extrusion, number> = {
  flat: 0,
  low: 6,
  regular: 12,
  tall: 28,
  tower: 52,
}

/** Thickness of a zone's floor; a node inside a zone stands on top of it. */
export const ZONE_FLOOR = 1.6

export interface StackPlane {
  /** `null` for the one implicit plane of a diagram that defines none. */
  id: string | null
  label: string
  color: ColorKey
  /** Position in the stack, ground = 0. */
  level: number
  /** How many nodes stand on it, zones included. */
  count: number
}

export interface StackNode {
  node: DiagramNode
  /** Absolute footprint on the canvas. */
  box: Box
  level: number
  /** How many zones on the same plane it stands inside — each one's floor raises it. */
  depth: number
  /** Height above its own floor. */
  height: number
}

export interface StackEdge {
  edge: DiagramEdge
  /** Levels of the two ends. */
  from: number
  to: number
  /**
   * The route the 2D canvas draws, sampled into points, for a connection whose
   * two ends share a plane; `null` for one that crosses between planes.
   */
  route: Vec[] | null
  /** Unit vectors out of each end along the route, for arrowheads. */
  startDir: Vec
  endDir: Vec
  /** Height above the plane an in-plane route runs at. */
  lift: number
}

export interface StackLayout {
  /** Ground first. Never empty: a diagram without planes has the one implicit plane. */
  planes: StackPlane[]
  nodes: StackNode[]
  edges: StackEdge[]
  /** Every node's footprint, padded — the size every plate is drawn at, so the stack lines up. */
  footprint: Box
  /** Distance between neighbouring planes at the default spread. */
  gap: number
}

/** Room left around the content on each plate. */
const PLATE_PADDING = 60

/** How tall a node stands off its floor. A text annotation is a label, not a block. */
export function nodeHeight(node: DiagramNode): number {
  const extrusion = node.extrusion ?? 'regular'
  if (node.kind === 'zone') return ZONE_WALL[extrusion]
  if (node.kind === 'annotation' || node.shape === 'text') return 0
  return EXTRUSION_HEIGHT[extrusion]
}

/**
 * Where an in-plane connection runs: halfway up the lower of the two blocks it
 * joins, so it plugs into their sides rather than trailing along the floor —
 * capped, so a tower does not lift its connections into the air.
 */
export function edgeLift(sourceHeight: number, targetHeight: number): number {
  return Math.min(14, Math.max(2, Math.min(sourceHeight, targetHeight) / 2))
}

export function stackLayout(doc: DiagramDocument): StackLayout {
  const declared = doc.planes ?? []
  const planes: StackPlane[] = declared.length
    ? declared.map((plane, level) => ({
        id: plane.id,
        label: plane.label,
        color: plane.color ?? 'slate',
        level,
        count: 0,
      }))
    : [{ id: null, label: '', color: 'slate', level: 0, count: 0 }]

  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const boxes = absoluteBoxes(doc)
  const levelOf = new Map<string, number>()
  for (const node of doc.nodes) {
    const plane = nodePlane(node.id, (id) => byId.get(id), declared)
    const level = Math.max(0, declared.findIndex((p) => p.id === plane))
    levelOf.set(node.id, level)
    planes[level]!.count++
  }

  /** Zones around `node` on its own plane; one on another plane does not raise it. */
  const depthOf = (node: DiagramNode) => {
    let depth = 0
    const seen = new Set([node.id])
    let parent = node.parent ? byId.get(node.parent) : undefined
    while (parent && !seen.has(parent.id)) {
      if (levelOf.get(parent.id) === levelOf.get(node.id)) depth++
      seen.add(parent.id)
      parent = parent.parent ? byId.get(parent.parent) : undefined
    }
    return depth
  }

  const nodes: StackNode[] = doc.nodes.map((node) => ({
    node,
    box: boxes.get(node.id)!,
    level: levelOf.get(node.id) ?? 0,
    depth: depthOf(node),
    height: nodeHeight(node),
  }))
  const stacked = new Map(nodes.map((n) => [n.node.id, n]))

  // The same obstacles the canvas routes around, narrowed to one plane: a node
  // standing on another level is not in the way of anything down here.
  const solids = nodes.filter((n) => n.node.kind !== 'zone' && n.node.kind !== 'annotation')

  const edges: StackEdge[] = []
  for (const edge of doc.edges) {
    const source = stacked.get(edge.source)
    const target = stacked.get(edge.target)
    if (!source || !target) continue

    const lift = edgeLift(source.height || 24, target.height || 24)
    if (source.level !== target.level) {
      edges.push({
        edge,
        from: source.level,
        to: target.level,
        route: null,
        startDir: { x: 0, y: 0 },
        endDir: { x: 0, y: 0 },
        lift,
      })
      continue
    }

    const geometry = edgeGeometry(source.box, target.box, {
      sourceSide: edge.sourceSide,
      targetSide: edge.targetSide,
      sourcePorts: source.node.ports,
      targetPorts: target.node.ports,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      route: edge.route,
      obstacles: solids
        .filter((n) => n.level === source.level && n !== source && n !== target)
        .map((n) => n.box),
      waypoints: edge.waypoints,
    })
    edges.push({
      edge,
      from: source.level,
      to: target.level,
      route: samplePath(geometry.path),
      startDir: geometry.startDir,
      endDir: geometry.endDir,
      lift,
    })
  }

  const all = nodes.map((n) => n.box)
  const x1 = all.length ? Math.min(...all.map((b) => b.x)) : -200
  const y1 = all.length ? Math.min(...all.map((b) => b.y)) : -150
  const x2 = all.length ? Math.max(...all.map((b) => b.x + b.width)) : 200
  const y2 = all.length ? Math.max(...all.map((b) => b.y + b.height)) : 150
  const footprint = {
    x: x1 - PLATE_PADDING,
    y: y1 - PLATE_PADDING,
    width: x2 - x1 + PLATE_PADDING * 2,
    height: y2 - y1 + PLATE_PADDING * 2,
  }

  // Far enough apart that a plane's tallest block never reaches the next one,
  // and in proportion to the diagram, so a wide landscape does not read as a
  // stack of pancakes and a small one does not tower.
  const tallest = nodes.reduce((max, n) => Math.max(max, n.height), 0)
  const span = Math.max(footprint.width, footprint.height)
  const gap = Math.min(520, Math.max(150, span * 0.2)) + tallest

  return { planes, nodes, edges, footprint, gap }
}

/* ------------------------------------------------------------------ paths */

/**
 * Samples an SVG path into points, `step` canvas units apart or closer.
 *
 * Only the commands `edge-path.ts` writes — absolute `M`, `L`, `Q` and `C` — are
 * understood. That is all a connection's path ever holds, and it keeps the 3D
 * view on the exact route the canvas draws, rounded corners and curves
 * included, without a DOM to measure it against.
 */
export function samplePath(d: string, step = 6): Vec[] {
  const tokens = d.match(/[MLQC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const points: Vec[] = []
  let cursor: Vec = { x: 0, y: 0 }
  let i = 0
  const num = () => Number(tokens[i++])
  const pt = (): Vec => ({ x: num(), y: num() })

  const push = (p: Vec) => {
    const last = points.at(-1)
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) points.push(p)
  }

  while (i < tokens.length) {
    const command = tokens[i++]!.toUpperCase()
    if (command === 'M') {
      cursor = pt()
      push(cursor)
    } else if (command === 'L') {
      const to = pt()
      const n = Math.max(1, Math.ceil(Math.hypot(to.x - cursor.x, to.y - cursor.y) / step))
      for (let k = 1; k <= n; k++) {
        push({ x: cursor.x + ((to.x - cursor.x) * k) / n, y: cursor.y + ((to.y - cursor.y) * k) / n })
      }
      cursor = to
    } else if (command === 'Q') {
      const c = pt()
      const to = pt()
      const n = Math.max(2, Math.ceil((dist(cursor, c) + dist(c, to)) / step))
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const m = 1 - t
        push({
          x: m * m * cursor.x + 2 * m * t * c.x + t * t * to.x,
          y: m * m * cursor.y + 2 * m * t * c.y + t * t * to.y,
        })
      }
      cursor = to
    } else if (command === 'C') {
      const c1 = pt()
      const c2 = pt()
      const to = pt()
      const n = Math.max(4, Math.ceil((dist(cursor, c1) + dist(c1, c2) + dist(c2, to)) / step))
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const m = 1 - t
        push({
          x: m * m * m * cursor.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * to.x,
          y: m * m * m * cursor.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * to.y,
        })
      }
      cursor = to
    } else {
      // Something this was never written for: stop rather than misread the rest.
      break
    }
  }
  return points
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * A connection between two planes: it leaves its node straight up (or down),
 * swings across, and arrives straight down (or up) into the other — a cable
 * between floors rather than a diagonal through the stack, so it reads as
 * "crosses a boundary" from any angle.
 */
export function cablePoints(from: Vec3, to: Vec3, steps = 32): Vec3[] {
  const reach = Math.abs(to.y - from.y) * 0.55
  const sign = to.y >= from.y ? 1 : -1
  const c1 = { x: from.x, y: from.y + sign * reach, z: from.z }
  const c2 = { x: to.x, y: to.y - sign * reach, z: to.z }
  const out: Vec3[] = []
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const m = 1 - t
    const a = m * m * m
    const b = 3 * m * m * t
    const c = 3 * m * t * t
    const e = t * t * t
    out.push({
      x: a * from.x + b * c1.x + c * c2.x + e * to.x,
      y: a * from.y + b * c1.y + c * c2.y + e * to.y,
      z: a * from.z + b * c1.z + c * c2.z + e * to.z,
    })
  }
  return out
}

/* ------------------------------------------------------------------ tracks */

/**
 * A line through 3D space that something can be placed along by distance —
 * what a message rides. Precomputed once per connection, so placing every
 * message every frame is a binary search rather than a walk.
 */
export interface Track {
  points: Vec3[]
  /** Distance from the first point to each point. */
  at: number[]
  length: number
}

export function track(points: Vec3[]): Track {
  const at = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    at.push(at[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
  }
  return { points, at, length: at.at(-1) ?? 0 }
}

/** The point `progress` (0–1) of the way along `t`, written into `out`. */
export function pointOnTrack(t: Track, progress: number, out: Vec3): Vec3 {
  const { points, at } = t
  if (points.length < 2) {
    const only = points[0] ?? { x: 0, y: 0, z: 0 }
    out.x = only.x
    out.y = only.y
    out.z = only.z
    return out
  }
  const want = Math.min(1, Math.max(0, progress)) * t.length
  let lo = 0
  let hi = at.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (at[mid]! <= want) lo = mid
    else hi = mid
  }
  const a = points[lo]!
  const b = points[hi]!
  const span = at[hi]! - at[lo]!
  const f = span ? (want - at[lo]!) / span : 0
  out.x = a.x + (b.x - a.x) * f
  out.y = a.y + (b.y - a.y) * f
  out.z = a.z + (b.z - a.z) * f
  return out
}

/** Lifts a canvas point onto the plane at height `y`. */
export const onPlane = (p: Vec, y: number): Vec3 => ({ x: p.x, y, z: p.y })
