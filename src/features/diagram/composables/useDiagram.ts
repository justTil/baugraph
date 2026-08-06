import type { Edge, GraphEdge, GraphNode, Node } from '@vue-flow/core'
import type { Ref } from 'vue'
import { computed, reactive, ref, watch } from 'vue'
import type {
  ArrowMode,
  CanvasSettings,
  ColorKey,
  DiagramDocument,
  DiagramEdge,
  DiagramMeta,
  DiagramNode,
  LineStyle,
  Metadata,
  Route,
  ShapeKey,
  Side,
} from '@/model'
import {
  DEFAULT_CANVAS,
  DEFAULT_NODE_SIZE,
  DEFAULT_ZONE_SIZE,
  FORMAT_VERSION,
  blankDocument,
  edgeId as makeEdgeId,
  nodeId as makeNodeId,
} from '@/model'
import type { PaletteItem } from '@/features/diagram/data/palette'
import { paletteItemSize } from '@/features/diagram/data/palette'
import { nodeType } from '@/features/diagram/data/node-types'
import { categoryOfTech } from '@/features/diagram/data/tech'

/** Payload carried on every Vue Flow node; mirrors the model's presentation fields. */
export interface NodeData {
  label: string
  /** Node type id — what the node is. Drawn as a fixed caption. */
  type: string
  /** Technology id — what it runs on. Drawn next to the type. */
  tech: string
  sublabel: string
  shape: ShapeKey
  color: ColorKey
  icon: string
  /** Mirrors `DiagramNode.locked`; the Vue Flow interaction flags follow it. */
  locked: boolean
  meta?: Metadata
}

/** Payload carried on every Vue Flow edge. */
export interface EdgeData {
  label: string
  sourceSide: Side
  targetSide: Side
  route: Route
  line: LineStyle
  arrows: ArrowMode
  color: ColorKey | null
  meta?: Metadata
}

// `any` for the custom-events slot mirrors Vue Flow's own default; narrowing it
// makes the node type incompatible with the library's internal `GraphNode`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BgNode = Node<NodeData, any, 'shape' | 'zone'>
export type BgEdge = Edge<EdgeData>

/** A node as it exists in the store: `data` and `type` are always populated. */
export type ResolvedNode = BgNode & { type: 'shape' | 'zone'; data: NodeData }
/** An edge as it exists in the store: `data` is always populated. */
export type ResolvedEdge = BgEdge & { data: EdgeData }

const STORAGE_KEY = 'baugraph:document:v1'
const HISTORY_LIMIT = 100

/* ------------------------------------------------------------------ state */

// Cast rather than `ref<BgNode[]>`: Vue's deep `UnwrapRef` over Vue Flow's node
// type blows past the compiler's instantiation depth limit.
const nodes = ref([]) as Ref<BgNode[]>
const edges = ref([]) as Ref<BgEdge[]>
const meta = reactive<DiagramMeta>({ title: 'Untitled diagram' })
const canvas = reactive<CanvasSettings>({ ...DEFAULT_CANVAS })

const past = ref<DiagramDocument[]>([])
const future = ref<DiagramDocument[]>([])

/** Set by the view once Vue Flow is mounted, so the store can trigger a re-fit. */
const fitRequest = ref(0)

/* -------------------------------------------------------- document <-> VF */

/**
 * Paint order inside the transform pane: zones, then edges, then nodes.
 * Vue Flow gives edges a z-index of 0 by default, so a zone sharing that level
 * would cover every connection drawn between the nodes it contains.
 *
 * Vue Flow hands every child `max(parentZ, ownZ) + 1`, so a zone nested N deep
 * lands at N. The bands are spaced far apart to leave room for that: even a
 * deeply nested zone stays below the edges, and any node inside one still
 * clears them.
 */
const ZONE_Z = 0
const EDGE_Z = 50
const NODE_Z = 100
const zIndexFor = (kind: 'shape' | 'zone') => (kind === 'zone' ? ZONE_Z : NODE_Z)

function toVueFlowNode(node: DiagramNode): BgNode {
  const locked = node.locked ?? false
  return {
    id: node.id,
    type: node.kind,
    position: { ...node.position },
    style: { width: `${node.size.width}px`, height: `${node.size.height}px` },
    parentNode: node.parent ?? undefined,
    // Deliberately no `extent: 'parent'`: dragging a node out of its zone is how
    // you ungroup it, and dragging one in is how you group it (see `regroup`).
    zIndex: zIndexFor(node.kind),
    selectable: !locked,
    draggable: !locked,
    connectable: !locked,
    focusable: !locked,
    data: {
      label: node.label,
      type: node.type ?? '',
      tech: node.tech ?? '',
      sublabel: node.sublabel ?? '',
      shape: node.shape,
      color: node.color,
      icon: node.icon ?? '',
      locked,
      meta: node.data,
    },
  }
}

function toVueFlowEdge(edge: DiagramEdge): BgEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'diagram',
    zIndex: EDGE_Z,
    // Vue Flow needs concrete handle ids; `auto` is resolved at render time.
    sourceHandle: null,
    targetHandle: null,
    data: {
      label: edge.label ?? '',
      sourceSide: edge.sourceSide,
      targetSide: edge.targetSide,
      route: edge.route,
      line: edge.line,
      arrows: edge.arrows,
      color: edge.color ?? null,
      meta: edge.data,
    },
  }
}

/**
 * Reads the live size of a node. Vue Flow measures the rendered element into
 * `dimensions`; before the first measure (or in tests) we fall back to `style`.
 */
function sizeOf(node: BgNode): { width: number; height: number } {
  const measured = (node as Partial<GraphNode>).dimensions
  if (measured?.width && measured?.height) {
    return { width: measured.width, height: measured.height }
  }
  const style = node.style as Record<string, string> | undefined
  const fromStyle = {
    width: Number.parseFloat(style?.width ?? ''),
    height: Number.parseFloat(style?.height ?? ''),
  }
  if (Number.isFinite(fromStyle.width) && Number.isFinite(fromStyle.height)) return fromStyle
  return node.type === 'zone' ? { ...DEFAULT_ZONE_SIZE } : { ...DEFAULT_NODE_SIZE }
}

function toModelNode(node: BgNode): DiagramNode {
  return {
    id: node.id,
    kind: node.type === 'zone' ? 'zone' : 'shape',
    type: node.data?.type ?? '',
    tech: node.data?.tech ?? '',
    label: node.data?.label ?? '',
    sublabel: node.data?.sublabel ?? '',
    shape: node.data?.shape ?? 'rect',
    color: node.data?.color ?? 'slate',
    icon: node.data?.icon ?? '',
    position: { x: node.position.x, y: node.position.y },
    size: sizeOf(node),
    parent: node.parentNode ?? null,
    locked: node.data?.locked ?? false,
    data: node.data?.meta,
  }
}

function toModelEdge(edge: BgEdge): DiagramEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceSide: edge.data?.sourceSide ?? 'auto',
    targetSide: edge.data?.targetSide ?? 'auto',
    label: edge.data?.label ?? '',
    route: edge.data?.route ?? 'orthogonal',
    line: edge.data?.line ?? 'solid',
    arrows: edge.data?.arrows ?? 'target',
    color: edge.data?.color ?? null,
    data: edge.data?.meta,
  }
}

/**
 * How many zones a node sits inside. Guards against a corrupt parent cycle so a
 * bad file can never spin the editor.
 */
function depthOf(node: BgNode, byId: Map<string, BgNode>): number {
  let depth = 0
  let current = node.parentNode ? byId.get(node.parentNode) : undefined
  const seen = new Set<string>([node.id])
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    depth++
    current = current.parentNode ? byId.get(current.parentNode) : undefined
  }
  return depth
}

/** Snapshot of the editor as a plain, serialisable document. */
export function toDocument(): DiagramDocument {
  // Parents must precede their children so Vue Flow can resolve `parentNode`.
  // Sorting by nesting depth — rather than by kind — keeps that true for zones
  // that live inside other zones. The sort is stable, so nodes at the same depth
  // keep their paint order.
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  const sorted: BgNode[] = [...nodes.value].sort(
    (a, b) => depthOf(a, byId) - depthOf(b, byId),
  )
  return {
    baugraph: FORMAT_VERSION,
    meta: { ...meta },
    canvas: { ...canvas },
    nodes: sorted.map(toModelNode),
    edges: edges.value.map(toModelEdge),
  }
}

/** Replaces the entire editor contents. Does not touch the history stacks. */
function applyDocument(doc: DiagramDocument) {
  Object.assign(meta, { description: undefined, createdAt: undefined, updatedAt: undefined }, doc.meta)
  Object.assign(canvas, doc.canvas)
  nodes.value = doc.nodes.map(toVueFlowNode)
  edges.value = doc.edges.map(toVueFlowEdge)
}

/* ---------------------------------------------------------------- history */

/**
 * Records the current state as an undo step. Call *before* mutating.
 * Consecutive calls sharing a `coalesceKey` (e.g. typing in one field) collapse
 * into a single step.
 */
let lastCoalesceKey: string | null = null

export function commit(coalesceKey?: string) {
  if (coalesceKey && coalesceKey === lastCoalesceKey) return
  lastCoalesceKey = coalesceKey ?? null
  past.value.push(toDocument())
  if (past.value.length > HISTORY_LIMIT) past.value.shift()
  future.value = []
}

/** Ends a coalescing run, so the next edit starts a fresh undo step. */
export function endCoalesce() {
  lastCoalesceKey = null
}

export function undo() {
  const previous = past.value.pop()
  if (!previous) return
  future.value.push(toDocument())
  applyDocument(previous)
  endCoalesce()
}

export function redo() {
  const next = future.value.pop()
  if (!next) return
  past.value.push(toDocument())
  applyDocument(next)
  endCoalesce()
}

/* ------------------------------------------------------------ persistence */

let saveTimer: ReturnType<typeof setTimeout> | undefined

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toDocument()))
    } catch {
      // Quota or private-mode failures are not worth interrupting the user for.
    }
  }, 300)
}

function restore(): DiagramDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Parsed lazily by the caller so a corrupt entry surfaces as a normal error.
    return JSON.parse(raw) as DiagramDocument
  } catch {
    return null
  }
}

export function clearPersisted() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------- selection */

const selectedNodes = computed(
  () => nodes.value.filter((n) => (n as Partial<GraphNode>).selected) as ResolvedNode[],
)
const selectedEdges = computed(
  () => edges.value.filter((e) => (e as Partial<GraphEdge>).selected) as ResolvedEdge[],
)

/** Drives the inspector's "unlock all" affordance. */
const lockedCount = computed(
  () => nodes.value.filter((n) => (n.data as NodeData | undefined)?.locked).length,
)

/* --------------------------------------------------------------- mutation */

const takenNodeIds = () => new Set(nodes.value.map((n) => n.id))
const takenEdgeIds = () => new Set(edges.value.map((e) => e.id))

/** Rounds to the grid when snapping is on. */
export function snap(value: number): number {
  if (!canvas.snap) return Math.round(value)
  return Math.round(value / canvas.snapSize) * canvas.snapSize
}

/* ------------------------------------------------------- grouping geometry */

/**
 * A node's top-left corner in canvas coordinates. `position` is parent-relative
 * once a node lives in a zone, and zones nest, so the whole chain is walked.
 */
export function absolutePosition(node: BgNode): { x: number; y: number } {
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  let x = node.position.x
  let y = node.position.y
  const seen = new Set<string>([node.id])
  let parent = node.parentNode ? byId.get(node.parentNode) : undefined
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id)
    x += parent.position.x
    y += parent.position.y
    parent = parent.parentNode ? byId.get(parent.parentNode) : undefined
  }
  return { x, y }
}

/** The node plus everything nested inside it — never a valid drop target. */
function withDescendants(ids: Iterable<string>): Set<string> {
  const out = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes.value) {
      if (node.parentNode && out.has(node.parentNode) && !out.has(node.id)) {
        out.add(node.id)
        grew = true
      }
    }
  }
  return out
}

/** Zone depth, used to pick the innermost zone under a point. */
function nestingDepth(node: BgNode): number {
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  return depthOf(node, byId)
}

/**
 * The innermost zone containing `point`, ignoring `exclude`. Ties between zones
 * at the same depth go to the one painted last, matching what the user sees.
 */
export function zoneAt(
  point: { x: number; y: number },
  exclude: Set<string> = new Set(),
): BgNode | null {
  let best: BgNode | null = null
  let bestDepth = -1
  nodes.value.forEach((node) => {
    if (node.type !== 'zone' || exclude.has(node.id)) return
    const origin = absolutePosition(node)
    const size = sizeOf(node)
    const inside =
      point.x >= origin.x &&
      point.x <= origin.x + size.width &&
      point.y >= origin.y &&
      point.y <= origin.y + size.height
    if (!inside) return
    const depth = nestingDepth(node)
    if (depth >= bestDepth) {
      best = node
      bestDepth = depth
    }
  })
  return best
}

/**
 * Moves nodes into (or out of) a zone while leaving them exactly where they are
 * on screen — `position` is rewritten into the new parent's coordinate space.
 */
function reparent(ids: Set<string>, parentId: string | null): void {
  if (!ids.size) return
  const origins = new Map<string, { x: number; y: number }>()
  nodes.value.forEach((node) => {
    if (ids.has(node.id)) origins.set(node.id, absolutePosition(node))
  })
  const parent = parentId ? nodes.value.find((n) => n.id === parentId) : null
  const parentOrigin = parent ? absolutePosition(parent) : { x: 0, y: 0 }

  nodes.value = nodes.value.map((node) => {
    const origin = origins.get(node.id)
    if (!origin) return node
    return {
      ...node,
      parentNode: parentId ?? undefined,
      // Clears the clamping an older session may have attached to this node.
      extent: undefined,
      expandParent: false,
      position: { x: origin.x - parentOrigin.x, y: origin.y - parentOrigin.y },
    }
  })
}

/**
 * Re-evaluates which zone the given nodes belong to, from where they now sit.
 * Dropping a node onto a zone groups it; dragging it off the zone releases it.
 */
export function regroup(ids: string[]): boolean {
  const dragged = new Set(ids)
  let changed = false
  for (const id of ids) {
    const node = nodes.value.find((n) => n.id === id)
    if (!node) continue
    // A node dragged along with its zone keeps whatever parent it had.
    if (node.parentNode && dragged.has(node.parentNode)) continue
    const origin = absolutePosition(node)
    const size = sizeOf(node)
    const centre = { x: origin.x + size.width / 2, y: origin.y + size.height / 2 }
    const target = zoneAt(centre, withDescendants([node.id]))
    const nextParent = target?.id ?? null
    if ((node.parentNode ?? null) === nextParent) continue
    reparent(new Set([id]), nextParent)
    changed = true
  }
  return changed
}

export function addNode(item: PaletteItem, at: { x: number; y: number }): BgNode {
  const size = paletteItemSize(item)
  const kind = item.kind ?? 'shape'
  const position = { x: snap(at.x - size.width / 2), y: snap(at.y - size.height / 2) }
  // Dropped inside a zone? Then it joins that zone, and its stored position
  // becomes relative to it — the same grouping a drag-in produces. A zone from
  // the palette always lands at the top level; nest it by dragging it in, so
  // click-to-place can never bury a new container inside an existing one.
  const host = kind === 'zone' ? null : zoneAt(at)
  const origin = host ? absolutePosition(host) : { x: 0, y: 0 }

  const node = toVueFlowNode({
    id: makeNodeId(item.label, takenNodeIds()),
    kind,
    type: item.type,
    tech: item.tech ?? '',
    label: item.label,
    sublabel: '',
    shape: item.shape ?? 'rect',
    color: item.color,
    icon: item.icon ?? '',
    position: { x: position.x - origin.x, y: position.y - origin.y },
    size,
    parent: host?.id ?? null,
  })
  nodes.value = [...nodes.value, node]
  return node
}

export function addEdge(
  source: string,
  target: string,
  sides?: { sourceSide?: Side; targetSide?: Side },
): BgEdge | null {
  if (source === target) return null
  if (edges.value.some((e) => e.source === source && e.target === target)) return null
  const edge = toVueFlowEdge({
    id: makeEdgeId(source, target, takenEdgeIds()),
    source,
    target,
    sourceSide: sides?.sourceSide ?? 'auto',
    targetSide: sides?.targetSide ?? 'auto',
    label: '',
    route: 'orthogonal',
    line: 'solid',
    arrows: 'target',
    color: null,
  })
  edges.value = [...edges.value, edge]
  return edge
}

export function removeSelection() {
  const nodeIds = new Set(selectedNodes.value.map((n) => n.id))
  const edgeIds = new Set(selectedEdges.value.map((e) => e.id))
  if (!nodeIds.size && !edgeIds.size) return

  // Children of a deleted zone are kept; only the frame goes away. They move up
  // to the nearest zone that survives, so a nested group stays intact.
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  const survivor = (node: BgNode): string | null => {
    const seen = new Set<string>([node.id])
    let parent = node.parentNode ? byId.get(node.parentNode) : undefined
    while (parent && !seen.has(parent.id)) {
      if (!nodeIds.has(parent.id)) return parent.id
      seen.add(parent.id)
      parent = parent.parentNode ? byId.get(parent.parentNode) : undefined
    }
    return null
  }

  const orphans = new Map<string | null, Set<string>>()
  nodes.value.forEach((node) => {
    if (nodeIds.has(node.id)) return
    if (!node.parentNode || !nodeIds.has(node.parentNode)) return
    const target = survivor(node)
    const bucket = orphans.get(target) ?? new Set<string>()
    bucket.add(node.id)
    orphans.set(target, bucket)
  })
  orphans.forEach((ids, target) => reparent(ids, target))

  nodes.value = nodes.value.filter((n) => !nodeIds.has(n.id))
  edges.value = edges.value.filter(
    (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
  )
}

/** Locks or unlocks nodes by id; locked nodes drop out of the selection. */
export function setNodesLocked(ids: Iterable<string>, locked: boolean) {
  const target = new Set(ids)
  if (!target.size) return
  nodes.value = nodes.value.map((n) =>
    target.has(n.id)
      ? {
          ...n,
          selectable: !locked,
          draggable: !locked,
          connectable: !locked,
          focusable: !locked,
          selected: locked ? false : (n as Partial<GraphNode>).selected,
          data: { ...(n.data as NodeData), locked },
        }
      : n,
  )
}

export function lockSelection() {
  setNodesLocked(
    selectedNodes.value.map((n) => n.id),
    true,
  )
}

/** Escape hatch for a diagram whose lock icons are hard to hit. */
export function unlockAll() {
  setNodesLocked(
    nodes.value.filter((n) => (n.data as NodeData | undefined)?.locked).map((n) => n.id),
    false,
  )
}

export function duplicateSelection() {
  const source = selectedNodes.value
  if (!source.length) return
  const taken = takenNodeIds()
  const idMap = new Map<string, string>()

  const copies = source.map((node) => {
    const id = makeNodeId(node.data?.label || 'node', taken)
    taken.add(id)
    idMap.set(node.id, id)
    return {
      ...structuredClone(toModelNode(node)),
      id,
      position: { x: node.position.x + 24, y: node.position.y + 24 },
    }
  })

  // A copied child keeps its parent only if that parent was copied too.
  const copiedNodes = copies.map((node) =>
    toVueFlowNode({
      ...node,
      parent: node.parent && idMap.has(node.parent) ? idMap.get(node.parent)! : null,
    }),
  )

  const takenEdges = takenEdgeIds()
  const copiedEdges = edges.value
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => {
      const model = toModelEdge(e)
      const source = idMap.get(e.source)!
      const target = idMap.get(e.target)!
      const id = makeEdgeId(source, target, takenEdges)
      takenEdges.add(id)
      return toVueFlowEdge({ ...model, id, source, target })
    })

  nodes.value = [
    ...nodes.value.map((n) => ({ ...n, selected: false })),
    ...copiedNodes.map((n) => ({ ...n, selected: true })),
  ]
  edges.value = [...edges.value, ...copiedEdges]
}

/**
 * Wraps the selected nodes in a new zone that becomes their parent.
 *
 * Zones may be grouped too, which is what nests one inside another. Members of
 * an already-selected zone come along with it rather than being re-parented, and
 * because a node's position is relative to its zone, everything wrapped in one
 * go has to share the same parent — the first selected node decides which.
 */
export function groupSelection() {
  const selectedIds = new Set(selectedNodes.value.map((n) => n.id))
  const byId = new Map(nodes.value.map((n) => [n.id, n]))
  const outermost = selectedNodes.value.filter((node) => {
    const seen = new Set<string>([node.id])
    let parent = node.parentNode
    while (parent && !seen.has(parent)) {
      if (selectedIds.has(parent)) return false
      seen.add(parent)
      parent = byId.get(parent)?.parentNode
    }
    return true
  })

  const parentId = outermost[0]?.parentNode ?? null
  const targets = outermost.filter((n) => (n.parentNode ?? null) === parentId)
  if (!targets.length) return

  const pad = 34
  const headroom = 16
  const boxes = targets.map((n) => ({ node: n, size: sizeOf(n) }))
  const x1 = Math.min(...boxes.map((b) => b.node.position.x)) - pad
  const y1 = Math.min(...boxes.map((b) => b.node.position.y)) - pad - headroom
  const x2 = Math.max(...boxes.map((b) => b.node.position.x + b.size.width)) + pad
  const y2 = Math.max(...boxes.map((b) => b.node.position.y + b.size.height)) + pad

  const zone = toVueFlowNode({
    id: makeNodeId('zone', takenNodeIds()),
    kind: 'zone',
    type: 'zone',
    tech: '',
    label: 'Zone',
    sublabel: '',
    shape: 'rect',
    color: 'slate',
    icon: '',
    position: { x: x1, y: y1 },
    size: { width: x2 - x1, height: y2 - y1 },
    // The new zone slots in where its members were, which may itself be a zone.
    parent: parentId,
  })

  const childIds = new Set(targets.map((n) => n.id))
  // The zone leads the array so Vue Flow can resolve `parentNode` on the nodes
  // that follow it.
  nodes.value = [
    zone,
    ...nodes.value.map((n) =>
      childIds.has(n.id)
        ? {
            ...n,
            parentNode: zone.id,
            position: { x: n.position.x - x1, y: n.position.y - y1 },
            selected: false,
          }
        : n,
    ),
  ]
}

/** Releases the selected zones' contents; the frames themselves stay put. */
export function ungroupSelection() {
  const zones = selectedNodes.value.filter((n) => n.type === 'zone')
  if (!zones.length) return
  for (const zone of zones) {
    const children = new Set(
      nodes.value.filter((n) => n.parentNode === zone.id).map((n) => n.id),
    )
    reparent(children, zone.parentNode ?? null)
  }
}

export function updateNodeData(id: string, patch: Partial<NodeData>) {
  nodes.value = nodes.value.map((n) =>
    n.id === id ? { ...n, data: { ...(n.data as NodeData), ...patch } } : n,
  )
}

/**
 * Retypes a node — a box that turns out to be a queue, a service that is really
 * a gateway. Styling the user has not touched follows the new type, so the icon
 * and shape keep matching the caption; anything they picked by hand is left
 * exactly as it is.
 */
export function setNodeType(id: string, type: string) {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  const data = node.data as NodeData
  const patch: Partial<NodeData> = { type }

  const next = nodeType(type)
  if (next) {
    const previous = nodeType(data.type)
    if (!data.icon || data.icon === (previous?.icon ?? '')) patch.icon = next.icon ?? ''
    if (data.shape === (previous?.shape ?? 'rect')) patch.shape = next.shape ?? 'rect'
    if (data.color === (previous?.color ?? 'slate')) patch.color = next.color
  }

  updateNodeData(id, patch)
}

/** Sets the technology. An untyped node picks up the kind of thing it implies. */
export function setNodeTech(id: string, tech: string) {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  if (tech && !(node.data as NodeData).type) {
    const category = categoryOfTech(tech)
    if (category) setNodeType(id, category.nodeType)
  }
  updateNodeData(id, { tech })
}

export function updateNodeSize(id: string, size: { width: number; height: number }) {
  nodes.value = nodes.value.map((n) =>
    n.id === id
      ? { ...n, style: { ...(n.style as object), width: `${size.width}px`, height: `${size.height}px` } }
      : n,
  )
}

export function updateEdgeData(id: string, patch: Partial<EdgeData>) {
  edges.value = edges.value.map((e) =>
    e.id === id ? { ...e, data: { ...(e.data as EdgeData), ...patch } } : e,
  )
}

export function reverseEdge(id: string) {
  edges.value = edges.value.map((e) =>
    e.id === id
      ? {
          ...e,
          source: e.target,
          target: e.source,
          data: {
            ...(e.data as EdgeData),
            sourceSide: (e.data as EdgeData).targetSide,
            targetSide: (e.data as EdgeData).sourceSide,
          },
        }
      : e,
  )
}

/** Moves a node to the front or back within its own layer. */
export function reorderNode(id: string, to: 'front' | 'back') {
  const node = nodes.value.find((n) => n.id === id)
  if (!node) return
  const rest = nodes.value.filter((n) => n.id !== id)
  nodes.value = to === 'front' ? [...rest, node] : [node, ...rest]
}

export type AlignAction =
  | 'left'
  | 'center-x'
  | 'right'
  | 'top'
  | 'center-y'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y'
  | 'match-width'
  | 'match-height'

export function alignSelection(action: AlignAction) {
  const targets = selectedNodes.value
  if (targets.length < 2) return

  const boxes = targets.map((node) => ({ node, size: sizeOf(node) }))
  const x1 = Math.min(...boxes.map((b) => b.node.position.x))
  const x2 = Math.max(...boxes.map((b) => b.node.position.x + b.size.width))
  const y1 = Math.min(...boxes.map((b) => b.node.position.y))
  const y2 = Math.max(...boxes.map((b) => b.node.position.y + b.size.height))

  const nextPosition = new Map<string, { x: number; y: number }>()
  const nextSize = new Map<string, { width: number; height: number }>()

  switch (action) {
    case 'left':
      boxes.forEach((b) => nextPosition.set(b.node.id, { ...b.node.position, x: x1 }))
      break
    case 'right':
      boxes.forEach((b) =>
        nextPosition.set(b.node.id, { ...b.node.position, x: x2 - b.size.width }),
      )
      break
    case 'center-x': {
      const c = (x1 + x2) / 2
      boxes.forEach((b) =>
        nextPosition.set(b.node.id, { ...b.node.position, x: snap(c - b.size.width / 2) }),
      )
      break
    }
    case 'top':
      boxes.forEach((b) => nextPosition.set(b.node.id, { ...b.node.position, y: y1 }))
      break
    case 'bottom':
      boxes.forEach((b) =>
        nextPosition.set(b.node.id, { ...b.node.position, y: y2 - b.size.height }),
      )
      break
    case 'center-y': {
      const c = (y1 + y2) / 2
      boxes.forEach((b) =>
        nextPosition.set(b.node.id, { ...b.node.position, y: snap(c - b.size.height / 2) }),
      )
      break
    }
    case 'distribute-x': {
      const sorted = [...boxes].sort((a, b) => a.node.position.x - b.node.position.x)
      const used = sorted.reduce((t, b) => t + b.size.width, 0)
      const gap = (x2 - x1 - used) / (sorted.length - 1)
      let cursor = x1
      sorted.forEach((b) => {
        nextPosition.set(b.node.id, { ...b.node.position, x: snap(cursor) })
        cursor += b.size.width + gap
      })
      break
    }
    case 'distribute-y': {
      const sorted = [...boxes].sort((a, b) => a.node.position.y - b.node.position.y)
      const used = sorted.reduce((t, b) => t + b.size.height, 0)
      const gap = (y2 - y1 - used) / (sorted.length - 1)
      let cursor = y1
      sorted.forEach((b) => {
        nextPosition.set(b.node.id, { ...b.node.position, y: snap(cursor) })
        cursor += b.size.height + gap
      })
      break
    }
    case 'match-width': {
      const width = Math.max(...boxes.map((b) => b.size.width))
      boxes.forEach((b) => nextSize.set(b.node.id, { ...b.size, width }))
      break
    }
    case 'match-height': {
      const height = Math.max(...boxes.map((b) => b.size.height))
      boxes.forEach((b) => nextSize.set(b.node.id, { ...b.size, height }))
      break
    }
  }

  nodes.value = nodes.value.map((n) => {
    const position = nextPosition.get(n.id)
    const size = nextSize.get(n.id)
    if (!position && !size) return n
    return {
      ...n,
      ...(position ? { position } : {}),
      ...(size
        ? { style: { ...(n.style as object), width: `${size.width}px`, height: `${size.height}px` } }
        : {}),
    }
  })
}

/** Nudges the selected nodes by a grid step (or five, with shift). */
export function nudgeSelection(dx: number, dy: number) {
  const ids = new Set(selectedNodes.value.map((n) => n.id))
  if (!ids.size) return
  nodes.value = nodes.value.map((n) =>
    ids.has(n.id)
      ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
      : n,
  )
}

/* -------------------------------------------------------------- documents */

export function loadDocument(doc: DiagramDocument, { resetHistory = true } = {}) {
  applyDocument(doc)
  if (resetHistory) {
    past.value = []
    future.value = []
  }
  endCoalesce()
  fitRequest.value++
}

export function newDocument() {
  commit()
  applyDocument(blankDocument())
}

/* ------------------------------------------------------------------ setup */

let installed = false

function install() {
  if (installed) return
  installed = true
  watch([nodes, edges, meta, canvas], persist, { deep: true })
}

export function useDiagram() {
  install()
  return {
    nodes,
    edges,
    meta,
    canvas,
    selectedNodes,
    selectedEdges,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    lockedCount,
    fitRequest,
    // actions
    commit,
    endCoalesce,
    undo,
    redo,
    snap,
    addNode,
    addEdge,
    removeSelection,
    duplicateSelection,
    groupSelection,
    ungroupSelection,
    regroup,
    setNodesLocked,
    lockSelection,
    unlockAll,
    updateNodeData,
    updateNodeSize,
    setNodeType,
    setNodeTech,
    updateEdgeData,
    reverseEdge,
    reorderNode,
    alignSelection,
    nudgeSelection,
    loadDocument,
    newDocument,
    toDocument,
    sizeOf,
    restorePersisted: restore,
    clearPersisted,
  }
}
