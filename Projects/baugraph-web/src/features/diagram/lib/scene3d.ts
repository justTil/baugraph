import type { ColorKey, DiagramDocument, DiagramEdge, DiagramNode, Extrusion } from '@/model'
import { nodePlane, spacePositions } from '@/model'
import type { Box, Vec } from '@/features/diagram/lib/edge-path'
import { edgeGeometry } from '@/features/diagram/lib/edge-path'
import { absoluteBoxes } from '@/features/diagram/lib/render-svg'

/**
 * The 3D view's layout: the 2D diagram, stood up in layers — and every node on
 * it stood up too, off its back and facing the front, so it reads the way it
 * does on the canvas from wherever the stack is looked at.
 *
 * Nothing is laid out anew here. A node stands where it was placed in 3D, or —
 * until it is moved there — exactly where the 2D canvas has it, lifted onto the
 * plane it belongs to (see `model/space.ts`). So the 3D view opens as the same
 * diagram looked at from a different angle, and only parts ways with the canvas
 * where someone has moved something in 3D. A connection between two nodes on
 * one floor runs along that floor, on the very route the canvas draws for as
 * long as neither end has been moved; one between two floors becomes a cable
 * from one to the other, which is what makes a boundary crossing stand out.
 *
 * Pure and free of three.js on purpose: it is what the tests pin down, and it
 * keeps the 3D renderer's weight out of everything that only needs the numbers.
 *
 * Coordinates: canvas `x` stays `x`, canvas `y` becomes `z`, and `y` is up — so
 * a node's `position3d.z`, its height, is the world's `y`.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * How high each setting lifts a standing node off its floor, on a post — what
 * makes a *Tall* or a *Tower* node stand out over the rest. *Flat* is the one
 * setting that does not stand at all: the node lies on its back on the floor,
 * the way the canvas draws it.
 */
export const STAND_HEIGHT: Record<Extrusion, number> = {
  flat: 0,
  low: 0,
  regular: 0,
  tall: 48,
  tower: 110,
}

/** How deep a node is, front to back — or, lying flat, how thick. */
export const NODE_DEPTH: Record<Extrusion, number> = {
  flat: 3,
  low: 8,
  regular: 16,
  tall: 18,
  tower: 20,
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
  /**
   * Where it is on its plane — its box on the canvas, moved to its 3D place. A
   * node lying flat covers it; one standing up stands across its middle.
   */
  box: Box
  /** Absolute footprint on the 2D canvas, which `box` equals until the node is moved in 3D. */
  canvas: Box
  /**
   * What it takes up on its floor: all of `box` for a node lying flat or a
   * zone, a strip across the middle of it as deep as the node for one standing
   * up — which is what connections run up to and route around.
   */
  floor: Box
  level: number
  /** How many zones on the same plane it stands inside — each one's floor raises it. */
  depth: number
  /** How far its base is lifted off its plane: `position3d.z`, or its zone's. */
  elevation: number
  /** Whether it stands up, facing the front; `false` for a zone or a node set to lie flat. */
  standing: boolean
  /** How high a standing node's post lifts it; `0` for one standing on its floor. */
  stand: number
  /** Front to back, standing; how thick, lying flat. `0` for a text annotation, which is only its face. */
  thickness: number
  /** How high its top is above its own floor, standing up: its post and its face. */
  height: number
}

/**
 * How high above its plane one end of a connection meets its node: lying flat
 * — which every node does when the stack is seen from straight above — and
 * standing up.
 */
export interface EndHeight {
  flat: number
  up: number
}

export interface StackEdge {
  edge: DiagramEdge
  /** Levels of the two ends. */
  from: number
  to: number
  /**
   * The route along the floor, sampled into points, for a connection whose two
   * ends stand on the same floor — one plane, one height; `null` for a cable
   * between floors.
   */
  route: Vec[] | null
  /** Unit vectors out of each end along the route, for arrowheads. */
  startDir: Vec
  endDir: Vec
  /**
   * How high the route meets each end: a connection to a standing node plugs
   * into its side at its face's height, and one between two heights rises
   * from the one to the other along the way.
   */
  ends: [EndHeight, EndHeight]
}

export interface StackLayout {
  /** Ground first. Never empty: a diagram without planes has the one implicit plane. */
  planes: StackPlane[]
  nodes: StackNode[]
  edges: StackEdge[]
  /** Every node's footprint, padded — the size every plate is drawn at, so the stack lines up. */
  footprint: Box
  /**
   * Distance between neighbouring planes at the default spread. Taken from the
   * 2D layout, so moving nodes about in 3D never moves the planes under them.
   */
  gap: number
}

/** Room left around the content on each plate. */
const PLATE_PADDING = 60

const isText = (node: DiagramNode) => node.kind === 'annotation' || node.shape === 'text'

/**
 * Whether a node stands up in 3D: every one but a zone, which is a floor with
 * walls, and one set to lie *flat*.
 */
export function standsUp(node: DiagramNode): boolean {
  return node.kind !== 'zone' && (node.extrusion ?? 'regular') !== 'flat'
}

/** Front to back, standing up; thick, lying flat. A text annotation is only its face. */
export function nodeThickness(node: DiagramNode): number {
  return isText(node) ? 0 : NODE_DEPTH[node.extrusion ?? 'regular']
}

/** How high a node's top is above its floor: a zone's walls, a flat node's thickness, a standing one's post and face. */
export function nodeHeight(node: DiagramNode): number {
  const extrusion = node.extrusion ?? 'regular'
  if (node.kind === 'zone') return ZONE_WALL[extrusion]
  if (!standsUp(node)) return nodeThickness(node)
  return STAND_HEIGHT[extrusion] + node.size.height
}

/**
 * How high a connection runs over something lying on the floor: halfway up
 * it, so it meets its side rather than trailing under it — capped, so a zone's
 * walls do not lift what runs out of it into the air.
 */
const lyingLift = (height: number) => Math.min(14, Math.max(2, height / 2))

/** Two floors closer than this are one: a connection between them runs along it. */
const SAME_FLOOR = 0.5

/** The stack's planes, ground first, and every node stood on one of them. */
export function stackNodes(doc: DiagramDocument): { planes: StackPlane[]; nodes: StackNode[] } {
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
  const canvas = absoluteBoxes(doc)
  const space = spacePositions(doc.nodes)
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

  const nodes: StackNode[] = doc.nodes.map((node) => {
    const at = space.get(node.id)!
    const box = { x: at.x, y: at.y, width: node.size.width, height: node.size.height }
    const standing = standsUp(node)
    const thickness = nodeThickness(node)
    return {
      node,
      box,
      canvas: canvas.get(node.id)!,
      floor: standing ? standingFloor(box, thickness) : box,
      level: levelOf.get(node.id) ?? 0,
      depth: depthOf(node),
      elevation: at.z,
      standing,
      stand: standing ? STAND_HEIGHT[node.extrusion ?? 'regular'] : 0,
      thickness,
      height: nodeHeight(node),
    }
  })
  return { planes, nodes }
}

/**
 * The strip a standing node takes up on its floor: across the middle of its
 * box, as deep as the node — never so thin that a connection has nowhere on
 * it to attach.
 */
export function standingFloor(box: Box, thickness: number): Box {
  const deep = Math.max(thickness, 2)
  return { x: box.x, y: box.y + box.height / 2 - deep / 2, width: box.width, height: deep }
}

/** How far down a standing node's face a connection to its canvas top, or its bottom, meets it. */
const TOP_END = 0.12
const BOTTOM_END = 0.88

/**
 * How high above its plane a connection meets `n`, at `point` on its floor
 * strip, with `dir` pointing into the node there — as `edgeGeometry` gives it.
 *
 * A standing node is the canvas node stood up, so each canvas side keeps its
 * place: into a side it plugs in at the height its connection point has on
 * the canvas; one to the canvas top meets the back near the top, and one to
 * the canvas bottom the front near the foot — clear of the face's text in
 * between, which a line into the middle of the front would run across.
 */
export function endHeight(n: StackNode, point: Vec, dir: Vec): EndHeight {
  const base = n.depth * ZONE_FLOOR + n.elevation
  const flat = base + lyingLift(n.standing ? n.thickness : n.height)
  if (!n.standing) return { flat, up: flat }
  const h = n.node.size.height
  let fromTop: number
  if (Math.abs(dir.x) >= Math.abs(dir.y)) {
    // Down the strip is down the canvas side, which standing up is down the face.
    const along = n.floor.height > 0 ? (point.y - n.floor.y) / n.floor.height : 0.5
    fromTop = Math.min(1, Math.max(0, along))
  } else {
    fromTop = dir.y > 0 ? TOP_END : BOTTOM_END
  }
  return { flat, up: base + n.stand + h * (1 - fromTop) }
}

/** What a connection on a floor routes around: blocks, not zones or labels. */
export const isSolid = (n: StackNode) => n.node.kind !== 'zone' && n.node.kind !== 'annotation'

/** Whether two nodes stand on the same floor: one plane, one height. */
export const sameFloor = (a: StackNode, b: StackNode) =>
  a.level === b.level && Math.abs(a.elevation - b.elevation) < SAME_FLOOR

/** How far a node has been moved in 3D from its place on the canvas. */
const offset = (n: StackNode): Vec => ({ x: n.box.x - n.canvas.x, y: n.box.y - n.canvas.y })

/**
 * One connection, from where its two ends stand. `solids` are the blocks it
 * may have to route around; only the ones on its own floor are in the way.
 */
export function stackEdge(edge: DiagramEdge, source: StackNode, target: StackNode, solids: StackNode[]): StackEdge {
  if (!sameFloor(source, target)) {
    const centre = (n: StackNode) => ({ x: n.floor.x + n.floor.width / 2, y: n.floor.y + n.floor.height / 2 })
    const none = { x: 0, y: 0 }
    return {
      edge,
      from: source.level,
      to: target.level,
      route: null,
      startDir: none,
      endDir: none,
      ends: [endHeight(source, centre(source), none), endHeight(target, centre(target), none)],
    }
  }

  // Hand-placed bend points are canvas coordinates. They still hold while both
  // ends have moved together — a zone carried somewhere else in 3D — and are
  // shifted along with them; once the ends have parted ways in 3D they describe
  // a route between places neither node is at any more, and auto-routing wins.
  const a = offset(source)
  const b = offset(target)
  const together = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  const waypoints = together ? edge.waypoints?.map((p) => ({ x: p.x + a.x, y: p.y + a.y })) : undefined

  // Routed between what the nodes take up on their floor — a standing node's
  // strip — so a connection runs up to the node itself, not to where its face
  // would lie on the canvas.
  const geometry = edgeGeometry(source.floor, target.floor, {
    sourceSide: edge.sourceSide,
    targetSide: edge.targetSide,
    sourcePorts: source.node.ports,
    targetPorts: target.node.ports,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    route: edge.route,
    obstacles: solids
      .filter((n) => n !== source && n !== target && sameFloor(n, source))
      .map((n) => n.floor),
    waypoints,
  })
  return {
    edge,
    from: source.level,
    to: target.level,
    route: samplePath(geometry.path),
    startDir: geometry.startDir,
    endDir: geometry.endDir,
    ends: [endHeight(source, geometry.start, geometry.startDir), endHeight(target, geometry.end, geometry.endDir)],
  }
}

/**
 * Lifts a route along the floor to the heights it meets its two ends at: level
 * out of the one, level into the other, and an even rise in between — so a
 * connection between a node on a post and one on the floor slopes down
 * between them rather than kinking at either end.
 */
export function liftRoute(route: Vec[], from: number, to: number): Vec3[] {
  if (route.length < 2 || from === to) return route.map((p) => onPlane(p, from))
  const at = [0]
  for (let i = 1; i < route.length; i++) {
    at.push(at[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y))
  }
  const length = at.at(-1) || 1
  return route.map((p, i) => {
    const t = at[i]! / length
    const eased = t * t * (3 - 2 * t)
    return onPlane(p, from + (to - from) * eased)
  })
}

/** A box around every box, padded by `pad` on each side. */
function around(boxes: Box[], pad: number): Box {
  const x1 = boxes.length ? Math.min(...boxes.map((b) => b.x)) : -200
  const y1 = boxes.length ? Math.min(...boxes.map((b) => b.y)) : -150
  const x2 = boxes.length ? Math.max(...boxes.map((b) => b.x + b.width)) : 200
  const y2 = boxes.length ? Math.max(...boxes.map((b) => b.y + b.height)) : 150
  return { x: x1 - pad, y: y1 - pad, width: x2 - x1 + pad * 2, height: y2 - y1 + pad * 2 }
}

export function stackLayout(doc: DiagramDocument): StackLayout {
  const { planes, nodes } = stackNodes(doc)
  const stacked = new Map(nodes.map((n) => [n.node.id, n]))
  const solids = nodes.filter(isSolid)

  const edges: StackEdge[] = []
  for (const edge of doc.edges) {
    const source = stacked.get(edge.source)
    const target = stacked.get(edge.target)
    if (!source || !target) continue
    edges.push(stackEdge(edge, source, target, solids))
  }

  const footprint = around(
    nodes.map((n) => n.box),
    PLATE_PADDING,
  )

  // Far enough apart that a plane's tallest block never reaches the next one,
  // and in proportion to the diagram, so a wide landscape does not read as a
  // stack of pancakes and a small one does not tower. Measured on the canvas's
  // layout rather than the 3D one: dragging a node off to one side in 3D must
  // not lift or drop every plane in the stack when it is let go.
  const flat = around(
    nodes.map((n) => n.canvas),
    PLATE_PADDING,
  )
  const tallest = nodes.reduce((max, n) => Math.max(max, n.height), 0)
  const span = Math.max(flat.width, flat.height)
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
