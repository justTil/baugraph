/**
 * Topology of the Luma Middleware Hub (LMH).
 *
 * The picture answers three questions, one per visual dimension:
 *
 *   rows (lanes)  - WHAT is it?   application, messaging, mediation
 *   columns (side)- WHERE does it run?  cloud (FCN Space) or on-premise
 *   the bus       - HOW do they reach each other?
 *
 * Every engine can reach every broker. Drawing that as 3x4 individual curves
 * turns the diagram into a hairball, so the n:m relation is drawn once, as a
 * horizontal bus: each broker and each engine has a single stub onto it. The
 * per-pair routes still exist as paths (invisible until highlighted) so a
 * message can be animated along one concrete route.
 *
 * Deliberately data-only so the diagram component stays generic:
 * a view supplies a `flow` (list of node ids) and the component animates it.
 */

/** Row: the role a node plays. */
export type LaneId = 'apps' | 'brokers' | 'engines'

/** Column: which side of the network boundary a node lives on. */
export type SideId = 'cloud' | 'onprem'

/** Visual/semantic grouping - drives the accent colour of a node. */
export type NodeKind = 'system' | 'engine' | 'broker'

export interface HubNode {
  id: string
  label: string
  sublabel?: string
  lane: LaneId
  side: SideId
  kind: NodeKind
  /** Not built yet - rendered dashed / dimmed. */
  planned?: boolean
}

/**
 * `bus`    - engine <-> broker, routed over the shared message bus.
 * `stack`  - between two lanes on the same side, drawn as a short curve.
 * `bypass` - application <-> engine without a broker, drawn as a straight
 *            line through the gap between the brokers: literally past them.
 */
export type EdgeRoute = 'bus' | 'stack' | 'bypass'

export interface HubEdge {
  from: string
  to: string
  route: EdgeRoute
  /** `bypass` only: x of the vertical run through the broker gap. */
  viaX?: number
}

export interface HubLane {
  id: LaneId
  label: string
  /** One line on why this lane exists - the diagram should explain itself. */
  caption: string
  y: number
  height: number
  /** Vertical centre of the nodes placed in this lane. */
  nodeY: number
}

export interface HubSide {
  id: SideId
  label: string
  /** Horizontal centre of the nodes placed on this side. */
  center: number
  /** Left edge / width of the side's tinted column. */
  x: number
  w: number
}

/**
 * One lane, clipped to one side - the tinted rectangle a node sits on.
 * Colouring these per side is what makes "where does it run?" readable
 * without following the position of every box.
 */
export interface LaneBand {
  id: string
  lane: LaneId
  side: SideId
  x: number
  y: number
  w: number
  h: number
}

/* ------------------------------------------------------------------ layout */

export const VIEW_W = 1200
export const VIEW_H = 600

export const NODE_W = 200
export const NODE_H = 64

/** Horizontal gap between two nodes sharing a lane and a side. */
const NODE_GAP = 60

/** The network boundary: cloud to its left, the data centre to its right. */
export const BOUNDARY_X = 600

export const lanes: HubLane[] = [
  {
    id: 'apps',
    label: 'Anwendungen & Systeme',
    caption: 'Fachliche Quellen und Ziele einer Nachricht',
    y: 52,
    height: 126,
    nodeY: 128,
  },
  {
    id: 'brokers',
    label: 'Messaging',
    caption: 'Entkoppelt Sender und Empfänger, puffert Lastspitzen',
    y: 206,
    height: 126,
    nodeY: 282,
  },
  {
    id: 'engines',
    label: 'Mediation Layer',
    caption: 'Routing, Transformation und Protokollübersetzung',
    y: 444,
    height: 126,
    nodeY: 520,
  },
]

/** Outer margin of the two side columns, and their gap at the boundary. */
const SIDE_MARGIN = 24
const SIDE_GAP = 8

export const sides: HubSide[] = [
  {
    id: 'cloud',
    label: 'FCN Space · Cloud',
    center: 310,
    x: SIDE_MARGIN,
    w: BOUNDARY_X - SIDE_GAP - SIDE_MARGIN,
  },
  {
    id: 'onprem',
    label: 'On-Premise · Rechenzentrum',
    center: 890,
    x: BOUNDARY_X + SIDE_GAP,
    w: VIEW_W - SIDE_MARGIN - (BOUNDARY_X + SIDE_GAP),
  },
]

/**
 * The coloured field a side occupies: header strip on top, lanes inside.
 * The whole column is tinted, so "cloud" and "on-premise" are two visibly
 * different areas rather than two positions.
 */
export const SIDE_COLUMN_Y = 14
export const SIDE_COLUMN_H = VIEW_H - 28
export const SIDE_HEADER_Y = SIDE_COLUMN_Y
export const SIDE_HEADER_H = 28

/** The shared message bus between the messaging and the mediation lane. */
export const BUS_Y = 400
export const BUS_X1 = 140
export const BUS_X2 = 1060
export const BUS_LABEL = 'Message Bus · jede Engine erreicht jeden Broker – auf beiden Seiten der Grenze'

const laneById = Object.fromEntries(lanes.map(l => [l.id, l])) as Record<LaneId, HubLane>
const sideById = Object.fromEntries(sides.map(s => [s.id, s])) as Record<SideId, HubSide>

export const laneBands: LaneBand[] = lanes.flatMap(lane =>
  sides.map(side => ({
    id: `${lane.id}-${side.id}`,
    lane: lane.id,
    side: side.id,
    x: side.x,
    y: lane.y,
    w: side.w,
    h: lane.height,
  })),
)

/* ------------------------------------------------------------------- nodes */

export const nodes: HubNode[] = [
  // Applications - what the business actually cares about.
  { id: 'cloud-app', label: 'Cloud Anwendung', sublabel: 'Signal-Quelle', lane: 'apps', side: 'cloud', kind: 'system' },
  { id: 'onprem-system', label: 'On-Premise System', sublabel: 'Zielsystem', lane: 'apps', side: 'onprem', kind: 'system' },

  // Messaging.
  { id: 'kafka', label: 'Apache Kafka', sublabel: 'Event Streaming', lane: 'brokers', side: 'cloud', kind: 'broker' },
  { id: 'ems-cloud', label: 'TIBCO EMS Cloud', sublabel: 'geplant', lane: 'brokers', side: 'cloud', kind: 'broker', planned: true },
  { id: 'ibm-mq', label: 'IBM MQ', sublabel: 'Message Queue', lane: 'brokers', side: 'onprem', kind: 'broker' },
  { id: 'tibco-ems', label: 'TIBCO EMS', sublabel: 'Message Queue', lane: 'brokers', side: 'onprem', kind: 'broker' },

  // Mediation layer.
  { id: 'bw5-cloud', label: 'TIBCO BW5', sublabel: 'Cloud-Instanz', lane: 'engines', side: 'cloud', kind: 'engine' },
  { id: 'flogo', label: 'TIBCO Flogo', sublabel: 'Cloud-Instanz', lane: 'engines', side: 'cloud', kind: 'engine' },
  { id: 'bw5-onprem', label: 'TIBCO BW5', sublabel: 'On-Premise-Instanz', lane: 'engines', side: 'onprem', kind: 'engine' },
]

/* ---------------------------------------------------------------- geometry */

export interface NodeBox extends HubNode {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

/** Nodes sharing a lane and a side are centred as a group under that side. */
function place(): NodeBox[] {
  return nodes.map((node) => {
    const lane = laneById[node.lane]
    const side = sideById[node.side]
    const peers = nodes.filter(n => n.lane === node.lane && n.side === node.side)
    const slot = peers.indexOf(node)
    const total = peers.length * NODE_W + (peers.length - 1) * NODE_GAP
    const x = side.center - total / 2 + slot * (NODE_W + NODE_GAP)
    const y = lane.nodeY - NODE_H / 2
    return { ...node, x, y, w: NODE_W, h: NODE_H, cx: x + NODE_W / 2, cy: lane.nodeY }
  })
}

export const nodeBoxes: NodeBox[] = place()

export const nodeById: Record<string, NodeBox> = Object.fromEntries(
  nodeBoxes.map(n => [n.id, n]),
)

/** Where the two brokers of a side leave room for a bypass to pass through. */
function brokerGap(side: SideId) {
  return sideById[side].center
}

/* ------------------------------------------------------------------- edges */

const engineIds = ['bw5-cloud', 'flogo', 'bw5-onprem']
const brokerIds = ['kafka', 'ems-cloud', 'ibm-mq', 'tibco-ems']

/**
 * BW5 and Flogo never talk to each other directly - only via a broker.
 * Each engine reaches every broker, which is what makes the hub hybrid:
 * a cloud engine can consume from on-premise and vice versa.
 */
export const edges: HubEdge[] = [
  ...engineIds.flatMap(from => brokerIds.map(to => ({ from, to, route: 'bus' as const }))),

  // Applications hand their messages to the brokers on their own side ...
  { from: 'cloud-app', to: 'kafka', route: 'stack' },
  { from: 'onprem-system', to: 'ibm-mq', route: 'stack' },
  { from: 'onprem-system', to: 'tibco-ems', route: 'stack' },

  // ... or an engine talks to them directly, without a broker in between.
  { from: 'cloud-app', to: 'bw5-cloud', route: 'bypass', viaX: brokerGap('cloud') - 14 },
  { from: 'cloud-app', to: 'flogo', route: 'bypass', viaX: brokerGap('cloud') + 14 },
  // offset from the centre so it does not run on top of the BW5 bus stub
  { from: 'bw5-onprem', to: 'onprem-system', route: 'bypass', viaX: brokerGap('onprem') + 16 },
]

export function edgeKey(from: string, to: string) {
  return `${from}~${to}`
}

const edgeByKey: Record<string, HubEdge> = Object.fromEntries(
  edges.map(e => [edgeKey(e.from, e.to), e]),
)

/** One stub per bus participant - the static picture of the n:m relation. */
export interface BusStub {
  id: string
  side: SideId
  x: number
  y1: number
  y2: number
  planned?: boolean
}

export const busStubs: BusStub[] = nodeBoxes
  .filter(n => n.lane === 'brokers' || n.lane === 'engines')
  .map(n => ({
    id: n.id,
    side: n.side,
    x: n.cx,
    y1: n.lane === 'brokers' ? n.y + n.h : n.y,
    y2: BUS_Y,
    planned: n.planned,
  }))

/* -------------------------------------------------------------- edge paths */

const CORNER = 18

function sign(v: number) {
  return v < 0 ? -1 : 1
}

/** Down/up onto the bus, along it, then off it again. */
function busPath(a: NodeBox, b: NodeBox): string {
  const ya = a.lane === 'brokers' ? a.y + a.h : a.y
  const yb = b.lane === 'brokers' ? b.y + b.h : b.y

  if (Math.abs(a.cx - b.cx) < 2)
    return `M ${a.cx} ${ya} L ${b.cx} ${yb}`

  const dx = sign(b.cx - a.cx)
  const r = Math.min(CORNER, Math.abs(b.cx - a.cx) / 2)
  const inY = sign(BUS_Y - ya)
  const outY = sign(yb - BUS_Y)

  return [
    `M ${a.cx} ${ya}`,
    `L ${a.cx} ${BUS_Y - inY * r}`,
    `Q ${a.cx} ${BUS_Y} ${a.cx + dx * r} ${BUS_Y}`,
    `L ${b.cx - dx * r} ${BUS_Y}`,
    `Q ${b.cx} ${BUS_Y} ${b.cx} ${BUS_Y + outY * r}`,
    `L ${b.cx} ${yb}`,
  ].join(' ')
}

/** A short curve between two lanes on the same side. */
function stackPath(a: NodeBox, b: NodeBox): string {
  const downwards = a.cy < b.cy
  const y1 = downwards ? a.y + a.h : a.y
  const y2 = downwards ? b.y : b.y + b.h
  const dy = (y2 - y1) * 0.55
  return `M ${a.cx} ${y1} C ${a.cx} ${y1 + dy}, ${b.cx} ${y2 - dy}, ${b.cx} ${y2}`
}

/**
 * Straight down (or up) through the gap between the two brokers, then into the
 * side of the target - so the "no broker involved" case is visible as such.
 */
function bypassPath(a: NodeBox, b: NodeBox, viaX: number): string {
  const downwards = a.cy < b.cy
  const y1 = downwards ? a.y + a.h : a.y

  // the run already lines up with the target - meet its top/bottom edge
  if (viaX > b.x && viaX < b.x + b.w)
    return `M ${viaX} ${y1} L ${viaX} ${downwards ? b.y : b.y + b.h}`

  const dx = sign(b.cx - viaX)
  const xEnd = dx > 0 ? b.x : b.x + b.w
  const r = Math.min(CORNER, Math.abs(xEnd - viaX) / 2)
  const dy = downwards ? 1 : -1

  return [
    `M ${viaX} ${y1}`,
    `L ${viaX} ${b.cy - dy * r}`,
    `Q ${viaX} ${b.cy} ${viaX + dx * r} ${b.cy}`,
    `L ${xEnd} ${b.cy}`,
  ].join(' ')
}

/**
 * The path is always drawn from `fromId` to `toId`, so a packet animated along
 * it travels in that direction.
 */
export function edgePath(fromId: string, toId: string): string {
  const a = nodeById[fromId]!
  const b = nodeById[toId]!
  const edge = edgeByKey[edgeKey(fromId, toId)]

  if (edge?.route === 'bus')
    return busPath(a, b)
  if (edge?.route === 'bypass')
    return bypassPath(a, b, edge.viaX ?? a.cx)
  return stackPath(a, b)
}

/** Resolves an unordered node pair to the drawn edge, plus travel direction. */
export function resolveEdge(from: string, to: string) {
  if (edgeByKey[edgeKey(from, to)])
    return { key: edgeKey(from, to), reversed: false }

  if (edgeByKey[edgeKey(to, from)])
    return { key: edgeKey(to, from), reversed: true }

  return null
}

/**
 * Default demo flow: a signal enters the cloud, is picked up by Flogo,
 * handed to the on-premise EMS, consumed by BW5 and delivered to the
 * target system.
 */
export const signalFlow = [
  'cloud-app',
  'kafka',
  'flogo',
  'tibco-ems',
  'bw5-onprem',
  'onprem-system',
]
