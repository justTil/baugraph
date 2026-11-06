import type {
  CanvasSettings,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  MessageFlow,
  NodePorts,
  PortPositions,
} from '@/model/types'
import { FORMAT_VERSION, MAX_PORTS, PORT_SIDES } from '@/model/types'

/**
 * Starting box size for a node, and the floor a new one is never smaller than —
 * wide enough for a type/technology caption like "Database · PostgreSQL", so a
 * row of nodes carrying short names still lines up. The editor measures the real
 * text on top of this (see `lib/auto-size.ts`) and takes whichever is larger.
 */
export const DEFAULT_NODE_SIZE = { width: 190, height: 62 }
/** Default box size for a new zone. */
export const DEFAULT_ZONE_SIZE = { width: 340, height: 220 }

export const DEFAULT_CANVAS: CanvasSettings = {
  theme: 'light',
  grid: true,
  snap: true,
  snapSize: 10,
}

/**
 * Values omitted when writing a file, and filled back in when reading it.
 * Keeping these out of the file is what makes diffs readable.
 */
export const NODE_DEFAULTS = {
  kind: 'shape',
  type: '',
  tech: '',
  shape: 'rect',
  color: 'slate',
  border: 'regular',
  sublabel: '',
  align: 'center',
  icon: '',
  parent: null,
  extrusion: 'regular',
  locked: false,
} as const satisfies Partial<DiagramNode>

/** What every side offers before any connection point is added to it. */
export const DEFAULT_PORTS: NodePorts = { top: 1, right: 1, bottom: 1, left: 1 }

/**
 * Fills in the sides a node left unsaid, so the rest of the app can read a count
 * off any side without asking whether the file mentioned it. Values are clamped
 * rather than trusted: a hand-written `0` would leave a side with nowhere to
 * attach to at all.
 */
export function nodePorts(ports?: Partial<NodePorts>): NodePorts {
  const out = { ...DEFAULT_PORTS }
  if (!ports) return out
  for (const side of PORT_SIDES) {
    const count = ports[side]
    if (typeof count === 'number' && Number.isFinite(count)) {
      out[side] = Math.min(MAX_PORTS, Math.max(1, Math.round(count)))
    }
  }
  return out
}

/**
 * Where a connection point sits along its side, as a fraction of the side's
 * length — the one answer the canvas dots, the router and the exporter all
 * read, so a dot is always exactly where its connections meet the node.
 *
 * A point slid by hand sits where it was put. Every other point takes its
 * evenly spread slot: one lands at the middle exactly where it always did, and
 * the whole set slides with the side as the node is resized. Ports are 1-based,
 * as the file states them, and a number past the end falls back to the last
 * point that exists — a side that has since been narrowed leaves connections
 * attached rather than adrift.
 */
export function portFraction(
  count: number,
  port: number,
  moved?: Record<string, number>,
): number {
  const n = Math.max(1, Math.round(count))
  const p = Math.min(n, Math.max(1, Math.round(port)))
  const at = moved?.[String(p)]
  if (typeof at === 'number' && Number.isFinite(at)) return Math.min(1, Math.max(0, at))
  return p / (n + 1)
}

/**
 * Drops what a node's moved connection points say about points it does not
 * have — a side that has since been given fewer — along with anything that is
 * not a usable fraction, and the whole value once nothing is left. A moved
 * point the side no longer offers is an instruction nothing would follow.
 */
export function prunePortPositions(
  positions: PortPositions | undefined,
  ports: Partial<NodePorts> | undefined,
): PortPositions | undefined {
  if (!positions) return undefined
  const counts = nodePorts(ports)
  const out: PortPositions = {}
  for (const side of PORT_SIDES) {
    const entries = Object.entries(positions[side] ?? {}).filter(([key, value]) => {
      const port = Number(key)
      return (
        Number.isInteger(port) &&
        port >= 1 &&
        port <= counts[side] &&
        typeof value === 'number' &&
        Number.isFinite(value)
      )
    })
    if (entries.length) {
      out[side] = Object.fromEntries(
        entries.map(([key, value]) => [key, Math.min(1, Math.max(0, value))]),
      )
    }
  }
  return Object.keys(out).length ? out : undefined
}

export const EDGE_DEFAULTS = {
  sourceSide: 'auto',
  targetSide: 'auto',
  sourcePort: 1,
  targetPort: 1,
  label: '',
  labelInfo: '',
  route: 'orthogonal',
  line: 'solid',
  width: 'regular',
  arrows: 'target',
  color: null,
} as const satisfies Partial<DiagramEdge>

export const FLOW_DEFAULTS = {
  label: '',
  from: null,
  color: 'blue',
  motion: 'token',
  token: 'dot',
  mode: 'broadcast',
  // Roughly a second across a default-width node's worth of canvas: fast enough
  // to read as a message, slow enough to follow across a fan-out.
  speed: 220,
  count: 1,
  stream: false,
  pause: 0.6,
  loop: true,
  enabled: true,
} as const satisfies Partial<MessageFlow>

export function blankDocument(title = 'Untitled diagram'): DiagramDocument {
  return {
    baugraph: FORMAT_VERSION,
    meta: { title },
    canvas: { ...DEFAULT_CANVAS },
    nodes: [],
    edges: [],
    flows: [],
  }
}
