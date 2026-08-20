import type { NodePorts, PortSide, Route, Side } from '@/model'
import { nodePorts, PORT_SIDES } from '@/model'
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

/**
 * Splits a Vue Flow handle id — `right:3` — back into the side and the
 * connection point on it a drag actually touched. Anything unrecognised is
 * `auto`, which is what a connection to a node with no dots of its own (a
 * zone) comes out as, and what the fixed end of a reconnect drag comes out as
 * too — Baugraph's own edges never carry a concrete handle id of their own
 * (see `toVueFlowEdge`), so that end has to fall back on its stored side.
 */
export function endpointOf(handleId: string | null | undefined): { side: Side; port: number } {
  const [side, port] = (handleId ?? '').split(':')
  if (!PORT_SIDES.includes(side as PortSide)) return { side: 'auto', port: 1 }
  return { side: side as Side, port: Number(port) || 1 }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The point and outward normal where a connector meets one side of a box. */
interface Anchor {
  point: Vec
  normal: Vec
}

/**
 * Where along its side the `port`-th of `count` connection points sits, as a
 * fraction of that side's length.
 *
 * Evenly spread, which is what lets a node store the *count* alone: one point
 * lands at the middle exactly where it always did, and the whole set slides with
 * the side as the node is resized. Ports are 1-based, as the file states them,
 * and an index past the end falls back to the last point that exists — a side
 * that has since been narrowed leaves connections attached rather than adrift.
 */
function portFraction(count: number, port: number): number {
  const n = Math.max(1, Math.round(count))
  return clamp(Math.round(port), 1, n) / (n + 1)
}

function anchor(box: Box, side: PortSide, count = 1, port = 1): Anchor {
  const { x, y, width: w, height: h } = box
  const f = portFraction(count, port)
  switch (side) {
    case 'top':
      return { point: { x: x + w * f, y }, normal: { x: 0, y: -1 } }
    case 'bottom':
      return { point: { x: x + w * f, y: y + h }, normal: { x: 0, y: 1 } }
    case 'left':
      return { point: { x, y: y + h * f }, normal: { x: -1, y: 0 } }
    default:
      return { point: { x: x + w, y: y + h * f }, normal: { x: 1, y: 0 } }
  }
}

/** Picks the side of `from` that faces `to`. */
export function autoSide(from: Box, to: Box): PortSide {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/**
 * On a side carrying several connection points, the one facing `to`.
 *
 * `auto` means "wherever this reads best", and that answer has to survive a side
 * gaining points: picking the nearest keeps a connection short instead of
 * sending it back to a middle that is no longer where anything attaches.
 */
function autoPort(box: Box, side: PortSide, count: number, to: Box): number {
  if (count < 2) return 1
  const horizontal = side === 'top' || side === 'bottom'
  const origin = horizontal ? box.x : box.y
  const span = horizontal ? box.width : box.height
  const facing = horizontal ? to.x + to.width / 2 : to.y + to.height / 2

  let best = 1
  let bestGap = Infinity
  for (let port = 1; port <= count; port++) {
    const gap = Math.abs(origin + span * portFraction(count, port) - facing)
    if (gap < bestGap) {
      bestGap = gap
      best = port
    }
  }
  return best
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
 *
 * Sized to cover a node auto-fitted to its label, not just grid jitter: width
 * grows in 10px steps with a node's text (see `fitNodeSize`) while height
 * mostly sits at its type's floor, so two nodes stacked top-to-bottom drift off
 * centre far more often than two placed side-by-side ever do. A tolerance tuned
 * only to grid rounding straightened left/right connectors and left top/bottom
 * ones jogging on exactly that drift.
 */
const ALIGN_TOLERANCE = 26

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

/* ------------------------------------------------------ obstacle avoidance */

/**
 * How much room a detouring connector keeps between itself and a node.
 *
 * Wide enough that the line reads as going *around* the box rather than
 * grazing it, tight enough that two nodes a grid step apart still leave a lane
 * open between them.
 */
const CLEARANCE = 14

/** Retried with when the full margin leaves no way through a crowded patch. */
const TIGHT_CLEARANCE = 5

/**
 * Clearance around the two nodes a connection joins.
 *
 * Kept narrow: a connector may hug the node it comes out of — it is attached to
 * it — where it must stand well clear of one it merely passes. Wide enough that
 * a rounded corner cannot bite into the box behind it.
 */
const END_CLEARANCE = 6

/** How far outside the boxes it connects the search may roam. */
const SEARCH_MARGIN = 90

/**
 * What a corner costs, in pixels of line.
 *
 * Every way around a box is the same length — Manhattan distance does not care
 * which way it is walked — so length alone leaves the search free to return a
 * staircase. Pricing corners is what makes it pick the two-turn detour a person
 * would have drawn.
 */
const TURN_COST = 26

/** Corner rounding per route style, once a connector has had to divert. */
const DETOUR_RADIUS = { orthogonal: 10, straight: 8, curved: 26 } as const

/** Ceilings on the search, so a crowded diagram cannot stall a drag. */
const MAX_CELLS = 3000
const MAX_VISITS = 12000

const inflate = (b: Box, by: number): Box => ({
  x: b.x - by,
  y: b.y - by,
  width: b.width + by * 2,
  height: b.height + by * 2,
})

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const contains = (b: Box, p: Vec) =>
  p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height

function boundsOf(points: Vec[]): Box {
  const x = Math.min(...points.map((p) => p.x))
  const y = Math.min(...points.map((p) => p.y))
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  }
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/**
 * Whether a segment passes through the inside of a box.
 *
 * Liang–Barsky clipping against a box pulled in by half a pixel, so a line that
 * runs along a node's edge — or clips its corner — does not count as crossing
 * it. Only actually going through the box does.
 */
function segmentBlocked(a: Vec, b: Vec, box: Box): boolean {
  const EPS = 0.5
  const xLo = box.x + EPS
  const xHi = box.x + box.width - EPS
  const yLo = box.y + EPS
  const yHi = box.y + box.height - EPS
  if (xHi <= xLo || yHi <= yLo) return false

  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, a.x - xLo) && clip(dx, xHi - a.x) && clip(-dy, a.y - yLo) && clip(dy, yHi - a.y)
}

function polylineBlocked(points: Vec[], boxes: Box[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const box of boxes) {
      if (segmentBlocked(points[i - 1]!, points[i]!, box)) return true
    }
  }
  return false
}

/** A curve is tested as the polyline through a sample of its points. */
const bezierSamples = (a: Vec, b: Vec, c: Vec, d: Vec, steps = 24): Vec[] =>
  Array.from({ length: steps + 1 }, (_, i) => bezierPoint(a, b, c, d, i / steps))

/** Direction index of an axis-aligned unit vector: 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
const dirOf = (v: Vec) => (v.x > 0 ? 0 : v.x < 0 ? 2 : v.y > 0 ? 1 : 3)

/** Grid coordinates are quantised, so a point can be looked up by value. */
const tick = (v: number) => Math.round(v * 2) / 2

/** Sorted, de-duplicated coordinates, with anything outside `[lo, hi]` dropped. */
function axisTicks(values: number[], lo: number, hi: number): number[] {
  const seen = new Set<number>()
  for (const v of values) {
    const t = tick(v)
    if (t >= lo && t <= hi) seen.add(t)
  }
  return [...seen].sort((a, b) => a - b)
}

/**
 * How far apart two neighbouring ticks may sit before a bend confined to that
 * stretch gets pulled all the way to one end of it.
 *
 * The Hanan grid a detour searches only has lines through obstacle edges, so
 * an open stretch with nothing in it — the common case, one node sitting well
 * clear of another — carries no line to turn on until the edge of whichever
 * box the search is skirting. Left alone, every bend in a long detour lands
 * jammed against that box instead of somewhere a person would have drawn it.
 *
 * Kept tight enough that even two nodes sitting close together still get a
 * midpoint of their own — a gap has to clear this before it earns even one
 * inserted tick, so a stretch not much wider than this got none at all, and
 * the only place left to bend was wherever the stub happened to end.
 */
const MAX_TICK_GAP = 24

/**
 * Ticks a single gap is split into once it is wide enough to split at all —
 * quarters, not one every {@link MAX_TICK_GAP}.
 *
 * A per-gap cap rather than a per-pixel one: splitting every such run into
 * one-tick-per-`MAX_TICK_GAP` scales with how wide the diagram is, and a
 * single long open stretch — one node placed well clear of another, the case
 * this exists for — could alone burn through the search's whole cell budget,
 * silently losing the obstacle-avoidance that budget exists to afford. A
 * handful of candidates spread through any one gap is enough for a bend to
 * land near its middle; it does not need one every `MAX_TICK_GAP` on top.
 */
const MAX_SPLITS = 4

/** Split any gap wider than `MAX_TICK_GAP` into up to `MAX_SPLITS` even parts. */
function withMidpoints(ticks: number[]): number[] {
  const out: number[] = []
  for (const v of ticks) {
    const prev = out.at(-1)
    if (prev !== undefined && v - prev > MAX_TICK_GAP) {
      const steps = Math.min(Math.ceil((v - prev) / MAX_TICK_GAP), MAX_SPLITS)
      for (let s = 1; s < steps; s++) out.push(tick(prev + ((v - prev) * s) / steps))
    }
    out.push(v)
  }
  return out
}

/**
 * The open run of one axis that `at` sits in, bounded by the nearest wall on
 * either side whose span actually crosses `probe` on the other axis — or by
 * the search region itself, where nothing does.
 *
 * This is deliberately not a fixed point (an anchor, a box centre): the two
 * nodes a connector joins can sit anywhere relative to each other, and their
 * ports carry no relation to how much open space happens to separate the
 * boxes at a given spot. Reading the gap off the walls themselves is what
 * lets the centering bias below track the actual free space between two
 * nodes as they move — including shrinking right along with it as the nodes
 * are dragged closer together — rather than aiming at a spot that stays put
 * while the room around it changes size.
 */
function openInterval(
  walls: Box[],
  fixedAxis: 'x' | 'y',
  probe: number,
  at: number,
  lo: number,
  hi: number,
): [number, number] {
  let near = lo
  let far = hi
  for (const w of walls) {
    const wLo = fixedAxis === 'x' ? w.x : w.y
    const wSpan = fixedAxis === 'x' ? w.width : w.height
    if (probe <= wLo || probe >= wLo + wSpan) continue
    const bLo = fixedAxis === 'x' ? w.y : w.x
    const bHi = fixedAxis === 'x' ? w.y + w.height : w.x + w.width
    if (bHi <= at && bHi > near) near = bHi
    if (bLo >= at && bLo < far) far = bLo
  }
  return [near, far]
}

/** How far `at` sits from the middle of `[lo, hi]`. */
const centerOffset = (at: number, [lo, hi]: [number, number]) => Math.abs(at - (lo + hi) / 2)

/**
 * Tie-break weight pulling a free bend toward the middle of the open space it
 * crosses, so where a bend's exact position is open — costing the same
 * wherever it falls along an obstacle-free stretch — the search settles on
 * the one a person would draw instead of whichever the grid happened to
 * visit first.
 *
 * Charged once per turn, against its distance from the middle of the local
 * gap {@link openInterval} finds at that turn — not against distance from a
 * fixed point such as the anchors' own midpoint, which stays put as the two
 * nodes move and so drifts outside the gap, and not against distance from the
 * straight line between the anchors, which rewards cutting a forced detour
 * short instead of centering it — both recreate the hugging this exists to
 * fix. Only ever compared within one value of {@link COST_SCALE} — see there
 * for why that keeps it powerless to change which route is actually
 * shortest.
 */
const CENTER_BIAS = 0.1

/**
 * What one real pixel — or one {@link TURN_COST} — of route cost is worth in
 * the units the search actually minimises.
 *
 * The search has to weigh real cost first and the centering bias only as a
 * tiebreak between routes already equal on that: a bend free to land
 * anywhere in open space should land in the middle, but never at the price of
 * a longer or cornier route — that was the bug centering by raw bias alone
 * produced, trading real distance for a straighter-looking detour. Scaling
 * real cost up here and leaving the bias unscaled gets both at once: real
 * cost so dwarfs the bias that no plausible accumulation of it can look
 * cheaper than the next real-cost step (real costs move in units of at least
 * 0.5, so keeping total bias on any one path under half of `COST_SCALE` — true
 * with room to spare at diagram-sized path lengths — keeps it from ever
 * crossing one), while genuine ties in real cost still separate cleanly once
 * the bias is added on top.
 */
const COST_SCALE = 1e7

/** Drops the middle of any three points that lie on one straight run. */
function simplify(points: Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of points) {
    const a = out.at(-2)
    const b = out.at(-1)
    if (b && Math.abs(p.x - b.x) < 0.5 && Math.abs(p.y - b.y) < 0.5) continue
    if (a && b) {
      const alongX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5
      const alongY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5
      if (alongX || alongY) out.pop()
    }
    out.push(p)
  }
  return out
}

/* A binary min-heap, kept as two parallel arrays of numbers: the search runs on
   every frame of a drag, and this is the part of it that runs the most. */

function heapPush(costs: number[], items: number[], cost: number, item: number): void {
  let i = costs.length
  costs.push(cost)
  items.push(item)
  while (i > 0) {
    const up = (i - 1) >> 1
    if (costs[up]! <= costs[i]!) break
    ;[costs[up], costs[i]] = [costs[i]!, costs[up]!]
    ;[items[up], items[i]] = [items[i]!, items[up]!]
    i = up
  }
}

function heapPop(costs: number[], items: number[]): number {
  const top = items[0]!
  const cost = costs.pop()!
  const item = items.pop()!
  if (costs.length) {
    costs[0] = cost
    items[0] = item
    for (let i = 0; ; ) {
      const left = i * 2 + 1
      const right = left + 1
      let low = i
      if (left < costs.length && costs[left]! < costs[low]!) low = left
      if (right < costs.length && costs[right]! < costs[low]!) low = right
      if (low === i) break
      ;[costs[low], costs[i]] = [costs[i]!, costs[low]!]
      ;[items[low], items[i]] = [items[i]!, items[low]!]
      i = low
    }
  }
  return top
}

/**
 * An orthogonal route from `s` to `t` that stays out of `boxes`, or `null` when
 * there is none to be had.
 *
 * A* over the Hanan grid: the lines through every obstacle edge, plus the two
 * endpoints and their stubs. Any shortest rectilinear path around a set of
 * boxes turns only on those lines, so the grid stays small — a few dozen points
 * for a normal diagram — without giving up a route that exists. The search
 * state carries the direction of travel, which is what lets a corner be priced,
 * and what lets the route be made to leave and arrive along the sides the
 * connection is attached to.
 */
function detour(
  s: Vec,
  t: Vec,
  sa: Anchor,
  ta: Anchor,
  boxes: Box[],
  ends: Box[],
  clearance: number,
): Vec[] | null {
  const stub = 22
  const s1 = { x: s.x + sa.normal.x * stub, y: s.y + sa.normal.y * stub }
  const t1 = { x: t.x + ta.normal.x * stub, y: t.y + ta.normal.y * stub }

  // The ground the search may use: what it connects, whatever stands in the
  // way, and enough room to get past it. The endpoint boxes go in whole — an
  // anchor sits on the face of one, so the search has to be able to see round
  // the rest of it.
  let region = boundsOf([s, t, s1, t1])
  for (const box of ends) region = union(region, box)
  for (const box of boxes) {
    if (overlaps(inflate(region, SEARCH_MARGIN), box)) region = union(region, box)
  }
  region = inflate(region, SEARCH_MARGIN)

  const walls = [
    ...boxes.filter((b) => overlaps(region, b)).map((b) => inflate(b, clearance)),
    ...ends.map((b) => inflate(b, END_CLEARANCE)),
  ]
  // A stub buried in a neighbour leaves nowhere to set off from. Measured from
  // clear of the connection's own nodes: a stub starts inside their collar by
  // definition, which is not the same as being blocked by them.
  const guard = END_CLEARANCE + 2
  const sFree = { x: s.x + sa.normal.x * guard, y: s.y + sa.normal.y * guard }
  const tFree = { x: t.x + ta.normal.x * guard, y: t.y + ta.normal.y * guard }
  if (polylineBlocked([sFree, s1], walls) || polylineBlocked([tFree, t1], walls)) return null

  const xHi = region.x + region.width
  const yHi = region.y + region.height
  const xs = withMidpoints(
    axisTicks(
      [region.x, xHi, s.x, s1.x, t.x, t1.x, ...walls.flatMap((w) => [w.x, w.x + w.width])],
      region.x,
      xHi,
    ),
  )
  const ys = withMidpoints(
    axisTicks(
      [region.y, yHi, s.y, s1.y, t.y, t1.y, ...walls.flatMap((w) => [w.y, w.y + w.height])],
      region.y,
      yHi,
    ),
  )
  const nx = xs.length
  const ny = ys.length
  if (nx < 2 || ny < 2 || nx * ny > MAX_CELLS) return null

  const sx = xs.indexOf(tick(s1.x))
  const sy = ys.indexOf(tick(s1.y))
  const tx = xs.indexOf(tick(t1.x))
  const ty = ys.indexOf(tick(t1.y))
  if (sx < 0 || sy < 0 || tx < 0 || ty < 0) return null

  const stateOf = (ix: number, iy: number, dir: number) => (iy * nx + ix) * 4 + dir
  const start = stateOf(sx, sy, dirOf(sa.normal))
  const goal = stateOf(tx, ty, dirOf({ x: -ta.normal.x, y: -ta.normal.y }))
  const heuristic = (ix: number, iy: number) =>
    (Math.abs(xs[ix]! - xs[tx]!) + Math.abs(ys[iy]! - ys[ty]!)) * COST_SCALE

  const best = new Map<number, number>([[start, 0]])
  const cameFrom = new Map<number, number>()
  const settled = new Set<number>()
  const costs: number[] = []
  const items: number[] = []
  heapPush(costs, items, heuristic(sx, sy), start)

  let visits = 0
  while (items.length) {
    const state = heapPop(costs, items)
    if (state === goal) break
    if (settled.has(state)) continue
    settled.add(state)
    if (++visits > MAX_VISITS) return null

    const dir = state % 4
    const cell = (state - dir) / 4
    const ix = cell % nx
    const iy = (cell - ix) / nx
    const g = best.get(state)!

    for (let step = 0; step < 4; step++) {
      const jx = ix + (step === 0 ? 1 : step === 2 ? -1 : 0)
      const jy = iy + (step === 1 ? 1 : step === 3 ? -1 : 0)
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue
      const a = { x: xs[ix]!, y: ys[iy]! }
      const b = { x: xs[jx]!, y: ys[jy]! }
      if (walls.some((w) => segmentBlocked(a, b, w))) continue
      const turning = step !== dir
      const turnBias = !turning
        ? 0
        : dir === 1 || dir === 3
          ? centerOffset(a.y, openInterval(walls, 'x', a.x, a.y, region.y, yHi))
          : centerOffset(a.x, openInterval(walls, 'y', a.y, a.x, region.x, xHi))
      const cost =
        g +
        (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (turning ? TURN_COST : 0)) * COST_SCALE +
        CENTER_BIAS * turnBias
      const next = stateOf(jx, jy, step)
      if (cost >= (best.get(next) ?? Infinity)) continue
      best.set(next, cost)
      cameFrom.set(next, state)
      heapPush(costs, items, cost + heuristic(jx, jy), next)
    }
  }

  if (!best.has(goal)) return null

  const points: Vec[] = []
  for (let state: number | undefined = goal; state !== undefined; state = cameFrom.get(state)) {
    const cell = (state - (state % 4)) / 4
    const ix = cell % nx
    points.push({ x: xs[ix]!, y: ys[(cell - ix) / nx]! })
    if (points.length > nx * ny) return null
  }
  points.reverse()
  return simplify([s, ...points, t])
}

/** Tries for a detour with proper clearance, then for any detour at all. */
function detourRoute(
  s: Vec,
  t: Vec,
  sa: Anchor,
  ta: Anchor,
  boxes: Box[],
  ends: Box[],
): Vec[] | null {
  return (
    detour(s, t, sa, ta, boxes, ends, CLEARANCE) ??
    detour(s, t, sa, ta, boxes, ends, TIGHT_CLEARANCE)
  )
}

/** Geometry for a connector drawn as a polyline with its corners rounded off. */
function fromPolyline(points: Vec[], radius: number): EdgeGeometry {
  const cleaned = points.filter((p, i) => {
    const previous = points[i - 1]
    return !previous || Math.abs(p.x - previous.x) > 0.5 || Math.abs(p.y - previous.y) > 0.5
  })
  const first = cleaned[0] ?? { x: 0, y: 0 }
  const afterFirst = cleaned[1] ?? first
  const last = cleaned.at(-1) ?? first
  const beforeLast = cleaned.at(-2) ?? last
  const ls = Math.hypot(afterFirst.x - first.x, afterFirst.y - first.y) || 1
  const le = Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y) || 1

  return {
    path: polylinePath(cleaned, radius),
    mid: polylineMid(cleaned),
    start: first,
    end: last,
    startDir: { x: (first.x - afterFirst.x) / ls, y: (first.y - afterFirst.y) / ls },
    endDir: { x: (last.x - beforeLast.x) / le, y: (last.y - beforeLast.y) / le },
  }
}

/**
 * Whether the polyline folds back on itself: two consecutive legs running the
 * same axis in opposite directions, rather than turning onto the other one.
 *
 * `orthogonalPoints` only ever produces axis-aligned legs, so consecutive
 * ones are exactly parallel, exactly perpendicular, or exactly opposite —
 * nothing in between — which is what lets a plain sign check stand in for a
 * real angle. It happens when a stub sends the line further from the other
 * node before the shared midpoint pulls it back — most often two ends on the
 * same side (both `right`, say) with one node behind the other along that
 * axis — and once rounded, the corner shows as the line visibly doubling back
 * on itself rather than turning a clean corner.
 */
function reversesDirection(points: Vec[]): boolean {
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!
    const p = points[i]!
    const b = points[i + 1]!
    const d1x = p.x - a.x
    const d1y = p.y - a.y
    const d2x = b.x - p.x
    const d2y = b.y - p.y
    if (d1x * d2x + d1y * d2y < -0.01) return true
  }
  return false
}

/** The plain right-angled route between two anchors, ignoring everything else. */
function orthogonalPoints(s: Vec, t: Vec, sa: Anchor, ta: Anchor): Vec[] {
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
    if (Math.abs(s1.x - t1.x) >= 1) {
      const my = (s1.y + t1.y) / 2
      points.push({ x: s1.x, y: my }, { x: t1.x, y: my })
    }
  } else if (sourceHorizontal) {
    points.push({ x: t1.x, y: s1.y })
  } else {
    points.push({ x: s1.x, y: t1.y })
  }
  points.push(t1, t)
  return points
}

export interface EdgeRouteOptions {
  sourceSide: Side
  targetSide: Side
  /**
   * Connection points each end offers, per side. Omitted — or omitting a side —
   * is the single point every side has by default, which is the geometry this
   * module had before nodes could carry more.
   */
  sourcePorts?: Partial<NodePorts>
  targetPorts?: Partial<NodePorts>
  /** Which of those points each end attaches to, 1-based. Ignored while its side is `auto`. */
  sourcePort?: number
  targetPort?: number
  route: Route
  /**
   * Boxes the connector must not run through — every other node on the canvas.
   *
   * Passed in rather than looked up, because the two callers hold different
   * things: the canvas has live, mid-drag node boxes, the exporter has the
   * document's. Source and target are filtered out here, so a caller can hand
   * over the whole set without picking through it.
   */
  obstacles?: Box[]
}

export function edgeGeometry(
  source: Box,
  target: Box,
  {
    sourceSide,
    targetSide,
    sourcePorts,
    targetPorts,
    sourcePort,
    targetPort,
    route,
    obstacles,
  }: EdgeRouteOptions,
): EdgeGeometry {
  if (source === target || (source.x === target.x && source.y === target.y && source.width === target.width)) {
    return selfLoop(source)
  }

  const sSide = sourceSide === 'auto' ? autoSide(source, target) : sourceSide
  const tSide = targetSide === 'auto' ? autoSide(target, source) : targetSide
  const sCount = nodePorts(sourcePorts)[sSide]
  const tCount = nodePorts(targetPorts)[tSide]
  const sPort = sourceSide === 'auto' ? autoPort(source, sSide, sCount, target) : (sourcePort ?? 1)
  const tPort = targetSide === 'auto' ? autoPort(target, tSide, tCount, source) : (targetPort ?? 1)

  const sa = anchor(source, sSide, sCount, sPort)
  const ta = anchor(target, tSide, tCount, tPort)
  // Only ends that have nowhere else to be get pulled onto a shared line. A side
  // carrying several points was laid out deliberately, and its spacing is finer
  // than the tolerance below — nudging one end would slide a connection onto a
  // point its node does not say it uses.
  if (sCount === 1 && tCount === 1) align(source, target, sa, ta)

  const gap = 2
  const s: Vec = { x: sa.point.x + sa.normal.x * gap, y: sa.point.y + sa.normal.y * gap }
  const t: Vec = { x: ta.point.x + ta.normal.x * gap, y: ta.point.y + ta.normal.y * gap }

  // A box sitting on top of an endpoint is not something a detour can help
  // with — there is no way out of it — so it is not treated as one.
  const others = (obstacles ?? []).filter(
    (b) => b !== source && b !== target && !contains(b, s) && !contains(b, t),
  )
  /*
   * The two nodes the connection joins count as obstacles everywhere except at
   * the anchors themselves. Left out, a connector whose ends face away from
   * each other — two nodes stacked vertically but joined side to side, say —
   * runs its middle leg straight back through the node it just came out of.
   */
  const walls = [...others, source, target]

  if (route === 'straight') {
    if (polylineBlocked([s, t], walls)) {
      const around = detourRoute(s, t, sa, ta, others, [source, target])
      if (around) return fromPolyline(around, DETOUR_RADIUS.straight)
    }
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
    if (polylineBlocked(bezierSamples(s, c1, c2, t), walls)) {
      const around = detourRoute(s, t, sa, ta, others, [source, target])
      // Rounded generously: a curve that has to divert should still read as one.
      if (around) return fromPolyline(around, DETOUR_RADIUS.curved)
    }
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
  const points = orthogonalPoints(s, t, sa, ta)
  if (polylineBlocked(points, walls) || reversesDirection(points)) {
    const around = detourRoute(s, t, sa, ta, others, [source, target])
    if (around) return fromPolyline(around, DETOUR_RADIUS.orthogonal)
  }
  return fromPolyline(points, DETOUR_RADIUS.orthogonal)
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
