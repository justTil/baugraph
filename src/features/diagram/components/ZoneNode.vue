<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { DEFAULT_ZONE_SIZE } from '@/model'
import { roundedRect } from '@/features/diagram/lib/shapes'
import { diagramTheme, nodePaint } from '@/features/diagram/lib/theme'

const props = defineProps<NodeProps<NodeData>>()

const { canvas, commit } = useDiagram()

const width = computed(() => props.dimensions.width || DEFAULT_ZONE_SIZE.width)
const height = computed(() => props.dimensions.height || DEFAULT_ZONE_SIZE.height)

const theme = computed(() => diagramTheme(canvas.theme))
const paint = computed(() => nodePaint({ color: props.data.color, kind: 'zone' }, theme.value))
const frame = computed(() => roundedRect(0.75, 0.75, width.value - 1.5, height.value - 1.5, 12))
</script>

<template>
  <NodeResizer
    v-if="selected"
    :min-width="120"
    :min-height="90"
    :color="theme.selection"
    :handle-style="{ width: '8px', height: '8px', borderRadius: '2px' }"
    @resize-start="commit()"
  />

  <div class="bg-zone">
    <svg
      class="pointer-events-none absolute inset-0"
      :width="width"
      :height="height"
      aria-hidden="true"
    >
      <path
        :d="frame"
        :fill="paint.fill"
        :stroke="paint.stroke"
        stroke-width="1.5"
        stroke-dasharray="7 5"
      />
    </svg>

    <!--
      Only the header strip is draggable. The rest of the zone stays click-through
      so nodes inside it can be selected and dragged normally.
    -->
    <div class="bg-zone__header">
      <div
        class="truncate text-[12px] leading-tight font-bold tracking-wider uppercase"
        :style="{ color: paint.accent }"
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
</template>

<style scoped>
.bg-zone {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.bg-zone__header {
  position: absolute;
  top: 8px;
  left: 13px;
  right: 13px;
  pointer-events: all;
  cursor: move;
}
</style>
