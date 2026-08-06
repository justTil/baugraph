<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { Lock } from '@lucide/vue'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { DEFAULT_ZONE_SIZE } from '@/model'
import { roundedRect } from '@/features/diagram/lib/shapes'
import { diagramTheme, nodePaint } from '@/features/diagram/lib/theme'

const props = defineProps<NodeProps<NodeData>>()

const { canvas, commit, endCoalesce, setNodesLocked } = useDiagram()

/**
 * Locking a zone is the usual way to work inside one: the frame stops answering
 * the pointer entirely, so the header can no longer be grabbed by accident.
 */
function unlock() {
  commit()
  endCoalesce()
  setNodesLocked([props.id], false)
}

const width = computed(() => props.dimensions.width || DEFAULT_ZONE_SIZE.width)
const height = computed(() => props.dimensions.height || DEFAULT_ZONE_SIZE.height)

const theme = computed(() => diagramTheme(canvas.theme))
const paint = computed(() => nodePaint({ color: props.data.color, kind: 'zone' }, theme.value))
const frame = computed(() => roundedRect(0.75, 0.75, width.value - 1.5, height.value - 1.5, 12))
</script>

<template>
  <NodeResizer
    v-if="selected && !data.locked"
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
    <div class="bg-zone__header" :class="{ 'bg-zone__header--locked': data.locked }">
      <div class="flex items-center gap-1.5">
        <button
          v-if="data.locked"
          type="button"
          class="bg-zone__lock"
          title="Unlock zone"
          :style="{ color: paint.muted, background: theme.bg, borderColor: paint.stroke }"
          @pointerdown.stop
          @click.stop="unlock()"
        >
          <Lock :size="11" :stroke-width="2" />
        </button>
        <div
          class="truncate text-[12px] leading-tight font-bold tracking-wider uppercase"
          :style="{ color: paint.accent }"
        >
          {{ data.label }}
        </div>
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

/* Locked: only the badge stays live, so the header cannot be grabbed. */
.bg-zone__header--locked {
  pointer-events: none;
  cursor: default;
}

.bg-zone__lock {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 9999px;
  border: 1px solid;
  pointer-events: all;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 120ms ease;
}

.bg-zone__lock:hover {
  opacity: 1;
}
</style>
