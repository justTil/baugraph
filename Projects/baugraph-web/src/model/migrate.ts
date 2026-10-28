import { FORMAT_VERSION } from '@/model/types'
import { DEFAULT_NODE_SIZE, DEFAULT_ZONE_SIZE } from '@/model/defaults'

/**
 * Forward-migration of older diagram files.
 *
 * Two inputs are recognised:
 *   1. A versioned `baugraph` document — passed through (future minor versions
 *      are read leniently; unknown fields survive via the schema's defaults).
 *   2. The flat export of the original single-file `diagram-tool.html`, which
 *      had no version marker. Detected by its `nodes[].w/h` + `edges[].from/to`.
 */
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const doc = raw as Record<string, unknown>

  if (typeof doc.baugraph === 'string') return doc
  if (looksLegacy(doc)) return fromLegacyTool(doc)
  return doc
}

function looksLegacy(doc: Record<string, unknown>): boolean {
  const nodes = doc.nodes
  if (!Array.isArray(nodes)) return false
  if (nodes.length === 0) return Array.isArray(doc.edges) && 'title' in doc
  const first = nodes[0] as Record<string, unknown>
  return typeof first?.w === 'number' && typeof first?.h === 'number'
}

const LEGACY_SHAPES: Record<string, string> = {
  rect: 'rect',
  round: 'round',
  pill: 'pill',
  cyl: 'cylinder',
  queue: 'queue',
  hex: 'hexagon',
  diamond: 'diamond',
  circle: 'circle',
  note: 'note',
  group: 'rect',
}

const LEGACY_SIDES: Record<string, string> = {
  auto: 'auto',
  n: 'top',
  e: 'right',
  s: 'bottom',
  w: 'left',
}

const LEGACY_ROUTES: Record<string, string> = {
  ortho: 'orthogonal',
  curve: 'curved',
  straight: 'straight',
}

const LEGACY_ARROWS: Record<string, string> = {
  end: 'target',
  both: 'both',
  none: 'none',
}

/**
 * Bootstrap Icons names used by the old tool, mapped onto the Lucide ids
 * this app ships. Unmapped names fall through and simply render without an icon.
 */
const LEGACY_ICONS: Record<string, string> = {
  'box-seam': 'package',
  boxes: 'boxes',
  'code-slash': 'code',
  'door-open': 'door-open',
  'lightning-charge': 'zap',
  lightning: 'zap',
  server: 'server',
  'gear-wide-connected': 'cog',
  gear: 'settings',
  'hourglass-split': 'hourglass',
  'window-stack': 'app-window',
  phone: 'smartphone',
  'pc-display': 'monitor',
  database: 'database',
  'hdd-stack': 'hard-drive',
  layers: 'layers',
  search: 'search',
  archive: 'archive',
  folder: 'folder',
  'file-earmark-arrow-up': 'file-up',
  'filetype-csv': 'sheet',
  'filetype-json': 'braces',
  'filetype-xml': 'file-code',
  table: 'table',
  hdd: 'hard-drive',
  stack: 'layers-2',
  'broadcast-pin': 'radio-tower',
  broadcast: 'radio',
  activity: 'activity',
  shuffle: 'shuffle',
  'exclamation-triangle': 'triangle-alert',
  'link-45deg': 'link',
  bell: 'bell',
  envelope: 'mail',
  inbox: 'inbox',
  megaphone: 'megaphone',
  rss: 'rss',
  'diagram-3': 'network',
  plug: 'plug',
  'arrow-left-right': 'arrow-left-right',
  'signpost-split': 'split',
  'distribute-vertical': 'scale',
  router: 'router',
  funnel: 'funnel',
  bezier2: 'spline',
  'arrow-repeat': 'refresh-cw',
  'box-arrow-in-right': 'log-in',
  'box-arrow-right': 'log-out',
  'clock-history': 'rotate-ccw-clock',
  'calendar-check': 'calendar-check',
  alarm: 'alarm-clock',
  kanban: 'kanban',
  'shield-lock': 'shield-check',
  fingerprint: 'scan-face',
  'shield-check': 'shield',
  safe: 'vault',
  key: 'key-round',
  lock: 'lock',
  speedometer2: 'gauge',
  'graph-up-arrow': 'trending-up',
  'journal-text': 'scroll-text',
  git: 'git-branch',
  sliders: 'sliders-horizontal',
  'check2-circle': 'circle-check',
  bug: 'bug',
  terminal: 'terminal',
  person: 'user',
  people: 'users',
  buildings: 'building-2',
  briefcase: 'briefcase',
  globe: 'globe',
  cloud: 'cloud',
  'hdd-network': 'network',
  sim: 'cpu',
  printer: 'printer',
  'credit-card': 'credit-card',
  'geo-alt': 'map-pin',
}

function fromLegacyTool(doc: Record<string, unknown>): unknown {
  const legacyNodes = (doc.nodes as Record<string, unknown>[]) ?? []
  const legacyEdges = (doc.edges as Record<string, unknown>[]) ?? []

  const nodes = legacyNodes.map((n) => {
    const isZone = n.shape === 'group'
    const fallback = isZone ? DEFAULT_ZONE_SIZE : DEFAULT_NODE_SIZE
    const icon = typeof n.icon === 'string' ? (LEGACY_ICONS[n.icon] ?? '') : ''
    return {
      id: String(n.id),
      kind: isZone ? 'zone' : 'shape',
      label: String(n.label ?? ''),
      sublabel: String(n.sub ?? ''),
      shape: LEGACY_SHAPES[String(n.shape)] ?? 'rect',
      color: String(n.color ?? 'slate'),
      icon,
      position: { x: Number(n.x) || 0, y: Number(n.y) || 0 },
      size: {
        width: Number(n.w) || fallback.width,
        height: Number(n.h) || fallback.height,
      },
      parent: null,
    }
  })

  const edges = legacyEdges.map((e, i) => ({
    id: String(e.id ?? `e${i + 1}`),
    source: String(e.from),
    target: String(e.to),
    sourceSide: LEGACY_SIDES[String(e.fromSide)] ?? 'auto',
    targetSide: LEGACY_SIDES[String(e.toSide)] ?? 'auto',
    label: String(e.label ?? ''),
    route: LEGACY_ROUTES[String(e.route)] ?? 'orthogonal',
    line: String(e.line ?? 'solid'),
    arrows: LEGACY_ARROWS[String(e.arrows)] ?? 'target',
    color: e.color ? String(e.color) : null,
  }))

  return {
    baugraph: FORMAT_VERSION,
    meta: { title: String(doc.title ?? 'Untitled diagram') },
    canvas: {
      theme: doc.theme === 'dark' ? 'dark' : 'light',
      grid: doc.grid !== false,
      snap: doc.snap !== false,
      snapSize: 10,
    },
    nodes,
    edges,
  }
}
