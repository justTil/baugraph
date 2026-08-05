<script setup lang="ts">
import { computed } from 'vue'
import type { EdgeProps } from '@vue-flow/core'
import type { EdgeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { arrowHeadPath, dashArray, edgeGeometry } from '@/features/diagram/lib/edge-path'
import { diagramTheme, edgeColor, mix } from '@/features/diagram/lib/theme'
import { measureText } from '@/features/diagram/lib/text'

const props = defineProps<EdgeProps<EdgeData>>()

const { canvas } = useDiagram()

const theme = computed(() => diagramTheme(canvas.theme))

/** Absolute box of a node, including any parent offset Vue Flow has applied. */
const boxOf = (node: EdgeProps['sourceNode']) => ({
  x: node.computedPosition.x,
  y: node.computedPosition.y,
  width: node.dimensions.width,
  height: node.dimensions.height,
})

const geometry = computed(() =>
  edgeGeometry(boxOf(props.sourceNode), boxOf(props.targetNode), {
    sourceSide: props.data.sourceSide,
    targetSide: props.data.targetSide,
    route: props.data.route,
  }),
)

const stroke = computed(() =>
  props.selected ? theme.value.selection : edgeColor(props.data.color, theme.value),
)
const strokeWidth = computed(() => (props.selected ? 2.4 : 1.7))
const dash = computed(() => dashArray(props.data.line))

const showEndArrow = computed(() => props.data.arrows !== 'none')
const showStartArrow = computed(() => props.data.arrows === 'both')

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
  <path
    :id="id"
    :d="geometry.path"
    fill="none"
    :stroke="stroke"
    :stroke-width="strokeWidth"
    :stroke-dasharray="dash"
    :stroke-linecap="data.line === 'dotted' ? 'round' : undefined"
    stroke-linejoin="round"
    class="vue-flow__edge-path"
  />

  <path
    v-if="showEndArrow"
    :d="arrowHeadPath(geometry.end, geometry.endDir)"
    :fill="stroke"
  />
  <path
    v-if="showStartArrow"
    :d="arrowHeadPath(geometry.start, geometry.startDir)"
    :fill="stroke"
  />

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
