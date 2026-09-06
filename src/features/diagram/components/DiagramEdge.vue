<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Connection, EdgeProps } from '@vue-flow/core'
import { useHandle, useVueFlow } from '@vue-flow/core'
import type { EdgeData, NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import FlowTokens from '@/features/diagram/components/FlowTokens.vue'
import type { Vec } from '@/features/diagram/lib/edge-path'
import {
  arrowHeadPath,
  dashArray,
  edgeGeometry,
  endpointOf,
  nearestSegmentIndex,
} from '@/features/diagram/lib/edge-path'
import { COLOR_HEX, diagramTheme, edgeColor, edgeStrokeWidth, mix } from '@/features/diagram/lib/theme'
import { measureText } from '@/features/diagram/lib/text'

const props = defineProps<EdgeProps<EdgeData>>()

const {
  canvas,
  reconnectEdge,
  reconnectingEdge,
  commit,
  endCoalesce,
  updateEdgeData,
  isWaypointSelected,
  selectWaypoint,
  shiftWaypointSelectionForInsert,
  shiftWaypointSelectionForRemove,
} = useDiagram()
const { getNodes, screenToFlowCoordinate } = useVueFlow()
const { highlightOf, registerEdgePath, unregisterEdgePath, invalidateEdgePath } = useFlows()

const theme = computed(() => diagramTheme(canvas.theme))

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
 */
const obstacles = computed(() =>
  getNodes.value
    .filter((node) => node.type !== 'zone' && node.id !== props.source && node.id !== props.target)
    .map(boxOf),
)

/** A node's connection points, as its data carries them. Zones have none of their own. */
const portsOf = (node: EdgeProps['sourceNode']) => (node.data as NodeData | undefined)?.ports

const geometry = computed(() =>
  edgeGeometry(boxOf(props.sourceNode), boxOf(props.targetNode), {
    sourceSide: props.data.sourceSide,
    targetSide: props.data.targetSide,
    sourcePorts: portsOf(props.sourceNode),
    targetPorts: portsOf(props.targetNode),
    sourcePort: props.data.sourcePort,
    targetPort: props.data.targetPort,
    route: props.data.route,
    obstacles: obstacles.value,
    waypoints: props.data.waypoints,
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

function onWaypointPointerMove(event: PointerEvent) {
  if (draggingWaypoint.value === null) return
  const next = [...waypoints.value]
  next[draggingWaypoint.value] = flowPoint(event)
  updateEdgeData(props.id, { waypoints: next })
}

function stopDraggingWaypoint() {
  draggingWaypoint.value = null
  window.removeEventListener('pointermove', onWaypointPointerMove)
  window.removeEventListener('pointerup', stopDraggingWaypoint)
}

function beginDraggingWaypoint(index: number) {
  draggingWaypoint.value = index
  window.addEventListener('pointermove', onWaypointPointerMove)
  window.addEventListener('pointerup', stopDraggingWaypoint, { once: true })
}

/**
 * Picks up an existing bend point to drag it elsewhere. Also selects it —
 * plainly, or added to the running selection with shift/ctrl/cmd held — so a
 * point can be picked out for aligning without needing a separate click just
 * to select it.
 */
function startDragWaypoint(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  event.stopPropagation()
  selectWaypoint(props.id, index, event.shiftKey || event.ctrlKey || event.metaKey)
  commit()
  endCoalesce()
  beginDraggingWaypoint(index)
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
 * Shift-dragging the line itself, anywhere along its middle stretch, drops a
 * new bend point right there and picks it straight up for dragging — the
 * literal "move the connection" gesture this feature is for.
 *
 * Only on a connection already switched to manual routing (from the inspector,
 * or by having placed a point before), and only with shift held: a plain click
 * on a connection selects it and nothing more. Adding a bend point is a
 * deliberate act, not something an ordinary click should trigger by accident.
 */
function startAddWaypoint(event: PointerEvent) {
  if (event.button !== 0 || !event.shiftKey || !waypoints.value.length) return
  event.stopPropagation()
  commit()
  endCoalesce()
  hoverPoint.value = null
  const point = closestPointOnPath(flowPoint(event))
  const points = [geometry.value.start, ...waypoints.value, geometry.value.end]
  const index = nearestSegmentIndex(points, point)
  shiftWaypointSelectionForInsert(props.id, index)
  // Sole-selected, not added to any running selection: shift is the add-point
  // modifier here, so it is always down and cannot also mean "extend selection".
  selectWaypoint(props.id, index, false)
  const next = [...waypoints.value]
  next.splice(index, 0, point)
  updateEdgeData(props.id, { waypoints: next })
  beginDraggingWaypoint(index)
}

/**
 * Where a new bend point would land if shift-clicked right now — the point on
 * the line nearest the cursor, the same value `startAddWaypoint` would use, so
 * the dot slides along the connection instead of floating beside it. Only
 * tracked while shift is held over a connection that is already manually
 * routed: without shift a click just selects, so previewing a point it would
 * not place would be a lie.
 */
const hoverPoint = ref<Vec | null>(null)

function onHoverAddWaypoint(event: PointerEvent) {
  if (draggingWaypoint.value !== null || !waypoints.value.length || !event.shiftKey) {
    hoverPoint.value = null
    return
  }
  hoverPoint.value = closestPointOnPath(flowPoint(event))
}

function clearHoverPoint() {
  hoverPoint.value = null
}

onBeforeUnmount(stopDraggingWaypoint)

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

const label = computed(() => {
  if (!props.data.label) return null
  const width = measureText(props.data.label, 11) + 13
  return {
    text: props.data.label,
    x: geometry.value.mid.x - width / 2,
    y: geometry.value.mid.y - 9,
    width,
    fill: theme.value.bg,
    stroke: mix(stroke.value, theme.value.bg, 0.72),
    color: props.selected ? theme.value.selection : theme.value.muted,
  }
})
</script>

<template>
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

    <template v-if="label">
      <rect
        :x="label.x"
        :y="label.y"
        :width="label.width"
        height="18"
        rx="4"
        :fill="label.fill"
        :stroke="label.stroke"
        stroke-width="1"
      />
      <text
        :x="geometry.mid.x"
        :y="geometry.mid.y + 4"
        text-anchor="middle"
        font-size="11"
        :fill="label.color"
        class="pointer-events-none select-none"
      >
        {{ label.text }}
      </text>
    </template>
  </template>

  <!--
    Manual routing: only while the connection is selected, and only once it has
    been switched to manual routing (from the inspector, or by already carrying
    a bend point), so an automatic connection stays free of editing chrome.
    Shift-dragging the line itself drops a new bend point and starts dragging
    it; the dots are the bend points already placed, draggable to move and
    double-clickable to remove.
  -->
  <template v-if="props.selected && !dragging && waypoints.length">
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

.bg-edge__waypoint-hit {
  cursor: grab;
  pointer-events: all;
}
</style>
