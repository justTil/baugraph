<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { DEFAULT_NODE_SIZE } from '@/model'
import { iconComponent } from '@/features/diagram/data/icons'
import { STACKED_SHAPES, contentInset, shapeElements } from '@/features/diagram/lib/shapes'
import { diagramTheme, nodePaint } from '@/features/diagram/lib/theme'
import { useDiagram } from '@/features/diagram/composables/useDiagram'

const props = defineProps<NodeProps<NodeData>>()

const { canvas, commit } = useDiagram()

const width = computed(() => props.dimensions.width || DEFAULT_NODE_SIZE.width)
const height = computed(() => props.dimensions.height || DEFAULT_NODE_SIZE.height)

const theme = computed(() => diagramTheme(canvas.theme))
const paint = computed(() => nodePaint({ color: props.data.color, kind: 'shape' }, theme.value))
const elements = computed(() => shapeElements(props.data.shape, width.value, height.value))

const icon = computed(() => iconComponent(props.data.icon))
const inset = computed(() => contentInset(props.data.shape, height.value))

/** Diamonds and circles have little usable width at the edges, so text stacks. */
const stacked = computed(() => STACKED_SHAPES.has(props.data.shape) || !icon.value)

/**
 * Diamonds and circles taper, so their text has to be held well inside the box.
 * Every other shape lets flexbox do the clamping — see `min-w-0` below.
 */
const textWidth = computed(() => {
  if (props.data.shape === 'diamond') return `${width.value * 0.62}px`
  if (props.data.shape === 'circle') return `${width.value * 0.72}px`
  return undefined
})

const HANDLES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const
</script>

<template>
  <NodeResizer
    v-if="selected"
    :min-width="60"
    :min-height="34"
    :color="theme.selection"
    :handle-style="{ width: '8px', height: '8px', borderRadius: '2px' }"
    @resize-start="commit()"
  />

  <div class="bg-node group" :class="{ 'bg-node--selected': selected }">
    <svg
      class="pointer-events-none absolute inset-0"
      :width="width"
      :height="height"
      aria-hidden="true"
    >
      <component
        :is="element.tag"
        v-for="(element, i) in elements"
        :key="i"
        v-bind="element.attrs"
        :fill="element.role === 'body' ? paint.fill : 'none'"
        :stroke="paint.stroke"
        stroke-width="1.5"
      />
    </svg>

    <div
      class="relative flex h-full items-center gap-2.5 px-3"
      :class="stacked ? 'flex-col justify-center gap-1.5 text-center' : ''"
      :style="{
        paddingTop: `${inset.top}px`,
        paddingRight: `${12 + inset.right}px`,
      }"
    >
      <component
        :is="icon"
        v-if="icon"
        :size="20"
        :stroke-width="1.75"
        class="shrink-0"
        :style="{ color: paint.accent }"
      />
      <div class="min-w-0 flex-1" :style="{ maxWidth: textWidth }">
        <div
          class="truncate text-[13px] leading-tight font-semibold"
          :style="{ color: paint.ink }"
        >
          {{ data.label }}
        </div>
        <div
          v-if="data.sublabel"
          class="truncate text-[11px] leading-tight"
          :style="{ color: paint.muted }"
        >
          {{ data.sublabel }}
        </div>
      </div>
    </div>

    <!--
      Each side carries a target handle beneath a source handle so a connection
      can be started from, or dropped onto, any of the four sides.
    -->
    <template v-for="handle in HANDLES" :key="handle.id">
      <Handle
        :id="handle.id"
        type="target"
        :position="handle.position"
        class="bg-node__handle bg-node__handle--target"
      />
      <Handle
        :id="handle.id"
        type="source"
        :position="handle.position"
        class="bg-node__handle"
      />
    </template>
  </div>
</template>

<style scoped>
.bg-node {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Handles stay out of the way until the node is hovered or selected. */
.bg-node :deep(.bg-node__handle) {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  border: 1.6px solid var(--bg-selection);
  background: var(--bg-canvas);
  opacity: 0;
  transition: opacity 120ms ease;
}

.bg-node:hover :deep(.bg-node__handle),
.bg-node--selected :deep(.bg-node__handle) {
  opacity: 1;
}

/* The target handle is a larger invisible drop zone behind the visible dot. */
.bg-node :deep(.bg-node__handle--target) {
  width: 22px;
  height: 22px;
  border-color: transparent;
  background: transparent;
  opacity: 1;
}
</style>
