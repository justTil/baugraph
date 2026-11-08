<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Connection, EdgeProps } from '@vue-flow/core'
import { useHandle, useVueFlow } from '@vue-flow/core'
import { Info } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EdgeData, NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import FlowTokens from '@/features/diagram/components/FlowTokens.vue'
import { usePresentation } from '@/features/workspace/composables/usePresentation'
import type { SlideRange, Vec } from '@/features/diagram/lib/edge-path'
import {
  arrowHeadPath,
  dashArray,
  edgeGeometry,
  endpointOf,
  labelAnchor,
  labelFoot as footOfLabel,
  moveSegment,
  nearestSegmentIndex,
  projectOnto,
  tidyWaypoints,
} from '@/features/diagram/lib/edge-path'
import { COLOR_HEX, diagramTheme, edgeColor, edgeStrokeWidth, mix } from '@/features/diagram/lib/theme'
import { useAppTheme } from '@/composables/useAppTheme'
import { measureText } from '@/features/diagram/lib/text'
import { EDGE_LABEL_INFO_ICON, edgeLabelBox } from '@/features/diagram/lib/edge-label'

const props = defineProps<EdgeProps<EdgeData>>()

const {
  flows,
  reconnectEdge,
  reconnectingEdge,
  commit,
  endCoalesce,
  updateEdgeData,
  selectedWaypoints,
  isWaypointSelected,
  selectWaypoint,
  shiftWaypointSelectionForInsert,
  shiftWaypointSelectionForRemove,
  resetLabelPosition,
  snap,
} = useDiagram()
const { getNodes, screenToFlowCoordinate, findEdge, viewport } = useVueFlow()
const { presenting } = usePresentation()
const { highlightOf, registerEdgePath, unregisterEdgePath, invalidateEdgePath, openFlowEditor } =
  useFlows()
const { mode: appThemeMode } = useAppTheme()

const theme = computed(() => diagramTheme(appThemeMode.value))

/** Absolute box of a node, including any parent offset Vue Flow has applied. */
const boxOf = (node: EdgeProps['sourceNode']) => ({
  x: node.computedPosition.x,
  y: node.computedPosition.y,
  width: node.dimensions.width,
  height: node.dimensions.height,
})

/**
 * The nodes this connection has to get around.
 *
 * Zones are left out on purpose: a zone is a container, and the nodes a
 * connection runs between routinely sit inside one. Routing around them would
 * send every line that leaves a group on a tour of the canvas.
 *
 * Annotations are left out for the opposite reason: they are not part of the
 * architecture at all, just something drawn on top of it, so a connection
 * passes straight underneath one exactly as it would under nothing.
 */
const obstacles = computed(() =>
  getNodes.value
    .filter(
      (node) =>
        node.type !== 'zone' &&
        node.type !== 'annotation' &&
        node.id !== props.source &&
        node.id !== props.target,
    )
    .map(boxOf),
)

/** A node's connection points, as its data carries them. Zones have none of their own. */
const portsOf = (node: EdgeProps['sourceNode']) => (node.data as NodeData | undefined)?.ports
/** Where a node's connection points were slid to by hand, if any were. */
const portPositionsOf = (node: EdgeProps['sourceNode']) =>
  (node.data as NodeData | undefined)?.portPositions
/** What a node is drawn as; a zone draws its own square-sided frame. */
const shapeOf = (node: EdgeProps['sourceNode']) =>
  node.type === 'zone' ? undefined : (node.data as NodeData | undefined)?.shape

const geometry = computed(() =>
  edgeGeometry(boxOf(props.sourceNode), boxOf(props.targetNode), {
    sourceSide: props.data.sourceSide,
    targetSide: props.data.targetSide,
    sourcePorts: portsOf(props.sourceNode),
    targetPorts: portsOf(props.targetNode),
    sourcePortPositions: portPositionsOf(props.sourceNode),
    targetPortPositions: portPositionsOf(props.targetNode),
    sourcePort: props.data.sourcePort,
    targetPort: props.data.targetPort,
    route: props.data.route,
    obstacles: obstacles.value,
    waypoints: props.data.waypoints,
    sourceShape: shapeOf(props.sourceNode),
    targetShape: shapeOf(props.targetNode),
  }),
)

const stroke = computed(() =>
  props.selected ? theme.value.selection : edgeColor(props.data.color, theme.value),
)
/**
 * The line's own weight, and the one it is drawn at. Only the drawn stroke picks
 * up the selection bump — the dash pattern and the arrowheads stay put, so
 * clicking a connection does not make it twitch.
 */
const lineWidth = computed(() => edgeStrokeWidth(props.data.width))
const strokeWidth = computed(() => edgeStrokeWidth(props.data.width, props.selected))
const dash = computed(() => dashArray(props.data.line, lineWidth.value))

/**
 * The line's paint, as inline style rather than as SVG attributes.
 *
 * Vue Flow's own stylesheet pins `.vue-flow__edge-path` to a 1px `#b1b1b7`
 * line, and a stylesheet rule beats a presentation attribute however specific
 * the attribute looks — so a connection's colour and weight only take if they
 * are written where nothing can outrank them. The class stays: it is what the
 * library's tooling recognises a connection by.
 */
const lineStyle = computed<CSSProperties>(() => ({
  fill: 'none',
  stroke: stroke.value,
  strokeWidth: `${strokeWidth.value}px`,
  strokeDasharray: dash.value,
  strokeLinecap: props.data.line === 'dotted' ? 'round' : undefined,
  strokeLinejoin: 'round',
}))

const showEndArrow = computed(() => props.data.arrows !== 'none')
const showStartArrow = computed(() => props.data.arrows === 'both')

/**
 * The drawn path is handed to the flow runtime, which samples it directly to
 * place messages. Following the rendered element rather than re-deriving the
 * route is what keeps a message on the line while the node it leads to is still
 * being dragged: the geometry it reads is the geometry on screen.
 */
const pathEl = ref<SVGPathElement | null>(null)

watch(pathEl, (el, previous) => {
  if (previous && !el) unregisterEdgePath(props.id)
  if (el) registerEdgePath(props.id, el)
})

// A reroute changes how long the connection is, and so how long a hop takes.
watch(
  () => geometry.value.path,
  () => invalidateEdgePath(props.id),
  { flush: 'post' },
)

onBeforeUnmount(() => unregisterEdgePath(props.id))

/* ---------------------------------------------------------- reconnecting */

/**
 * How much of the connector, at each end, can be grabbed and dragged onto a
 * different node — dragging the drawn line itself near its tip, rather than
 * a dot only findable by first hovering exactly over it. A fixed length
 * rather than a fraction of the connector: a percentage would hand a long
 * connector a huge reconnect zone at each end (and a short one almost
 * nothing), where what actually matters is how far a hand can miss the tip by
 * — the same regardless of how long the line runs. Capped at half the
 * connector's own length, so the two ends of a short connector meet in the
 * middle instead of trying to overlap.
 */
const GRAB_LENGTH = 28
const GRAB_SAMPLES = 20

const nearSourcePath = ref('')
const nearTargetPath = ref('')
/** The stretch between the two reconnect grab zones — where a drag adds a bend point instead. */
const midPath = ref('')

/** A subpath of `el`, from length `from` to `to`, as its own polyline `d`. */
function sampleRange(el: SVGPathElement, from: number, to: number): string {
  if (to <= from) return ''
  let d = ''
  for (let i = 0; i <= GRAB_SAMPLES; i++) {
    const { x, y } = el.getPointAtLength(from + ((to - from) * i) / GRAB_SAMPLES)
    d += i === 0 ? `M${x},${y}` : `L${x},${y}`
  }
  return d
}

/**
 * Rebuilds the grab zones from the line actually on screen, rather than
 * re-deriving them from `geometry` — sampling the rendered path is one
 * implementation that works whether that geometry is a straight run, a
 * curve, or a routed polyline, with no case to add when routing grows one.
 */
function updateGrabZones() {
  const el = pathEl.value
  if (!el) return
  const len = el.getTotalLength()
  const reach = Math.min(GRAB_LENGTH, len / 2)
  nearSourcePath.value = sampleRange(el, 0, reach)
  nearTargetPath.value = sampleRange(el, len - reach, len)
  midPath.value = sampleRange(el, reach, len - reach)
}

watch([pathEl, () => geometry.value.path], updateGrabZones, { flush: 'post' })

/** Set while an end is being dragged loose, so the drawn line stays out of the way of Vue Flow's own in-progress connection line. */
const dragging = ref(false)

const dragNodeId = ref('')
const dragHandleId = ref<string | null>(null)
/** Which end of a *fresh* connection the fixed node would be playing. */
const dragFixedEnd = ref<'source' | 'target'>('source')
/**
 * The end actually being dragged, exactly as `startReconnect` was told —
 * settled before the drag rather than guessed afterwards. A guess built from
 * comparing the dropped-on node to the connection's own ends breaks the
 * moment that node is the one the drag started at: dropping on one of its
 * *other* dots, to move the connection onto a different point on the node it
 * already meets, looks identical to never having moved that end at all.
 */
const draggedEnd = ref<'source' | 'target'>('source')

/**
 * Only one end of a reconnect drag ever moves — Vue Flow holds the other
 * fixed and reports it back with no handle id of its own, so that end's side
 * and port are kept from the connection's existing data rather than read off
 * the event, or the drag would reset it to `auto` on every reconnect.
 */
function applyReconnect(connection: Connection) {
  const from =
    draggedEnd.value === 'source'
      ? endpointOf(connection.sourceHandle)
      : { side: props.data.sourceSide, port: props.data.sourcePort }
  const to =
    draggedEnd.value === 'target'
      ? endpointOf(connection.targetHandle)
      : { side: props.data.targetSide, port: props.data.targetPort }
  reconnectEdge(props.id, connection.source, connection.target, {
    sourceSide: from.side,
    sourcePort: from.port,
    targetSide: to.side,
    targetPort: to.port,
  })
}

const { handlePointerDown } = useHandle({
  nodeId: dragNodeId,
  handleId: dragHandleId,
  type: dragFixedEnd,
  edgeUpdaterType: dragFixedEnd,
  onEdgeUpdate: (_event, connection) => applyReconnect(connection),
  onEdgeUpdateEnd: () => {
    dragging.value = false
    reconnectingEdge.value = false
  },
})

/**
 * Picks up whichever end the drag started nearest to, holding the other end
 * fixed — the same mechanic a fresh connection is drawn with (see `onConnect`
 * in `DiagramCanvas`), just starting from the connector's own tip instead of
 * a node's dot.
 */
function startReconnect(event: MouseEvent, end: 'source' | 'target') {
  if (event.button !== 0) return
  commit()
  endCoalesce()
  dragging.value = true
  reconnectingEdge.value = true
  draggedEnd.value = end
  dragNodeId.value = end === 'source' ? props.target : props.source
  dragHandleId.value = null
  dragFixedEnd.value = end === 'source' ? 'target' : 'source'
  handlePointerDown(event)
}

/* --------------------------------------------------------- manual routing */

/**
 * Bend points this connection is routed through by hand — see
 * `DiagramEdge.waypoints`. Present and non-empty is what "manual routing"
 * means; empty or absent is today's fully automatic behavior.
 */
const waypoints = computed(() => props.data.waypoints ?? [])

/** Index into `waypoints` currently being dragged, while a drag is live. */
const draggingWaypoint = ref<number | null>(null)

function flowPoint(event: PointerEvent) {
  return screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
}

/**
 * The point on the drawn connection nearest `target` — a coarse walk of the
 * rendered path followed by a few halving steps around the best sample.
 *
 * A new bend point is placed *on* the line, not wherever the cursor happens
 * to be next to it: the preview dot and the point it commits both ride the
 * connection, so adding one reads as pinning the line where it already runs
 * rather than yanking it sideways on the first pixel of the drag.
 */
function closestPointOnPath(target: Vec): Vec {
  const el = pathEl.value
  if (!el) return target
  const total = el.getTotalLength()
  if (!total) return target

  const distSq = (len: number) => {
    const p = el.getPointAtLength(len)
    return (p.x - target.x) ** 2 + (p.y - target.y) ** 2
  }

  const steps = Math.min(200, Math.max(2, Math.ceil(total / 6)))
  let bestLen = 0
  let bestDist = Infinity
  for (let i = 0; i <= steps; i++) {
    const len = (total * i) / steps
    const d = distSq(len)
    if (d < bestDist) {
      bestDist = d
      bestLen = len
    }
  }

  let span = total / steps
  for (let iter = 0; iter < 6; iter++) {
    span /= 2
    for (const len of [bestLen - span, bestLen + span]) {
      if (len < 0 || len > total) continue
      const d = distSq(len)
      if (d < bestDist) {
        bestDist = d
        bestLen = len
      }
    }
  }

  const p = el.getPointAtLength(bestLen)
  return { x: p.x, y: p.y }
}

/** Where the cursor sat when the drag began, to measure the drag as an offset. */
const dragOrigin = ref<Vec | null>(null)
/**
 * Every bend point travelling with the current drag and where each started —
 * the whole waypoint selection when the grabbed point belongs to it, otherwise
 * just the grabbed point. Snapshotted at grab time so the move stays an offset
 * from a fixed baseline rather than compounding frame to frame.
 */
const dragGroup = ref<{ edgeId: string; index: number; from: Vec }[]>([])

/** A connection's bend points, this one's straight off `props`, another's looked up. */
function waypointsOf(edgeId: string): Vec[] {
  if (edgeId === props.id) return waypoints.value
  return ((findEdge(edgeId)?.data as EdgeData | undefined)?.waypoints ?? []) as Vec[]
}

function onWaypointPointerMove(event: PointerEvent) {
  if (draggingWaypoint.value === null || !dragOrigin.value) return
  const now = flowPoint(event)
  const dx = now.x - dragOrigin.value.x
  const dy = now.y - dragOrigin.value.y

  const movedByEdge = new Map<string, Map<number, Vec>>()
  for (const { edgeId, index, from } of dragGroup.value) {
    const moved = movedByEdge.get(edgeId) ?? new Map<number, Vec>()
    moved.set(index, { x: from.x + dx, y: from.y + dy })
    movedByEdge.set(edgeId, moved)
  }
  for (const [edgeId, moved] of movedByEdge) {
    const next = waypointsOf(edgeId).map((p, i) => moved.get(i) ?? p)
    updateEdgeData(edgeId, { waypoints: next })
  }
}

function stopDraggingWaypoint() {
  draggingWaypoint.value = null
  dragOrigin.value = null
  dragGroup.value = []
  window.removeEventListener('pointermove', onWaypointPointerMove)
  window.removeEventListener('pointerup', stopDraggingWaypoint)
}

function beginDraggingWaypoint(
  index: number,
  event: PointerEvent,
  group?: { edgeId: string; index: number; from: Vec }[],
) {
  draggingWaypoint.value = index
  dragOrigin.value = flowPoint(event)
  // `group` is passed when the caller already knows the baseline — a just-
  // inserted point whose array update has not propagated back through `props`
  // yet. Otherwise it is read from the live waypoint selection.
  dragGroup.value =
    group ??
    (isWaypointSelected(props.id, index)
      ? selectedWaypoints.value
      : [{ edgeId: props.id, index }]
    ).flatMap(({ edgeId, index }) => {
      const from = waypointsOf(edgeId)[index]
      return from ? [{ edgeId, index, from: { x: from.x, y: from.y } }] : []
    })
  window.addEventListener('pointermove', onWaypointPointerMove)
  window.addEventListener('pointerup', stopDraggingWaypoint, { once: true })
}

/**
 * Picks up an existing bend point to drag it elsewhere. A plain drag on a
 * point already part of a multi-point selection moves that whole selection at
 * once; any other drag settles the selection on this point first (shift/
 * ctrl/cmd toggling it), so a point can be picked out for aligning without a
 * separate click just to select it.
 */
function startDragWaypoint(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  event.stopPropagation()
  const additive = event.shiftKey || event.ctrlKey || event.metaKey
  if (additive || !isWaypointSelected(props.id, index)) {
    selectWaypoint(props.id, index, additive)
  }
  commit()
  endCoalesce()
  beginDraggingWaypoint(index, event)
}

/** Removes a bend point; removing the last one returns the edge to automatic routing. */
function removeWaypoint(index: number) {
  commit()
  endCoalesce()
  shiftWaypointSelectionForRemove(props.id, index)
  const next = waypoints.value.filter((_, i) => i !== index)
  updateEdgeData(props.id, { waypoints: next.length ? next : undefined })
}

/**
 * The bend points that draw this connection exactly as it is on screen now —
 * what the first drag on an automatic connection turns it into, so taking
 * over from the router never makes the line jump. A manual straight or curved
 * line is its own bend points; an orthogonal one also picks up the corners
 * drawn in to keep it square (see `orthogonalize` in `edge-path`), so a leg
 * can be grabbed by either of its real ends. A curve the router drew as a
 * single sweep has no corners at all, and comes out as none.
 */
const bends = computed<Vec[]>(() => {
  if (waypoints.value.length && props.data.route !== 'orthogonal') {
    return waypoints.value.map((p) => ({ x: p.x, y: p.y }))
  }
  const g = geometry.value
  return (g.points ?? []).slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
})

/** The connection as a polyline, both ends included, in the terms of `bends`. */
const routePoints = computed<Vec[]>(() => [geometry.value.start, ...bends.value, geometry.value.end])

/**
 * Drops this connection's bend points from the point selection. Taking over
 * an automatic route, or squaring a manual one, renumbers the points, and a
 * selection held by index would quietly start pointing at different ones.
 */
function forgetWaypointSelection() {
  if (!selectedWaypoints.value.some((w) => w.edgeId === props.id)) return
  selectedWaypoints.value = selectedWaypoints.value.filter((w) => w.edgeId !== props.id)
}

/**
 * Shift-dragging the line itself, anywhere along its middle stretch, drops a
 * new bend point right there and picks it straight up for dragging — a bend
 * exactly where the hand is, rather than at one of the handles.
 *
 * Only with shift held: a plain click on a connection selects it and nothing
 * more. An automatic connection is taken over first (see `bends`), so the
 * point lands on the line as it is drawn.
 */
function startAddWaypoint(event: PointerEvent) {
  if (event.button !== 0 || !event.shiftKey) return
  event.stopPropagation()
  commit()
  endCoalesce()
  hoverPoint.value = null
  const point = closestPointOnPath(flowPoint(event))
  const base = bends.value
  const index = nearestSegmentIndex(routePoints.value, point)
  if (base.length === waypoints.value.length) shiftWaypointSelectionForInsert(props.id, index)
  else forgetWaypointSelection()
  // Sole-selected, not added to any running selection: shift is the add-point
  // modifier here, so it is always down and cannot also mean "extend selection".
  selectWaypoint(props.id, index, false)
  const next = [...base]
  next.splice(index, 0, point)
  updateEdgeData(props.id, { waypoints: next })
  beginDraggingWaypoint(index, event, [{ edgeId: props.id, index, from: point }])
}

/**
 * Where a new bend point would land if shift-clicked right now — the point on
 * the line nearest the cursor, the same value `startAddWaypoint` would use, so
 * the dot slides along the connection instead of floating beside it. Only
 * tracked while shift is held: without it a click just selects, so previewing
 * a point it would not place would be a lie.
 */
const hoverPoint = ref<Vec | null>(null)

function onHoverAddWaypoint(event: PointerEvent) {
  if (draggingWaypoint.value !== null || !event.shiftKey) {
    hoverPoint.value = null
    return
  }
  hoverPoint.value = closestPointOnPath(flowPoint(event))
}

function clearHoverPoint() {
  hoverPoint.value = null
}

onBeforeUnmount(stopDraggingWaypoint)

/* --------------------------------------------------------- route handles */

/**
 * Reshaping a line by hand: select it, and handles sit on it to be
 * dragged — no mode to switch on first, and no modifier to hold.
 *
 *   - `segment`, on an orthogonal line: the middle of each leg. Dragged, the
 *     leg moves sideways, square to the way it runs, and takes the corners at
 *     both of its ends along — so the line stays right-angled throughout.
 *   - `bend`, on a straight or curved line: the middle of each stretch between
 *     two points. Dragged, it becomes a new bend point right there.
 *
 * Either one turns an automatic connection manual on the first drag, starting
 * from the route exactly as drawn. *Reset routing* hands it back.
 */
interface RouteHandle {
  kind: 'segment' | 'bend'
  /** The leg it sits on, from `routePoints[index]` to `routePoints[index + 1]`. */
  index: number
  at: Vec
  /** Whether the leg runs up and down — and so moves left and right. */
  vertical: boolean
}

/** Legs shorter than this on screen get no handle: it would sit on top of the corners. */
const MIN_HANDLE_LEG = 18
/** How far the pointer has to travel before a press on a handle counts as a drag. */
const ROUTE_DRAG_THRESHOLD = 3

/** Set for the length of a handle drag, which hides the handles while their legs move under them. */
const routeDragActive = ref(false)

const routeHandles = computed<RouteHandle[]>(() => {
  if (
    !props.selected ||
    dragging.value ||
    presenting.value ||
    routeDragActive.value ||
    draggingWaypoint.value !== null ||
    props.source === props.target
  ) {
    return []
  }
  const g = geometry.value
  const zoom = viewport.value.zoom || 1
  // A curve the router drew as one sweep has no legs: its one handle is the
  // middle of the curve, not the middle of the chord under it.
  if (!g.points) return [{ kind: 'bend', index: 0, at: g.mid, vertical: false }]

  const orthogonal = props.data.route === 'orthogonal'
  const points = routePoints.value
  const lastLeg = points.length - 2
  const out: RouteHandle[] = []
  for (let i = 0; i <= lastLeg; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length * zoom < MIN_HANDLE_LEG) continue
    // A leg that meets a node keeps its handle clear of the reconnect grab at
    // that end, or picking the line up there would reroute it instead.
    if ((i === 0 || i === lastLeg) && length / 2 < GRAB_LENGTH + 6) continue
    const vertical = Math.abs(a.x - b.x) < 0.5
    if (orthogonal && !vertical && Math.abs(a.y - b.y) >= 0.5) continue
    out.push({
      kind: orthogonal ? 'segment' : 'bend',
      index: i,
      at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      vertical,
    })
  }
  return out
})

interface RouteDrag {
  handle: RouteHandle
  origin: Vec
  /** `routePoints` as the drag found them — every frame is placed from these. */
  points: Vec[]
  /** How far each end of the line will slide along its node to follow — see `SlideRange`. */
  slides: { start?: SlideRange; end?: SlideRange }
  started: boolean
}

let routeDrag: RouteDrag | null = null

function startRouteHandle(event: PointerEvent, handle: RouteHandle) {
  if (event.button !== 0) return
  event.stopPropagation()
  routeDrag = {
    handle,
    origin: flowPoint(event),
    points: routePoints.value.map((p) => ({ x: p.x, y: p.y })),
    slides: { start: geometry.value.startSlide, end: geometry.value.endSlide },
    started: false,
  }
  window.addEventListener('pointermove', onRouteHandleMove)
  window.addEventListener('pointerup', stopRouteHandle, { once: true })
}

/**
 * Nothing is written — and no undo step taken — until the pointer has really
 * moved, so a click on a handle leaves an automatic line automatic.
 */
function onRouteHandleMove(event: PointerEvent) {
  const drag = routeDrag
  if (!drag) return
  const now = flowPoint(event)
  const dx = now.x - drag.origin.x
  const dy = now.y - drag.origin.y
  if (!drag.started) {
    if (Math.hypot(dx, dy) * (viewport.value.zoom || 1) < ROUTE_DRAG_THRESHOLD) return
    drag.started = true
    routeDragActive.value = true
    commit()
    endCoalesce()
    forgetWaypointSelection()
  }

  const { handle } = drag
  if (handle.kind === 'bend') {
    // From here on it is an ordinary bend point being dragged: hand over to
    // that drag, with the point already where the pointer has got to.
    const point = { x: handle.at.x + dx, y: handle.at.y + dy }
    const next = drag.points.slice(1, -1)
    next.splice(handle.index, 0, point)
    updateEdgeData(props.id, { waypoints: next })
    selectWaypoint(props.id, handle.index, false)
    endRouteDrag()
    beginDraggingWaypoint(handle.index, event, [{ edgeId: props.id, index: handle.index, from: point }])
    return
  }

  // On the grid when snapping is on, so a moved leg lines up with the nodes
  // around it; ⌥ lets go of the grid, the same as it does for a node's drag.
  const raw = handle.vertical ? handle.at.x + dx : handle.at.y + dy
  const value = event.altKey ? raw : snap(raw)
  updateEdgeData(props.id, {
    waypoints: moveSegment(drag.points, handle.index, value, drag.slides),
  })
}

function stopRouteHandle() {
  const drag = routeDrag
  endRouteDrag()
  if (!drag?.started || drag.handle.kind !== 'segment') return
  // A leg dropped in line with its neighbour merges into it.
  const g = geometry.value
  updateEdgeData(props.id, { waypoints: tidyWaypoints(g.start, waypoints.value, g.end) })
}

function endRouteDrag() {
  routeDrag = null
  routeDragActive.value = false
  window.removeEventListener('pointermove', onRouteHandleMove)
  window.removeEventListener('pointerup', stopRouteHandle)
}

onBeforeUnmount(endRouteDrag)

/**
 * Lit while the inspector points at a flow that runs over this connection. The
 * halo takes the flow's colour, so two flows sharing a connection stay tellable
 * apart as each is pointed at in turn.
 */
const highlight = computed(() => {
  const color = highlightOf(props.id)
  return color ? COLOR_HEX[color] : null
})

/**
 * The route the halo traces — the raw polyline, corners unrounded, so a wide
 * translucent stroke bends cleanly with a round line-join instead of
 * ballooning into a blob over the tight curve a sharp corner rounds to.
 * Falls back to the drawn path for curved and self-loop connectors, which
 * carry no polyline of their own and have no sharp joins to spoil.
 */
const haloPath = computed(() => {
  const points = geometry.value.points
  if (!points || points.length < 2) return geometry.value.path
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('')
})

/* ---------------------------------------------------------------- label */

/** Whether the label has been dragged off its default place in the middle of the line. */
const labelMoved = computed(
  () => props.data.labelPosition !== undefined || !!props.data.labelOffset,
)

/** Where the label is centred — see `labelAnchor`. */
const labelCenter = computed(() =>
  labelAnchor(geometry.value, props.data.labelPosition, props.data.labelOffset),
)

/**
 * The point on the line a label pulled off it belongs to, so a leader can be
 * drawn back to it — a label floating clear of its connection is otherwise
 * anyone's guess on a busy diagram. `null` while the label sits on the line.
 */
const labelFoot = computed<Vec | null>(() =>
  footOfLabel(geometry.value, props.data.labelPosition, props.data.labelOffset),
)

/**
 * How close, in screen pixels, a dragged label has to come to the line — or to
 * the middle of it — to be pulled onto it. Screen pixels rather than canvas
 * units, so the pull feels the same at any zoom.
 */
const LABEL_SNAP = 8
/** How far the pointer has to travel before a press on the label counts as a drag rather than a click. */
const LABEL_DRAG_THRESHOLD = 3

const draggingLabel = ref(false)
/** Pointer minus label centre at the moment it was grabbed, so the label does not jump to sit under the cursor. */
let labelGrab: Vec | null = null

/**
 * Picks the label up. Nothing is written — and no undo step taken — until the
 * pointer has actually moved, so a plain click on a label still just selects
 * its connection.
 */
function startDragLabel(event: PointerEvent) {
  if (event.button !== 0 || presenting.value) return
  event.stopPropagation()
  const at = flowPoint(event)
  labelGrab = { x: at.x - labelCenter.value.x, y: at.y - labelCenter.value.y }
  window.addEventListener('pointermove', onLabelPointerMove)
  window.addEventListener('pointerup', stopDraggingLabel, { once: true })
}

/**
 * Follows the pointer, writing the label down as a place along the line plus
 * how far off it the label was pulled — so it rides along with the connection,
 * at the same end and the same side, however the nodes are moved afterwards.
 *
 * Dropped within reach of the line, it sits on the line; within reach of the
 * middle, it goes back to its default place and the file forgets it was ever
 * moved. ⌥ suspends both pulls, the same as it does for a node's drag.
 */
function onLabelPointerMove(event: PointerEvent) {
  if (!labelGrab) return
  const zoom = viewport.value.zoom || 1
  const at = flowPoint(event)
  const want = { x: at.x - labelGrab.x, y: at.y - labelGrab.y }

  if (!draggingLabel.value) {
    const from = labelCenter.value
    if (Math.hypot(want.x - from.x, want.y - from.y) * zoom < LABEL_DRAG_THRESHOLD) return
    commit()
    endCoalesce()
    draggingLabel.value = true
  }

  const reach = LABEL_SNAP / zoom
  const free = event.altKey
  const mid = geometry.value.mid
  if (!free && Math.hypot(want.x - mid.x, want.y - mid.y) < reach) {
    updateEdgeData(props.id, { labelPosition: undefined, labelOffset: undefined })
    return
  }

  const { t, point } = projectOnto(geometry.value, want)
  const offset = { x: want.x - point.x, y: want.y - point.y }
  const onLine = !free && Math.hypot(offset.x, offset.y) < reach
  updateEdgeData(props.id, { labelPosition: t, labelOffset: onLine ? undefined : offset })
}

function stopDraggingLabel() {
  labelGrab = null
  draggingLabel.value = false
  window.removeEventListener('pointermove', onLabelPointerMove)
  window.removeEventListener('pointerup', stopDraggingLabel)
}

/** Double-clicking a moved label puts it back in the middle of its line. */
function onLabelDoubleClick(event: MouseEvent) {
  if (!labelMoved.value || presenting.value) return
  event.stopPropagation()
  commit()
  endCoalesce()
  resetLabelPosition(props.id)
}

onBeforeUnmount(stopDraggingLabel)

/**
 * The label's chip — in the middle of the line until it is dragged somewhere
 * else. Additional info adds an icon to it — and is enough on its own to draw
 * one, icon only, so info written on an unlabelled connection is still findable.
 */
const label = computed(() => {
  const box = edgeLabelBox(props.data.label, props.data.labelInfo, labelCenter.value, measureText)
  if (!box) return null
  return {
    ...box,
    text: props.data.label,
    info: props.data.labelInfo.trim() ? props.data.labelInfo : '',
    fill: theme.value.bg,
    stroke: mix(stroke.value, theme.value.bg, 0.72),
    color: props.selected ? theme.value.selection : theme.value.muted,
  }
})

/**
 * A tag on the line when a flow that runs over it is switched off. Without it the
 * connection just quietly stops carrying anything, and the reason — a flow turned
 * off somewhere, maybe passes ago — is nowhere on the canvas. Dashed and muted so
 * it reads as "nothing is happening here on purpose", and dropped below the label
 * — wherever the label was moved to — so the two never overlap.
 */
const pausedFlows = computed(() =>
  flows.value.filter((flow) => !flow.enabled && flow.edges.includes(props.id)),
)
const pausedFlowCount = computed(() => pausedFlows.value.length)
const pausedTag = computed(() => {
  if (!pausedFlowCount.value) return null
  const text = pausedFlowCount.value === 1 ? 'Flow paused' : `${pausedFlowCount.value} flows paused`
  const width = measureText(text, 10) + 18
  const at = label.value ? labelCenter.value : geometry.value.mid
  return {
    text,
    cx: at.x,
    x: at.x - width / 2,
    y: at.y + (label.value ? 10 : -8),
    width,
  }
})

/** The paused flows by name, for the tag's explanation. */
const pausedNames = computed(() =>
  pausedFlows.value.map((flow) => `“${flow.label || flow.id}”`).join(', '),
)

/**
 * The tag says what is wrong; clicking it goes to where it is fixed — the flow
 * editor, on the first paused flow, with this connection picked out.
 */
function openPausedFlow() {
  const flow = pausedFlows.value[0]
  if (!flow || presenting.value) return
  openFlowEditor(flow.id, props.id)
}
</script>

<template>
  <!--
    Paint order, bottom to top: the line and what travels it, the bend-point
    strip, the reconnect zones at each end, the label, the route handles, and
    the bend points themselves. The label sits above the reconnect zones because it can be
    dragged right up to an end, where the zone would otherwise swallow the
    grab; the bend points sit above everything, since a dot is aimed at.
  -->
  <!--
    Hidden for the length of a reconnect drag: Vue Flow draws its own
    connection-in-progress line from the fixed end to the cursor, and with the
    real connection still on screen underneath, the two would read as two
    connections rather than one being moved.
  -->
  <template v-if="!dragging">
    <!-- Invisible fat stroke first, so thin edges are still easy to click. -->
    <path
      :d="geometry.path"
      fill="none"
      stroke="transparent"
      stroke-width="16"
      class="vue-flow__edge-interaction"
    />
    <!-- Halo for a flow the inspector is pointing at; under the line it belongs to. -->
    <path
      v-if="highlight"
      :d="haloPath"
      fill="none"
      :stroke="highlight"
      stroke-width="9"
      stroke-opacity="0.22"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="pointer-events-none"
    />

    <path
      :id="id"
      ref="pathEl"
      :d="geometry.path"
      :style="lineStyle"
      class="vue-flow__edge-path"
    />

    <path
      v-if="showEndArrow"
      :d="arrowHeadPath(geometry.end, geometry.endDir, lineWidth)"
      :fill="stroke"
    />
    <path
      v-if="showStartArrow"
      :d="arrowHeadPath(geometry.start, geometry.startDir, lineWidth)"
      :fill="stroke"
    />

    <!-- Messages travelling this connection, and any moving line under them. -->
    <FlowTokens :edge-id="id" :path="geometry.path" :line-width="lineWidth" />
  </template>

  <!--
    Manual routing: only while the connection is selected, so a connection
    nobody is working on stays free of editing chrome. Shift-dragging the line
    itself drops a new bend point and starts dragging it — on an automatic
    connection too, which it takes over first; the dots further down are the
    bend points already placed, draggable to move and double-clickable to remove.
  -->
  <template v-if="props.selected && !dragging && !presenting">
    <!--
      Its own colour, distinct from the blue reconnect zones below: this drags
      a bend point into being, not an endpoint onto a different node, and the
      two should not read as the same gesture. Lit only while shift is held —
      an ordinary click on the line selects it and does not bend it.
    -->
    <path
      v-if="midPath"
      :d="midPath"
      fill="none"
      stroke-width="20"
      stroke-linecap="round"
      class="bg-edge__grab-add"
      :class="{ 'bg-edge__grab-add--armed': !!hoverPoint }"
      @pointerdown="startAddWaypoint($event)"
      @pointermove="onHoverAddWaypoint($event)"
      @pointerleave="clearHoverPoint"
    />
    <!-- Live preview of exactly where shift-clicking now would drop a bend point. -->
    <circle
      v-if="hoverPoint"
      :cx="hoverPoint.x"
      :cy="hoverPoint.y"
      r="5"
      :fill="theme.waypoint"
      fill-opacity="0.45"
      class="pointer-events-none"
    />
  </template>

  <!--
    Where the connection itself can be picked up and dragged onto a different
    node — a fixed stretch of the line at each end, not just its exact tip.
    Invisible until hovered, same as a node's own dots (see `ShapeNode`).
  -->
  <path
    v-if="nearSourcePath"
    :d="nearSourcePath"
    fill="none"
    stroke-width="20"
    stroke-linecap="round"
    class="bg-edge__grab"
    @mousedown="startReconnect($event, 'source')"
  />
  <path
    v-if="nearTargetPath"
    :d="nearTargetPath"
    fill="none"
    stroke-width="20"
    stroke-linecap="round"
    class="bg-edge__grab"
    @mousedown="startReconnect($event, 'target')"
  />

  <template v-if="!dragging">
    <!--
      A label pulled off the line keeps a thread back to the point it belongs
      to — always, not just while selected: it is what says which connection a
      label floating clear of its line belongs to. The export draws the same.
    -->
    <g v-if="label && labelFoot" class="pointer-events-none">
      <line
        :x1="labelFoot.x"
        :y1="labelFoot.y"
        :x2="labelCenter.x"
        :y2="labelCenter.y"
        :stroke="stroke"
        stroke-width="1"
        stroke-dasharray="2 3"
        stroke-opacity="0.7"
      />
      <circle :cx="labelFoot.x" :cy="labelFoot.y" r="2.5" :fill="stroke" />
    </g>

    <!--
      The label can be dragged anywhere — along the line, or off it. Double-
      clicking one that was moved puts it back in the middle.
    -->
    <g
      v-if="label && !label.icon"
      class="bg-edge__label"
      :class="{
        'bg-edge__label--movable': !presenting,
        'bg-edge__label--dragging': draggingLabel,
      }"
      @pointerdown="startDragLabel"
      @dblclick="onLabelDoubleClick"
    >
      <rect
        :x="label.x"
        :y="label.y"
        :width="label.width"
        :height="label.height"
        rx="4"
        :fill="label.fill"
        :stroke="label.stroke"
        stroke-width="1"
      />
      <text
        :x="label.textX"
        :y="label.textY"
        text-anchor="middle"
        font-size="11"
        :fill="label.color"
        class="pointer-events-none select-none"
      >
        {{ label.text }}
      </text>
    </g>
    <!--
      A label carrying additional info: the whole chip is the hover target, not
      just the icon — a 11px icon is a hard thing to land a pointer on while the
      canvas is zoomed out.
    -->
    <Tooltip v-else-if="label && label.icon" :delay-duration="150">
      <TooltipTrigger as-child>
        <g
          class="bg-edge__label bg-edge__label--info"
          :class="{
            'bg-edge__label--movable': !presenting,
            'bg-edge__label--dragging': draggingLabel,
          }"
          @pointerdown="startDragLabel"
          @dblclick="onLabelDoubleClick"
        >
          <rect
            :x="label.x"
            :y="label.y"
            :width="label.width"
            :height="label.height"
            rx="4"
            :fill="label.fill"
            :stroke="label.stroke"
            stroke-width="1"
          />
          <text
            v-if="label.text"
            :x="label.textX"
            :y="label.textY"
            text-anchor="middle"
            font-size="11"
            :fill="label.color"
            class="pointer-events-none select-none"
          >
            {{ label.text }}
          </text>
          <Info
            :x="label.icon.x"
            :y="label.icon.y"
            :size="EDGE_LABEL_INFO_ICON"
            :stroke-width="2.25"
            :color="label.color"
            class="pointer-events-none"
          />
        </g>
      </TooltipTrigger>
      <!--
        Vue keeps creating elements in the SVG namespace even once they are
        portalled out to <body> — the tooltip would come out as an SVG <div>
        that never renders. A foreignObject is the one place that namespace ends.
      -->
      <foreignObject width="0" height="0">
        <TooltipContent side="top" :side-offset="6" class="block">
          <p class="max-w-xs text-left break-words whitespace-pre-wrap">{{ label.info }}</p>
        </TooltipContent>
      </foreignObject>
    </Tooltip>

    <!--
      Hovering the tag says why it is there and how to make it go away, since
      the cause — a flow paused in the editor, maybe long ago — is nowhere near
      it; clicking it goes straight there. Inert while presenting, like the rest
      of the canvas.
    -->
    <Tooltip v-if="pausedTag" :delay-duration="150" :disabled="presenting">
      <TooltipTrigger as-child>
        <g
          class="bg-edge__paused select-none"
          :class="{ 'bg-edge__paused--live': !presenting }"
          role="button"
          :aria-label="`${pausedTag.text}. Open the message flow editor to run it again.`"
          @pointerdown.stop
          @click.stop="openPausedFlow"
          @dblclick.stop
        >
          <rect
            :x="pausedTag.x"
            :y="pausedTag.y"
            :width="pausedTag.width"
            height="16"
            rx="8"
            :fill="theme.bg"
            :stroke="theme.muted"
            stroke-width="1"
            stroke-dasharray="3 2"
          />
          <text
            :x="pausedTag.cx"
            :y="pausedTag.y + 11"
            text-anchor="middle"
            font-size="10"
            :fill="theme.muted"
            class="pointer-events-none"
          >
            {{ pausedTag.text }}
          </text>
        </g>
      </TooltipTrigger>
      <!-- See the label's tooltip above for why this sits in a foreignObject. -->
      <foreignObject width="0" height="0">
        <TooltipContent side="top" :side-offset="6" class="block max-w-64 space-y-1 text-left">
          <p class="font-semibold">
            {{ pausedFlowCount === 1 ? 'This message flow is paused' : 'These message flows are paused' }}
          </p>
          <p class="opacity-80">{{ pausedNames }} {{ pausedFlowCount === 1 ? 'does' : 'do' }} not move along this connection right now.</p>
          <p>
            To remove this tag, open <strong>Message flows</strong> and press
            <strong>▶ Run</strong> on the flow. Click the tag to go there.
          </p>
        </TooltipContent>
      </foreignObject>
    </Tooltip>
  </template>

  <!--
    Route handles — see `RouteHandle`. A bar across the middle of each leg of
    an orthogonal line, lying along it, to push that leg sideways; a dashed
    dot in the middle of each stretch of any other line, to pull a bend out of
    it. Under the bend-point dots, which are aimed at more precisely still.
  -->
  <g
    v-for="handle in routeHandles"
    :key="`${handle.kind}:${handle.index}`"
    class="bg-edge__route-handle"
    :class="
      handle.kind === 'bend'
        ? 'bg-edge__route-handle--bend'
        : handle.vertical
          ? 'bg-edge__route-handle--x'
          : 'bg-edge__route-handle--y'
    "
    @pointerdown="startRouteHandle($event, handle)"
    @dblclick.stop
  >
    <template v-if="handle.kind === 'segment'">
      <rect
        :x="handle.at.x - (handle.vertical ? 7 : 12)"
        :y="handle.at.y - (handle.vertical ? 12 : 7)"
        :width="handle.vertical ? 14 : 24"
        :height="handle.vertical ? 24 : 14"
        fill="transparent"
        class="bg-edge__route-hit"
      />
      <rect
        :x="handle.at.x - (handle.vertical ? 3 : 8)"
        :y="handle.at.y - (handle.vertical ? 8 : 3)"
        :width="handle.vertical ? 6 : 16"
        :height="handle.vertical ? 16 : 6"
        rx="3"
        :fill="theme.bg"
        :stroke="theme.waypoint"
        stroke-width="1.5"
        class="bg-edge__route-mark pointer-events-none"
      />
    </template>
    <template v-else>
      <circle
        :cx="handle.at.x"
        :cy="handle.at.y"
        r="9"
        fill="transparent"
        class="bg-edge__route-hit"
      />
      <circle
        :cx="handle.at.x"
        :cy="handle.at.y"
        r="4.5"
        :fill="theme.bg"
        :stroke="theme.waypoint"
        stroke-width="1.5"
        stroke-dasharray="2.2 1.6"
        class="bg-edge__route-mark pointer-events-none"
      />
    </template>
  </g>

  <template v-if="props.selected && !dragging && waypoints.length">
    <template v-for="(point, index) in waypoints" :key="index">
      <!--
        Bigger than the dot itself: a 5px dot is not a reliable click target on
        its own. `fill="transparent"` alone will not do here — Chrome treats an
        SVG shape with no actual paint as unhittable, same as `fill="none"`, so
        the click falls through to the add-point strip underneath; forcing
        `pointer-events: all` in the stylesheet is what actually makes it grabbable.
      -->
      <circle
        :cx="point.x"
        :cy="point.y"
        r="10"
        fill="transparent"
        class="bg-edge__waypoint-hit"
        @pointerdown="startDragWaypoint($event, index)"
        @dblclick.stop="removeWaypoint(index)"
        @contextmenu.prevent.stop="removeWaypoint(index)"
      />
      <!-- Filled once selected, hollow otherwise — the same distinction a node's own selection makes. -->
      <circle
        :cx="point.x"
        :cy="point.y"
        r="5"
        :fill="isWaypointSelected(id, index) ? theme.waypoint : theme.bg"
        :stroke="theme.waypoint"
        stroke-width="2"
        class="pointer-events-none"
      />
    </template>
  </template>
</template>

<style scoped>
/*
 * Transparent until the connector is hovered, when it lights up to show
 * exactly how much of the end is grabbable — a node's own dots follow the
 * same rule, and for the same reason: shown all the time, one of these at
 * both ends of every connection on the canvas would be its own kind of
 * clutter. The same blue as a node's own selection outline — reconnecting an
 * end is a selection-level move, not a routing one, which is what the purple
 * below is for.
 */
.bg-edge__grab {
  stroke: var(--bg-selection);
  stroke-opacity: 0;
  cursor: crosshair;
  transition: stroke-opacity 120ms ease;
}

.bg-edge__grab:hover {
  stroke-opacity: 0.25;
}

/*
 * Same idea as `.bg-edge__grab`, in the waypoint colour: this adds a bend
 * point rather than reconnecting an end. Unlike the reconnect zones it does
 * not light up on a plain hover — only once shift is held (`--armed`), since
 * that is the only time a click here does anything.
 */
.bg-edge__grab-add {
  stroke: var(--bg-waypoint);
  stroke-opacity: 0;
  transition: stroke-opacity 120ms ease;
}

.bg-edge__grab-add--armed {
  stroke-opacity: 0.25;
  cursor: copy;
}

/*
 * Vue Flow only lets an edge's visible stroke take the pointer, which would
 * leave a label's fill dead to hover and drag, and the info in it unreachable.
 */
.bg-edge__label {
  pointer-events: all;
}

.bg-edge__label--info {
  cursor: help;
}

/* Same reason as the label: Vue Flow would otherwise leave the tag's fill dead to hover. */
.bg-edge__paused {
  pointer-events: none;
}

.bg-edge__paused--live {
  pointer-events: all;
  cursor: pointer;
}

.bg-edge__paused--live:hover rect {
  stroke-dasharray: none;
}

/* A label can be picked up and moved, wherever it sits — except while presenting. */
.bg-edge__label--movable {
  cursor: grab;
}

.bg-edge__label--dragging {
  cursor: grabbing;
}

/*
 * A route handle's cursor says which way it moves: a leg that runs across can
 * only go up or down, one that runs up and down only sideways. Same paint
 * trick as the bend points' hit circle below — a transparent fill takes no
 * pointer without `pointer-events: all`.
 */
.bg-edge__route-hit {
  pointer-events: all;
}

.bg-edge__route-handle--y {
  cursor: ns-resize;
}

.bg-edge__route-handle--x {
  cursor: ew-resize;
}

.bg-edge__route-handle--bend {
  cursor: move;
}

.bg-edge__route-handle:hover .bg-edge__route-mark {
  fill: var(--bg-waypoint);
}

.bg-edge__waypoint-hit {
  cursor: grab;
  pointer-events: all;
}
</style>
