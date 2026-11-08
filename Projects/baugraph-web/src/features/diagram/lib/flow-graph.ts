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
 * A flow can also carry an order of its own (`steps`), for when the graph's
 * order is not the story being told: a request that waits for its reply, a
 * hub that calls its subscribers one by one. Then the steps run one after
 * another, and everything inside one step travels together.
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
  /**
   * Seconds after the flow starts that this message is sent. Zero for a route
   * read off the graph; a later step of a hand-set order can send a message of
   * its own part-way through.
   */
  begin: number
  /** When the message arrives, in seconds after the flow starts. */
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
  /** Whether the order was set by hand (`steps`) rather than read off the graph. */
  custom: boolean
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
 * The routes an automatic flow takes: every path out of the root, or the one
 * walk of a `sequence`, plus a journey of its own for any piece of the
 * selection the walk never reaches.
 */
function automaticRoutes(flow: MessageFlow, edges: FlowEdge[], from: string): string[][] {
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

  return routes.filter((route) => route.length)
}

/**
 * A hand-set order, made safe to run: ids the flow does not travel are dropped,
 * a connection named twice keeps its first place, empty steps vanish — and a
 * connection the order forgot to mention is sent after the last step rather
 * than silently left still.
 */
function customSteps(steps: readonly (readonly string[])[], edges: FlowEdge[]): FlowEdge[][] {
  const byId = new Map(edges.map((e) => [e.id, e]))
  const placed = new Set<string>()
  const out: FlowEdge[][] = []
  for (const step of steps) {
    const row: FlowEdge[] = []
    for (const id of step) {
      const edge = byId.get(id)
      if (!edge || placed.has(id)) continue
      placed.add(id)
      row.push(edge)
    }
    if (row.length) out.push(row)
  }
  for (const edge of edges) if (!placed.has(edge.id)) out.push([edge])
  return out
}

/**
 * The steps a flow runs in, as the editor shows them.
 *
 * A hand-set order is returned as it stands. Otherwise the steps are read off
 * the same walk the animation takes: for a fan-out, every connection sits at
 * the depth it is first reached at, so the copies leaving one node share a
 * step; for a `sequence`, each connection is a step of its own.
 */
export function flowSteps(flow: MessageFlow, edgesById: Map<string, FlowEdge>): string[][] {
  const edges = resolveEdges(flow, edgesById)
  if (!edges.length) return []
  if (flow.steps?.length) return customSteps(flow.steps, edges).map((step) => step.map((e) => e.id))

  const from = flowRoot(flow, edges)
  if (!from) return []
  if (flow.mode === 'sequence') {
    // The walk covers every connection, reached or not, so this is the lot.
    return sequenceFrom(from, edges).map((id) => [id])
  }

  const depth = new Map<string, number>()
  const order: string[] = []
  for (const route of automaticRoutes(flow, edges, from)) {
    route.forEach((id, index) => {
      const known = depth.get(id)
      if (known === undefined) order.push(id)
      if (known === undefined || index < known) depth.set(id, index)
    })
  }
  const steps: string[][] = []
  for (const id of order) (steps[depth.get(id)!] ??= []).push(id)
  // `filter` skips holes, should a capped walk ever leave a depth empty.
  return steps.filter((step) => step.length)
}

/** How long a message takes to cross one connection. */
function hopDuration(
  edge: string,
  lengthOf: (edge: string) => number,
  speedOf: (edge: string) => number,
): number {
  return Math.max(MIN_HOP, lengthOf(edge) / Math.max(speedOf(edge), 1))
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
    const duration = hopDuration(edge, lengthOf, speedOf)
    hops.push({ edge, start: cursor, duration })
    cursor += duration
  }
  return { hops, begin: 0, journey: cursor }
}

/**
 * Times a hand-set order. Each step leaves once the slowest hop of the one
 * before it has arrived; everything in a step leaves together.
 *
 * The routes are what make it read as *one* message rather than a string of
 * unrelated ones. A hop that leaves the node an earlier step just arrived at
 * carries that message on — it waits there, if a sibling took longer — and two
 * hops leaving that node in the same step are the message splitting, drawn the
 * way a fan-out is. A node that has already passed its message on and sends
 * again later sends a fresh one, so nothing is left loitering in between.
 */
function steppedBranches(
  steps: FlowEdge[][],
  lengthOf: (edge: string) => number,
  speedOf: (edge: string) => number,
): FlowBranch[] {
  /** A message sitting at a node, and the step that sent it on, if one has. */
  interface Arrival {
    route: number
    hops: number
    takenAt: number | null
  }

  const routes: FlowHop[][] = []
  const arrivals = new Map<string, Arrival>()
  let clock = 0

  steps.forEach((step, index) => {
    const landed: [string, Arrival][] = []
    let end = clock

    for (const edge of step) {
      const hop: FlowHop = { edge: edge.id, start: clock, duration: hopDuration(edge.id, lengthOf, speedOf) }
      end = Math.max(end, hop.start + hop.duration)

      const at = arrivals.get(edge.source)
      let route: number
      if (at && at.takenAt === null) {
        // The message waiting here goes on.
        routes[at.route]!.push(hop)
        at.takenAt = index
        route = at.route
      } else if (at && at.takenAt === index) {
        // It is going on down another connection at this very moment: a copy.
        routes.push([...routes[at.route]!.slice(0, at.hops), hop])
        route = routes.length - 1
      } else {
        routes.push([hop])
        route = routes.length - 1
      }
      landed.push([edge.target, { route, hops: routes[route]!.length, takenAt: null }])
    }

    // Arrivals count from the next step on: a hop never continues one that is
    // still on its way at the same time.
    for (const [node, arrival] of landed) arrivals.set(node, arrival)
    clock = end
  })

  return routes.map((hops) => {
    const last = hops[hops.length - 1]!
    return { hops, begin: hops[0]!.start, journey: last.start + last.duration }
  })
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
  const custom = !!flow.steps?.length
  const ordered = custom ? customSteps(flow.steps!, edges) : null
  const from = ordered ? (ordered[0]?.[0]?.source ?? null) : flowRoot(flow, edges)
  const empty: FlowPlan = {
    branches: [],
    tokens: 0,
    offset: 0,
    duration: 0,
    stream: flow.stream,
    custom,
    edges: new Set(),
    from: null,
  }
  if (!edges.length || !from) return empty

  const speedOf = (edge: string) => edgeStyle(flow, edge).speed
  const branches = ordered
    ? steppedBranches(ordered, lengthOf, speedOf)
    : automaticRoutes(flow, edges, from).map((route) => timeRoute(route, lengthOf, speedOf))

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
      custom,
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
    custom,
    edges: new Set(branches.flatMap((b) => b.hops.map((h) => h.edge))),
    from,
  }
}

/** How long a message fades in and out for, relative to its own journey. */
export const fadeOf = (journey: number) => Math.min(0.2, journey * 0.22)

/**
 * Where one message is at `time` seconds into the flow. `null` while it is
 * waiting to be sent, or once it has arrived. Between two hops of a hand-set
 * order it sits at the start of the next one, which is the node it is waiting
 * at.
 */
export function tokenAt(branch: FlowBranch, time: number): TokenPosition | null {
  if (time < branch.begin || time > branch.journey || !branch.hops.length) return null

  let hop = branch.hops[branch.hops.length - 1]!
  for (const candidate of branch.hops) {
    if (time < candidate.start + candidate.duration) {
      hop = candidate
      break
    }
  }

  const fade = fadeOf(branch.journey - branch.begin)
  const opacity = fade
    ? Math.min(1, Math.min(time - branch.begin, branch.journey - time) / fade)
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
  if (plan.custom) parts.push('own order')
  else if (plan.branches.length > 1) parts.push(`fans out to ${plan.branches.length}`)
  // A stream's cycle is the gap between messages, which is not a fact about the
  // flow anyone wants; how long one message is on the road is.
  const journey = plan.branches.reduce((max, b) => Math.max(max, b.journey), 0)
  parts.push(plan.stream ? `${journey.toFixed(1)}s · continuous` : `${plan.duration.toFixed(1)}s`)
  return parts.join(' · ')
}
