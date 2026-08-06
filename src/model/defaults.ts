import type {
  CanvasSettings,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
} from '@/model/types'
import { FORMAT_VERSION } from '@/model/types'

/**
 * Default box size for a new node. Wide enough for the type/technology caption
 * — "Database · PostgreSQL" — to sit under the label without being cut off.
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

export function blankDocument(title = 'Untitled diagram'): DiagramDocument {
  return {
    baugraph: FORMAT_VERSION,
    meta: { title },
    canvas: { ...DEFAULT_CANVAS },
    nodes: [],
    edges: [],
  }
}
