<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { Lock } from '@lucide/vue'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { DEFAULT_ZONE_SIZE } from '@/model'
import { roundedRect } from '@/features/diagram/lib/shapes'
import { fitZoneMinSize } from '@/features/diagram/lib/auto-size'
import { nodeCaption } from '@/features/diagram/lib/node-caption'
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

/** What the zone is — VPC, cluster, namespace — kept on it after a rename. */
const caption = computed(() => nodeCaption(props.data))

/** A zone is never pulled in over the header it carries. */
const min = computed(() => fitZoneMinSize(props.data))
</script>

<template>
  <NodeResizer
    v-if="selected && !data.locked"
    :min-width="min.width"
    :min-height="min.height"
    :color="theme.selection"
    :handle-style="{
      width: '11px',
      height: '11px',
      borderRadius: '3px',
      borderWidth: '1.5px',
    }"
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
      The whole frame selects and drags the zone — hunting for the header strip
      to move a zone gets old fast. Nodes inside it are painted above it and take
      the click first; lock the zone when even that gets in the way.
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
      <div v-if="caption" class="truncate text-[10px] leading-tight">
        <span v-if="caption.type" :style="{ color: paint.muted }">{{ caption.type }}</span>
        <span v-if="caption.type && caption.tech" :style="{ color: paint.muted }"> · </span>
        <span
          v-if="caption.tech"
          class="font-semibold"
          :style="{ color: paint.accent }"
        >{{ caption.tech }}</span>
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

/* Locked: only the badge stays live, so nothing here can be grabbed. */
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
