import type { DiagramEdge, FlowToken, MessageFlow } from '@/model'

/**
 * Turning a flow's set of connections into a timed traversal.
 *
 * A flow stores *which* connections a message travels and nothing about when.
 * Everything below derives the rest from how those connections are wired, which
 * is what makes the interesting move fall out for free: a message reaching a
 * topic with three subscribers is three messages one hop later, because three
 * branches leave that node and the tokens on them sat on top of each other up to
 * that point. Nobody has to author the split — it *is* the graph.
 *
 * Pure on purpose: the canvas animates from this, and the SVG export writes the
 * same numbers into SMIL, so the two cannot disagree.
 */

/**
 * All a traversal needs of a connection is where it runs between — the canvas
 * passes its live edges straight in, the exporter its parsed ones.
 */
export type FlowEdge = Pick<DiagramEdge, 'id' | 'source' | 'target'>

/**
 * How a connection is drawn within a flow: its own override where it has one,
 * the flow's setting where it does not. Everything that draws a message goes
 * through here, so the canvas and the export cannot disagree about which
 * connections were meant to look different.
 */
export function edgeStyle(
  flow: MessageFlow,
  edge: string,
): { color: MessageFlow['color']; token: FlowToken; speed: number } {
  const override = flow.style?.[edge]
  return {
    color: override?.color ?? flow.color,
    token: override?.token ?? flow.token,
    speed: override?.speed ?? flow.speed,
  }
}

/** A message never crosses a hop faster than this, however short the line. */
const MIN_HOP = 0.12

/** Ceilings on a pathological graph. A diagram is not a search space. */
const MAX_BRANCHES = 48
const MAX_DEPTH = 24

/** One leg of a journey: a connection, and when the message is on it. */
export interface FlowHop {
  edge: string
  /** Seconds after the flow starts. */
  start: number
  duration: number
}

/** One message's route, from the flow's start node to wherever it ends up. */
export interface FlowBranch {
  hops: FlowHop[]
  /** Total time on the road. */
  journey: number
}

export interface FlowPlan {
  branches: FlowBranch[]
  /** How many messages each branch draws at once. */
  tokens: number
  /**
   * Seconds by which each further message is shifted along the journey.
   * Negative for a burst — the second message is *behind* the first — and
   * positive for a stream, where message `k` is a whole spacing further on.
   */
  offset: number
  /**
   * The clock's cycle. A whole pass for a burst; the gap between departures for
   * a stream, which has no pass to speak of.
   */
  duration: number
  /** Whether this plan never empties the line. */
  stream: boolean
  /** The connections actually travelled — a flow may list one twice over. */
  edges: Set<string>
  /** Node the message starts at, once resolved. `null` if it cannot be. */
  from: string | null
}

/** Where a token is at a given moment, or `null` when it is not underway. */
export interface TokenPosition {
  edge: string
  /** 0 at the start of that connection, 1 at its end. */
  progress: number
  /** Fades in as the message is sent and out as it lands. */
  opacity: number
}

/** The flow's connections, in document order, skipping ids that resolved to nothing. */
function resolveEdges(flow: MessageFlow, byId: Map<string, FlowEdge>): FlowEdge[] {
  const seen = new Set<string>()
  const out: FlowEdge[] = []
  for (const id of flow.edges) {
    if (seen.has(id)) continue
    seen.add(id)
    const edge = byId.get(id)
    if (edge) out.push(edge)
  }
  return out
}

/**
 * The node a message starts at: the one end of the selection nothing else in it
 * feeds into. A flow that names its own `from` gets it, provided something
 * actually leaves that node — otherwise the message would have nowhere to go.
 */
export function flowRoot(flow: MessageFlow, edges: FlowEdge[]): string | null {
  if (!edges.length) return null
  if (flow.from && edges.some((e) => e.source === flow.from)) return flow.from

  const targets = new Set(edges.map((e) => e.target))
  const source = edges.find((e) => !targets.has(e.source))
  // Every node being fed by another means the selection is a closed loop; any
  // point on it is as good a beginning as the next, so take the first written.
  return source?.source ?? edges[0]!.source
}

/**
 * Every route a message takes, from `root` outwards.
 *
 * Branching is per-path, not global: sibling branches out of a fan-out share the
 * hops that led there (which is what draws the split), while a connection is
 * never walked twice *within* one route, which is what stops a cycle running
 * forever.
 */
function branchesFrom(root: string, edges: FlowEdge[]): string[][] {
  const outgoing = new Map<string, FlowEdge[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.source)
    if (list) list.push(edge)
    else outgoing.set(edge.source, [edge])
  }

  const routes: string[][] = []

  const walk = (node: string, path: string[], used: Set<string>) => {
    if (routes.length >= MAX_BRANCHES) return
    const next = (outgoing.get(node) ?? []).filter((e) => !used.has(e.id))
    if (!next.length || path.length >= MAX_DEPTH) {
      if (path.length) routes.push(path)
      return
    }
    for (const edge of next) {
      walk(edge.target, [...path, edge.id], new Set(used).add(edge.id))
    }
  }

  walk(root, [], new Set())
  return routes
}

/**
 * The order a single message visits every connection in, for `sequence` flows.
 * Breadth-first from the root, so a walkthrough reads outwards from where the
 * message came in rather than in whatever order the ids happen to be written.
 */
function sequenceFrom(root: string, edges: FlowEdge[]): string[] {
  const remaining = new Map(edges.map((e) => [e.id, e]))
  const order: string[] = []
  const queue: string[] = [root]
  const seen = new Set<string>([root])

  while (queue.length) {
    const node = queue.shift()!
    for (const edge of edges) {
      if (edge.source !== node || !remaining.has(edge.id)) continue
      remaining.delete(edge.id)
      order.push(edge.id)
      if (!seen.has(edge.target)) {
        seen.add(edge.target)
        queue.push(edge.target)
      }
    }
  }

  // Anything the walk could not reach still belongs to the flow, so it is
  // tacked on in the order the file lists it rather than silently dropped.
  for (const edge of edges) if (remaining.has(edge.id)) order.push(edge.id)
  return order
}

/**
 * Times a route. Each hop begins the instant the message lands at its start
 * node, so branches out of the same node leave together and long hops take
 * proportionally longer — one speed across the whole diagram.
 */
function timeRoute(
  route: string[],
  lengthOf: (edge: string) => number,
  speedOf: (edge: string) => number,
): FlowBranch {
  const hops: FlowHop[] = []
  let cursor = 0
  for (const edge of route) {
    const duration = Math.max(MIN_HOP, lengthOf(edge) / Math.max(speedOf(edge), 1))
    hops.push({ edge, start: cursor, duration })
    cursor += duration
  }
  return { hops, journey: cursor }
}

/**
 * Everything the animation needs, from the flow and the geometry of the lines it
 * runs on. `lengthOf` is the drawn length of a connection in canvas units — the
 * canvas measures the rendered path, the exporter computes it.
 */
export function flowPlan(
  flow: MessageFlow,
  edgesById: Map<string, FlowEdge>,
  lengthOf: (edge: string) => number,
): FlowPlan {
  const edges = resolveEdges(flow, edgesById)
  const from = flowRoot(flow, edges)
  const empty: FlowPlan = {
    branches: [],
    tokens: 0,
    offset: 0,
    duration: 0,
    stream: flow.stream,
    edges: new Set(),
    from: null,
  }
  if (!edges.length || !from) return empty

  const routes: string[][] =
    flow.mode === 'sequence' ? [sequenceFrom(from, edges)] : branchesFrom(from, edges)

  // A selection can name connections the walk never reaches — two unrelated
  // hops picked in one go. Each stranded piece becomes a journey of its own, so
  // every connection the flow lists is one the user sees move.
  const covered = new Set(routes.flat())
  const stranded = edges.filter((e) => !covered.has(e.id))
  if (stranded.length && flow.mode !== 'sequence') {
    const seen = new Set(covered)
    for (const edge of stranded) {
      if (seen.has(edge.id)) continue
      for (const route of branchesFrom(edge.source, stranded.filter((e) => !seen.has(e.id)))) {
        route.forEach((id) => seen.add(id))
        routes.push(route)
      }
    }
  }

  const branches = routes
    .filter((route) => route.length)
    .map((route) => timeRoute(route, lengthOf, (edge) => edgeStyle(flow, edge).speed))

  const longest = branches.reduce((max, b) => Math.max(max, b.journey), 0)
  const count = Math.max(1, flow.count)

  /*
   * A stream has no pass to repeat: messages leave one `spacing` apart forever.
   * The clock is therefore one spacing long, and message `k` runs a spacing
   * ahead of message `k − 1`, so `count` of them sit evenly along the journey at
   * every instant. When the clock wraps, message 0 drops back to the source and
   * the one that had reached the far end disappears into it — both at zero
   * opacity, so the seam cannot be seen and the line is never empty.
   */
  if (flow.stream) {
    const spacing = longest / count
    return {
      branches,
      tokens: count,
      offset: spacing,
      duration: spacing,
      stream: true,
      edges: new Set(branches.flatMap((b) => b.hops.map((h) => h.edge))),
      from,
    }
  }

  // A burst has to finish inside its own pass, so the spacing gives way before
  // the messages start overtaking the loop.
  const stagger = count > 1 ? Math.min(0.24, longest / (count + 1)) : 0

  return {
    branches,
    tokens: count,
    offset: -stagger,
    duration: longest + stagger * (count - 1) + Math.max(0, flow.pause),
    stream: false,
    edges: new Set(branches.flatMap((b) => b.hops.map((h) => h.edge))),
    from,
  }
}

/** How long a message fades in and out for, relative to its own journey. */
export const fadeOf = (journey: number) => Math.min(0.2, journey * 0.22)

/**
 * Where one message is at `time` seconds into the flow. `null` while it is
 * waiting to be sent, or once it has arrived.
 */
export function tokenAt(branch: FlowBranch, time: number): TokenPosition | null {
  if (time < 0 || time > branch.journey || !branch.hops.length) return null

  let hop = branch.hops[branch.hops.length - 1]!
  for (const candidate of branch.hops) {
    if (time < candidate.start + candidate.duration) {
      hop = candidate
      break
    }
  }

  const fade = fadeOf(branch.journey)
  const opacity = fade
    ? Math.min(1, Math.min(time, branch.journey - time) / fade)
    : 1

  return {
    edge: hop.edge,
    progress: Math.min(1, Math.max(0, (time - hop.start) / hop.duration)),
    opacity: Math.max(0, opacity),
  }
}

/** Plain-language shape of a flow, for the inspector. */
export function describeFlow(plan: FlowPlan): string {
  if (!plan.branches.length) return 'nothing to travel'
  const hops = plan.edges.size
  const parts = [`${hops} hop${hops === 1 ? '' : 's'}`]
  if (plan.branches.length > 1) parts.push(`fans out to ${plan.branches.length}`)
  // A stream's cycle is the gap between messages, which is not a fact about the
  // flow anyone wants; how long one message is on the road is.
  const journey = plan.branches.reduce((max, b) => Math.max(max, b.journey), 0)
  parts.push(plan.stream ? `${journey.toFixed(1)}s · continuous` : `${plan.duration.toFixed(1)}s`)
  return parts.join(' · ')
}
