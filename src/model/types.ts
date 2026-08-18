/**
 * Baugraph diagram model — the on-disk format.
 *
 * A `.baugraph.json` file is the single source of truth for a diagram.
 * It is designed to be committed to a repository:
 *   - stable, author-chosen ids (never regenerated on save)
 *   - default values omitted on write, so a diff only shows real changes
 *   - deterministic key order (see `serialize.ts`)
 *
 * Anything the editor derives at runtime (viewport, selection, undo stack)
 * deliberately does NOT live here.
 */

/** Bumped only for breaking changes. Readers migrate forward, see `migrate.ts`. */
export const FORMAT_VERSION = '1.0' as const

/** Semantic colour keys. Resolved to concrete hex values by the active theme. */
export const COLOR_KEYS = [
  'slate',
  'blue',
  'teal',
  'green',
  'amber',
  'red',
  'purple',
  'pink',
] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Node silhouettes. `zone` nodes use their own container rendering. */
export const SHAPE_KEYS = [
  'rect',
  'round',
  'pill',
  'cylinder',
  'queue',
  'hexagon',
  'diamond',
  'circle',
  'note',
] as const
export type ShapeKey = (typeof SHAPE_KEYS)[number]

/**
 * How heavily a node's outline is drawn. Semantic rather than a raw number, so a
 * file states the intent — `thick` — and the renderer decides what that is worth
 * in canvas units (see `features/diagram/lib/theme.ts`).
 */
export const BORDER_WIDTHS = ['none', 'regular', 'medium', 'thick'] as const
export type BorderWidth = (typeof BORDER_WIDTHS)[number]

/** Which edge of a node a connection attaches to. `auto` picks the nearest. */
export const SIDES = ['auto', 'top', 'right', 'bottom', 'left'] as const
export type Side = (typeof SIDES)[number]

/**
 * Sides a connection point can sit on — `SIDES` without `auto`, which names a
 * decision the renderer makes rather than a place on the node.
 */
export const PORT_SIDES = ['top', 'right', 'bottom', 'left'] as const
export type PortSide = (typeof PORT_SIDES)[number]

/** Most connection points one side of a node may carry. */
export const MAX_PORTS = 6

/** How many connection points each side of a node offers. */
export type NodePorts = Record<PortSide, number>

export const ROUTES = ['orthogonal', 'curved', 'straight'] as const
export type Route = (typeof ROUTES)[number]

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

/**
 * How heavily a connection's line is drawn — the same ramp as a node's border,
 * without `none`: a connection that is not drawn is a connection that has been
 * deleted. Dash patterns and arrow heads scale with it, so a thick dotted line
 * still reads as dotted.
 */
export const LINE_WIDTHS = ['regular', 'medium', 'thick'] as const
export type LineWidth = (typeof LINE_WIDTHS)[number]

export const ARROW_MODES = ['target', 'both', 'none'] as const
export type ArrowMode = (typeof ARROW_MODES)[number]

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** Free-form, round-tripped untouched. For team conventions, links to tickets, etc. */
export type Metadata = Record<string, unknown>

export interface DiagramNode {
  /** Stable identifier. Referenced by edges and by `parent`. */
  id: string
  /** `shape` = a regular box, `zone` = a labelled container others can sit in. */
  kind: 'shape' | 'zone'
  /**
   * What this node *is*, as opposed to how it is drawn (`kind`) or what it is
   * called (`label`): `database`, `api_gateway`, `message_broker`… Ids come from
   * the node-type catalogue (`features/diagram/data/node-types.ts`) and are
   * rendered as a fixed caption on the node, so renaming a database to "Orders"
   * never costs the reader the meaning of its icon. Empty = an untyped box.
   */
  type?: string
  /**
   * The concrete technology behind the node — `postgresql`, `ibm_db2`,
   * `apache_kafka` — from `features/diagram/data/tech.ts`. Drawn next to the
   * type, so a screenshot always states which product is meant.
   */
  tech?: string
  label: string
  /** Secondary line under the label — protocol, SLA, cardinality… */
  sublabel?: string
  shape: ShapeKey
  color: ColorKey
  /** Weight of the node's outline. Omitted means `regular`. */
  border?: BorderWidth
  /** Icon id from the Lucide registry (kebab-case, e.g. `door-open`). Empty = none. */
  icon?: string
  /**
   * Top-left corner. Absolute canvas coordinates, or — when `parent` is set —
   * relative to the parent zone's top-left corner. Relative is deliberate:
   * moving a zone then touches one line in the file instead of every child.
   */
  position: Vec2
  size: Size
  /**
   * Id of the enclosing `zone` node, if any — this is what "grouped" means in
   * the format. A zone may itself sit inside another zone, so `parent` chains.
   */
  parent?: string | null
  /**
   * How many connection points a side offers, for the sides that carry more than
   * the single one every node starts with. Up to `MAX_PORTS` each, and each side
   * is counted on its own — six down one flank and one everywhere else is the
   * shape a fan-out actually has.
   *
   * The *count* is all that is stored: points are spread evenly along the side
   * they sit on, so nothing has to record where each one ended up and they
   * redistribute by themselves when the node is resized. A side at one is
   * omitted, and so is the whole key when no side was added to.
   */
  ports?: Partial<NodePorts>
  /**
   * Locked nodes cannot be selected, moved, resized or connected in the editor
   * until they are unlocked again. Purely an editing aid — it changes nothing
   * about how the node renders or exports.
   */
  locked?: boolean
  /** User metadata; never interpreted by the editor. */
  data?: Metadata
}

export interface DiagramEdge {
  id: string
  source: string
  target: string
  sourceSide: Side
  targetSide: Side
  /**
   * Which connection point on `sourceSide` this end attaches to, counted from
   * the top or from the left and starting at 1. Omitted means the first, which
   * is the only one a side has until points are added to it. Ignored while the
   * side is `auto` — that end has not been placed by hand at all.
   */
  sourcePort?: number
  /** Which connection point on `targetSide` this end attaches to. See `sourcePort`. */
  targetPort?: number
  label?: string
  route: Route
  line: LineStyle
  /** Weight of the line. Omitted means `regular`. */
  width?: LineWidth
  arrows: ArrowMode
  /** `null` = follow the theme's neutral edge colour. */
  color?: ColorKey | null
  data?: Metadata
}

/**
 * How a flow is drawn.
 *   - `token` — discrete messages travelling the connection (GSAP-driven).
 *   - `dash`  — a marching dash along the line, the way a link under constant
 *               load reads. Pure CSS, so it costs nothing.
 *   - `both`  — messages on top of the moving line.
 */
export const FLOW_MOTIONS = ['token', 'dash', 'both'] as const
export type FlowMotion = (typeof FLOW_MOTIONS)[number]

/** What a single message is drawn as. */
export const FLOW_TOKENS = ['dot', 'packet', 'envelope'] as const
export type FlowToken = (typeof FLOW_TOKENS)[number]

/**
 * What happens where a flow's connections fork.
 *   - `broadcast` — the message takes *every* onward connection at once, so one
 *     arriving at a topic with three subscribers leaves as three. Publish /
 *     subscribe, and the move this feature exists for.
 *   - `sequence` — one message walks the connections one after another, in
 *     travel order. A routing slip, or a step-by-step walkthrough.
 */
export const FLOW_MODES = ['broadcast', 'sequence'] as const
export type FlowMode = (typeof FLOW_MODES)[number]

/**
 * How one connection of a flow is drawn, where it should not look like the rest.
 *
 * A node's onward connections rarely mean the same thing — the one to a service
 * is the happy path, the one to a dead-letter queue is a failure — and a diagram
 * that draws them identically has thrown that away. Anything left out here falls
 * back to the flow's own setting, so an override says only what differs.
 */
export interface FlowEdgeStyle {
  color?: ColorKey
  token?: FlowToken
  /** Canvas units per second on this connection alone. */
  speed?: number
}

/**
 * A message travelling the diagram.
 *
 * A flow names a set of connections and lets the editor work out the rest: the
 * order the hops happen in, and where the message multiplies, are *derived* from
 * how those connections are wired (see `features/diagram/lib/flow-graph.ts`).
 * That is what keeps the file terse — adding a fourth subscriber to a fan-out is
 * one more id in `edges`, not a rewritten timeline — and it is why a flow stays
 * correct when the diagram is rerouted underneath it.
 */
export interface MessageFlow {
  /** Stable identifier, derived from the label like every other id. */
  id: string
  /** Names the flow in the inspector. Never drawn on the canvas. */
  label: string
  /**
   * Connections the message travels, by edge id. Order is not significant —
   * the traversal order comes from the graph.
   */
  edges: string[]
  /**
   * Node the message starts at. Omitted means "work it out": the connection set
   * has exactly one end nothing else feeds into, and that is the start.
   */
  from?: string | null
  /** Semantic colour of the messages, resolved by the active theme. */
  color: ColorKey
  motion: FlowMotion
  token: FlowToken
  mode: FlowMode
  /** Canvas units per second, so every hop moves at the same visible rate. */
  speed: number
  /**
   * With `stream` off, how many messages are sent per pass. With it on, how many
   * are in flight along each branch at any moment.
   */
  count: number
  /**
   * Messages leave continuously, so a connection is never empty — what a link
   * under constant load looks like, as opposed to one carrying a single event.
   * A stream has no beginning and no end, so `pause` does not apply to it.
   */
  stream: boolean
  /** Seconds of stillness before the flow repeats. Ignored while streaming. */
  pause: number
  loop: boolean
  /** Off keeps the flow in the file without animating it. */
  enabled: boolean
  /**
   * Per-connection overrides, by edge id. Only for connections this flow
   * travels; anything else is dropped as the flow is pruned.
   */
  style?: Record<string, FlowEdgeStyle>
  /** User metadata; never interpreted by the editor. */
  data?: Metadata
}

export interface CanvasSettings {
  theme: 'light' | 'dark'
  grid: boolean
  snap: boolean
  /** Grid pitch in canvas units. */
  snapSize: number
}

export interface DiagramMeta {
  title: string
  description?: string
  /** ISO-8601. Optional so a hand-written file stays valid. */
  createdAt?: string
  updatedAt?: string
}

export interface DiagramDocument {
  /** Format version of this file. */
  baugraph: string
  meta: DiagramMeta
  canvas: CanvasSettings
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  /** Message flows drawn over the connections above. */
  flows: MessageFlow[]
}
