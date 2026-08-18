<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EdgeProps } from '@vue-flow/core'
import { useVueFlow } from '@vue-flow/core'
import type { EdgeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import FlowTokens from '@/features/diagram/components/FlowTokens.vue'
import { arrowHeadPath, dashArray, edgeGeometry } from '@/features/diagram/lib/edge-path'
import { COLOR_HEX, diagramTheme, edgeColor, edgeStrokeWidth, mix } from '@/features/diagram/lib/theme'
import { measureText } from '@/features/diagram/lib/text'

const props = defineProps<EdgeProps<EdgeData>>()

const { canvas } = useDiagram()
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

const geometry = computed(() =>
  edgeGeometry(boxOf(props.sourceNode), boxOf(props.targetNode), {
    sourceSide: props.data.sourceSide,
    targetSide: props.data.targetSide,
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
