<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Connection, EdgeProps } from '@vue-flow/core'
import { useHandle, useVueFlow } from '@vue-flow/core'
import type { EdgeData, NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import FlowTokens from '@/features/diagram/components/FlowTokens.vue'
import { arrowHeadPath, dashArray, edgeGeometry, endpointOf } from '@/features/diagram/lib/edge-path'
import { COLOR_HEX, diagramTheme, edgeColor, edgeStrokeWidth, mix } from '@/features/diagram/lib/theme'
import { measureText } from '@/features/diagram/lib/text'

const props = defineProps<EdgeProps<EdgeData>>()

const { canvas, reconnectEdge, reconnectingEdge, commit, endCoalesce } = useDiagram()
const { getNodes } = useVueFlow()
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
 * a dot only findable by first hovering exactly over it. Capped at half the
 * connector's own length, so the two ends of a short connector meet in the
 * middle instead of trying to overlap.
 */
const GRAB_FRACTION = 0.35
const GRAB_SAMPLES = 20

const nearSourcePath = ref('')
const nearTargetPath = ref('')

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
 * Rebuilds the two grab zones from the line actually on screen, rather than
 * re-deriving them from `geometry` — sampling the rendered path is one
 * implementation that works whether that geometry is a straight run, a
 * curve, or a routed polyline, with no case to add when routing grows one.
 */
function updateGrabZones() {
  const el = pathEl.value
  if (!el) return
  const len = el.getTotalLength()
  const reach = Math.min(len * GRAB_FRACTION, len / 2)
  nearSourcePath.value = sampleRange(el, 0, reach)
  nearTargetPath.value = sampleRange(el, len - reach, len)
}

watch([pathEl, () => geometry.value.path], updateGrabZones, { flush: 'post' })

/** Set while an end is being dragged loose, so the drawn line stays out of the way of Vue Flow's own in-progress connection line. */
const dragging = ref(false)

const dragNodeId = ref('')
const dragHandleId = ref<string | null>(null)
/** Which end of a *fresh* connection the fixed node would be playing. */
const dragFixedEnd = ref<'source' | 'target'>('source')

/**
 * Only one end of a reconnect drag ever moves — Vue Flow holds the other
 * fixed and reports it back with no handle id of its own, so that end's side
 * and port are kept from the connection's existing data rather than read off
 * the event, or the drag would reset it to `auto` on every reconnect.
 */
function applyReconnect(connection: Connection) {
  const sourceMoved = connection.target === props.target
  const from = sourceMoved
    ? endpointOf(connection.sourceHandle)
    : { side: props.data.sourceSide, port: props.data.sourcePort }
  const to = sourceMoved
    ? { side: props.data.targetSide, port: props.data.targetPort }
    : endpointOf(connection.targetHandle)
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
  dragNodeId.value = end === 'source' ? props.target : props.source
  dragHandleId.value = null
  dragFixedEnd.value = end === 'source' ? 'target' : 'source'
  handlePointerDown(event)
}

/**
 * Lit while the inspector points at a flow that runs over this connection. The
 * halo takes the flow's colour, so two flows sharing a connection stay tellable
 * apart as each is pointed at in turn.
 */
const highlight = computed(() => {
  const color = highlightOf(props.id)
  return color ? COLOR_HEX[color] : null
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
      :d="geometry.path"
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
    Where the connection itself can be picked up and dragged onto a different
    node — the last stretch of the line at each end, not just its exact tip.
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
 * clutter.
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
</style>
