import type { DiagramDocument, DiagramEdge, DiagramNode, Extrusion, ShapeKey } from '@/model'
import type { Box, Vec } from '@/features/diagram/lib/edge-path'
import { absoluteBoxes } from '@/features/diagram/lib/render-svg'

/**
 * The 3D view's layout: the 2D diagram exactly as the canvas lays it out, with
 * every node stood up where it is — facing the front, as the solid its shape is
 * a drawing of — and every connection an arch from the top of one node to the
 * top of the next, the way a message leaves one service and drops into another.
 *
 * Nothing is laid out anew here and nothing can be moved: a node stands in 3D
 * exactly where the canvas has it, so the 3D view is the same diagram looked at
 * from a different angle. Connections leave their 2D routes behind, though —
 * out of the top and into the top, every one of a node's from the same point
 * on it, so a node that talks to many reads as the hub it is.
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

/** How thick a node set to lie *flat* is: a floor marking, not a solid. */
export const FLAT_DEPTH = 3

/** How much thinner *Low* makes a standing node, front to back. */
const LOW_SLIM = 0.6

/**
 * The solid a standing node is, by its shape — the thing the 2D shape is a
 * drawing of. A database's drum is a cylinder standing on end, a queue a tube
 * lying on its side, a pill a capsule, a circle a ball. Every other shape is
 * a prism: its outline, made deep.
 */
export type SolidKind = 'prism' | 'drum' | 'tube' | 'capsule' | 'ball'

export function solidKind(shape: ShapeKey): SolidKind {
  switch (shape) {
    case 'cylinder':
      return 'drum'
    case 'queue':
      return 'tube'
    case 'pill':
      return 'capsule'
    case 'circle':
      return 'ball'
    default:
      return 'prism'
  }
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

export interface StackNode {
  node: DiagramNode
  /**
   * Its box on the canvas, in absolute canvas units. A node lying flat covers
   * it; one standing up stands across its middle.
   */
  box: Box
  /** How many zones it stands inside — each one's floor raises it. */
  depth: number
  /** Whether it stands up, facing the front; `false` for a zone or a node set to lie flat. */
  standing: boolean
  /** How high a standing node's post lifts it; `0` for one standing on its floor. */
  stand: number
  /** Front to back, standing; how thick, lying flat. `0` for a text annotation, which is only its face. */
  thickness: number
  /** How high its top is above its own floor, standing up: its post and its face. */
  height: number
}

export interface StackEdge {
  edge: DiagramEdge
  /**
   * How far the arc swings out to its left, in canvas units, so connections
   * between the same two nodes — a request and its reply — are told apart
   * rather than drawn on top of each other. `0` for a connection that is the
   * only one between its two nodes.
   */
  bow: number
}

export interface StackLayout {
  nodes: StackNode[]
  edges: StackEdge[]
  /** Every node's footprint, padded — the floor the diagram stands on. */
  footprint: Box
}

/** Room left around the content on the floor. */
const FLOOR_PADDING = 60

/** How far apart connections between the same two nodes swing, in canvas units. */
const BOW_STEP = 24

const isText = (node: DiagramNode) => node.kind === 'annotation' || node.shape === 'text'

/**
 * Whether a node stands up in 3D: every one but a zone, which is a floor with
 * walls, and one set to lie *flat*.
 */
export function standsUp(node: DiagramNode): boolean {
  return node.kind !== 'zone' && (node.extrusion ?? 'regular') !== 'flat'
}

/**
 * Front to back, standing up; thick, lying flat. A text annotation is only its
 * face, and a note a sheet of paper. A drum is exactly as deep as it is wide,
 * so its lid is a circle — at any setting, *Low* included, since a database
 * drawn oval reads as a mistake; a tube, a capsule and a ball are as deep as
 * they are tall. A prism is made as deep as most of its shorter side, within
 * reason.
 */
export function nodeThickness(node: DiagramNode): number {
  if (isText(node)) return 0
  const extrusion = node.extrusion ?? 'regular'
  if (extrusion === 'flat' || node.kind === 'zone') return FLAT_DEPTH
  if (node.shape === 'note') return 6
  const { width: w, height: h } = node.size
  const slim = extrusion === 'low' ? LOW_SLIM : 1
  switch (solidKind(node.shape)) {
    case 'drum':
      return w
    case 'tube':
    case 'capsule':
      return h * slim
    case 'ball':
      return Math.min(w, h) * slim
    default:
      return Math.min(80, Math.max(24, Math.min(w, h) * 0.75)) * slim
  }
}

/** How high a node's top is above its floor: a zone's walls, a flat node's thickness, a standing one's post and face. */
export function nodeHeight(node: DiagramNode): number {
  const extrusion = node.extrusion ?? 'regular'
  if (node.kind === 'zone') return ZONE_WALL[extrusion]
  if (!standsUp(node)) return nodeThickness(node)
  return STAND_HEIGHT[extrusion] + node.size.height
}

/** Every node, stood where the canvas has it. */
export function stackNodes(doc: DiagramDocument): StackNode[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const boxes = absoluteBoxes(doc)

  /** How many zones are around `node`; a parent cycle in a bad file ends the walk. */
  const depthOf = (node: DiagramNode) => {
    const seen = new Set([node.id])
    let parent = node.parent ? byId.get(node.parent) : undefined
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      parent = parent.parent ? byId.get(parent.parent) : undefined
    }
    return seen.size - 1
  }

  return doc.nodes.map((node) => {
    const standing = standsUp(node)
    return {
      node,
      box: boxes.get(node.id) ?? { x: node.position.x, y: node.position.y, ...node.size },
      depth: depthOf(node),
      standing,
      stand: standing ? STAND_HEIGHT[node.extrusion ?? 'regular'] : 0,
      thickness: nodeThickness(node),
      height: nodeHeight(node),
    }
  })
}

/**
 * How far each connection swings out to its left (see `StackEdge.bow`):
 * connections between the same two nodes, in either direction, fan out
 * evenly about the straight arc between them.
 */
export function edgeBows(edges: readonly DiagramEdge[]): Map<string, number> {
  const pairs = new Map<string, DiagramEdge[]>()
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('\n')
    const list = pairs.get(key)
    if (list) list.push(edge)
    else pairs.set(key, [edge])
  }
  const bows = new Map<string, number>()
  for (const list of pairs.values()) {
    // Measured in one direction for the whole pair, so a reply swings the
    // other way from its request rather than onto it.
    const first = [list[0]!.source, list[0]!.target].sort()[0]
    list.forEach((edge, i) => {
      const along = (i - (list.length - 1) / 2) * BOW_STEP
      bows.set(edge.id, edge.source === first ? along : -along)
    })
  }
  return bows
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
  const nodes = stackNodes(doc)
  const ids = new Set(nodes.map((n) => n.node.id))
  const drawn = doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  const bows = edgeBows(drawn)
  return {
    nodes,
    edges: drawn.map((edge) => ({ edge, bow: bows.get(edge.id) ?? 0 })),
    footprint: around(
      nodes.map((n) => n.box),
      FLOOR_PADDING,
    ),
  }
}

/* ------------------------------------------------------------------- arcs */

/**
 * Where on the floor plan every connection of `n`'s meets it — in and out
 * alike, one point, so a node reads as a hub its connections fan out of: the
 * middle of its top. A zone holds other nodes in its middle, so its point is
 * the middle of its back wall, over which a connection enters it.
 */
export function anchor(n: StackNode): Vec {
  const { box } = n
  const x = box.x + box.width / 2
  return n.node.kind === 'zone' ? { x, y: box.y } : { x, y: box.y + box.height / 2 }
}

/** How high an arch rises over the straight line between its ends, for the distance between them. */
export const arcHeight = (distance: number) => Math.max(30, distance * 0.28)

/**
 * A connection's arch from `from` to `to` — the tops of the two nodes it joins.
 * A parabola over the straight line between them: it leaves one top at a slant
 * and drops into the other at the same slant, at the same angle however long
 * it is, rising higher the farther it goes so it clears what stands in between.
 * It always arrives from above, even on a node raised on a post far over the
 * one it left. `bow` swings its middle out to its left (seen from `from`), to
 * tell apart connections between the same two nodes. A connection from a node
 * to itself loops up over its top.
 */
export function arcPoints(from: Vec3, to: Vec3, bow = 0, steps = 48): Vec3[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const distance = Math.hypot(dx, dz)
  const out: Vec3[] = []

  if (distance < 1) {
    // A loop standing on the node's top, out to one side and back.
    const turn = (bow / BOW_STEP) * 0.9
    const ux = Math.cos(turn)
    const uz = Math.sin(turn)
    const r = 26
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI * 2
      out.push({
        x: from.x + ux * r * Math.sin(a) + dx * (k / steps),
        y: from.y + r * 1.3 * (1 - Math.cos(a)) + dy * (k / steps),
        z: from.z + uz * r * Math.sin(a) + dz * (k / steps),
      })
    }
    return out
  }

  // High enough over the chord that the far end, however much higher, is reached from above.
  const rise = Math.max(arcHeight(distance), Math.abs(dy) / 4 + 20)
  const sx = (dz / distance) * bow
  const sz = (-dx / distance) * bow
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const lift = 4 * t * (1 - t)
    out.push({
      x: from.x + dx * t + sx * lift,
      y: from.y + dy * t + rise * lift,
      z: from.z + dz * t + sz * lift,
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
