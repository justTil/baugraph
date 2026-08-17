import type {
  CanvasSettings,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  MessageFlow,
} from '@/model/types'
import { FORMAT_VERSION } from '@/model/types'

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
  sublabel: '',
  icon: '',
  parent: null,
  locked: false,
} as const satisfies Partial<DiagramNode>

export const EDGE_DEFAULTS = {
  sourceSide: 'auto',
  targetSide: 'auto',
  label: '',
  route: 'orthogonal',
  line: 'solid',
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
