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

/** Which edge of a node a connection attaches to. `auto` picks the nearest. */
export const SIDES = ['auto', 'top', 'right', 'bottom', 'left'] as const
export type Side = (typeof SIDES)[number]

export const ROUTES = ['orthogonal', 'curved', 'straight'] as const
export type Route = (typeof ROUTES)[number]

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

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
  label: string
  /** Secondary line under the label — tech, protocol, SLA… */
  sublabel?: string
  shape: ShapeKey
  color: ColorKey
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
  label?: string
  route: Route
  line: LineStyle
  arrows: ArrowMode
  /** `null` = follow the theme's neutral edge colour. */
  color?: ColorKey | null
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
}
