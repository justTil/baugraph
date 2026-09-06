<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { Lock } from '@lucide/vue'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import type { PortSide } from '@/model'
import { DEFAULT_NODE_SIZE, PORT_SIDES, nodePorts } from '@/model'
import { iconComponent } from '@/features/diagram/data/icons'
import { CENTERED_SHAPES, contentInset, shapeElements } from '@/features/diagram/lib/shapes'
import { fitNodeSize } from '@/features/diagram/lib/auto-size'
import { nodeCaption } from '@/features/diagram/lib/node-caption'
import { diagramTheme, nodePaint } from '@/features/diagram/lib/theme'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useConnectionTarget } from '@/features/diagram/composables/useConnectionTarget'

const props = defineProps<NodeProps<NodeData>>()

const { canvas, commit, endCoalesce, setNodesLocked, resizingNodeId } = useDiagram()
const { connecting, from: connectFrom, to: connectTo } = useConnectionTarget()

/** The badge is the only way back: a locked node cannot be selected. */
function unlock() {
  commit()
  endCoalesce()
  setNodesLocked([props.id], false)
}

function onResizeStart() {
  commit()
  resizingNodeId.value = props.id
}

function onResizeEnd() {
  resizingNodeId.value = null
}

const width = computed(() => props.dimensions.width || DEFAULT_NODE_SIZE.width)
const height = computed(() => props.dimensions.height || DEFAULT_NODE_SIZE.height)

const theme = computed(() => diagramTheme(canvas.theme))
const paint = computed(() =>
  nodePaint({ color: props.data.color, kind: 'shape', border: props.data.border }, theme.value),
)
const elements = computed(() =>
  shapeElements(props.data.shape, width.value, height.value, paint.value.strokeWidth),
)

const icon = computed(() => iconComponent(props.data.icon))
const inset = computed(() => contentInset(props.data.shape, height.value))

/** What the node is, kept on it whatever the user renames it to. */
const caption = computed(() => nodeCaption(props.data))

/**
 * Diamonds and circles have little usable width at their edges, so the icon and
 * the text ride together in the middle instead of starting at the left padding.
 * A node with no icon centres too — there is nothing for the text to sit beside.
 */
const centered = computed(() => CENTERED_SHAPES.has(props.data.shape) || !icon.value)

/** How much of the row the icon claims, in the same units as the gap below. */
const ICON_BLOCK = 20 + 10

/**
 * Diamonds and circles taper, so their text has to be held well inside the box,
 * and an icon beside it eats into the same allowance. Every other shape lets
 * flexbox do the clamping — see `min-w-0` below.
 */
const textWidth = computed(() => {
  const share = props.data.shape === 'diamond' ? 0.62 : props.data.shape === 'circle' ? 0.72 : 0
  if (!share) return undefined
  return `${Math.max(24, width.value * share - (icon.value ? ICON_BLOCK : 0))}px`
})

/** A resize drag stops here, so a node can never be pulled in over its own text. */
const fit = computed(() =>
  fitNodeSize({
    label: props.data.label,
    type: props.data.type,
    tech: props.data.tech,
    sublabel: props.data.sublabel,
    shape: props.data.shape,
    icon: props.data.icon,
  }),
)

const HANDLE_POSITION: Record<PortSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

/**
 * The node's connection points, in the order they are drawn.
 *
 * A side offers one point unless the node says otherwise, and the extras are
 * spread evenly along it — the same fractions `edge-path` anchors on, because a
 * dot has to sit exactly where the connection it starts will meet the node. Vue
 * Flow pins each handle to the middle of its own side, so the offset is written
 * over that one axis and its centring transform does the rest.
 *
 * The id carries both halves — `right:3` — and that is all `onConnect` needs to
 * write the connection down (see `DiagramCanvas`).
 */
/**
 * The point on this node a release would connect to, while a drag is looking for
 * one. Named rather than left to CSS: the canvas cannot mark it with a class of
 * its own without also marking the drops that would be refused (see
 * `useConnectionTarget`).
 */
const dropHandle = computed(() =>
  connectTo.value?.nodeId === props.id ? connectTo.value.id : null,
)

/** The point the drag came out of, if it came out of this node. */
const fromHandle = computed(() =>
  connectFrom.value?.nodeId === props.id ? connectFrom.value.id : null,
)

const handles = computed(() => {
  const ports = nodePorts(props.data.ports)
  return PORT_SIDES.flatMap((side) => {
    const count = ports[side]
    const horizontal = side === 'top' || side === 'bottom'
    const along = horizontal ? 'left' : 'top'
    // A crowded side cannot keep pointer-sized targets: six of them down one
    // flank of a default node would overlap two deep, and the one under the
    // cursor would not be the one that got grabbed. Both the grab zone and the
    // dot shrink to the room actually available, down to a floor that is still
    // worth aiming at.
    const pitch = (horizontal ? width.value : height.value) / (count + 1)
    const grab = Math.round(Math.min(24, Math.max(12, pitch)))
    const dot = Math.round(Math.min(10, Math.max(6, pitch * 0.55)))

    return Array.from({ length: count }, (_, i) => ({
      id: `${side}:${i + 1}`,
      position: HANDLE_POSITION[side],
      style: {
        [along]: `${((i + 1) / (count + 1)) * 100}%`,
        '--bg-handle': `${grab}px`,
        '--bg-dot': `${dot}px`,
      },
    }))
  })
})
</script>

<template>
  <!--
    Resizing is the most-repeated gesture on a diagram, so the grab zones are
    generous: fat corner handles, and a whole side that can be dragged anywhere
    along its length (see `.vue-flow__resize-control` in `DiagramCanvas`).
  -->
  <NodeResizer
    v-if="selected && !data.locked"
    :min-width="fit.width"
    :min-height="fit.height"
    :color="theme.selection"
    :handle-style="{
      width: '11px',
      height: '11px',
      borderRadius: '3px',
      borderWidth: '1.5px',
    }"
    @resize-start="onResizeStart"
    @resize-end="onResizeEnd"
  />

  <div
    class="bg-node group"
    :class="{
      'bg-node--selected': selected,
      'bg-node--locked': data.locked,
      'bg-node--connecting': connecting,
    }"
  >
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
        :stroke-width="paint.strokeWidth"
        stroke-linejoin="round"
      />
    </svg>

    <div
      class="relative flex h-full items-center gap-2.5 px-3"
      :class="centered ? 'justify-center text-center' : ''"
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
      <!-- Centred, the text must not grow: `flex-1` would spread it across the
           whole row and push the icon back out to the left edge. -->
      <div
        class="min-w-0"
        :class="centered ? '' : 'flex-1'"
        :style="{ maxWidth: textWidth }"
      >
        <div
          class="truncate text-[13px] leading-tight font-semibold"
          :style="{ color: paint.ink }"
        >
          {{ data.label }}
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

    <button
      v-if="data.locked"
      type="button"
      class="bg-node__lock"
      title="Unlock (click to edit again)"
      :style="{ color: paint.muted, background: theme.bg, borderColor: paint.stroke }"
      @pointerdown.stop
      @click.stop="unlock()"
    >
      <Lock :size="11" :stroke-width="2" />
    </button>

    <!--
      One dot per connection point — one a side, until a side is given more — and
      every one of them a *source* handle. The canvas runs in loose mode, so a
      source handle is dropped onto exactly as readily as it is dragged from —
      and with no target handle anywhere to start a drag on, a connection can no
      longer come out pointing back the way it was drawn (see `onConnect` in
      `DiagramCanvas`).
    -->
    <Handle
      v-for="handle in handles"
      :id="handle.id"
      :key="handle.id"
      type="source"
      :position="handle.position"
      :style="handle.style"
      class="bg-node__handle"
      :class="{
        'bg-node__handle--drop': handle.id === dropHandle,
        'bg-node__handle--from': handle.id === fromHandle,
      }"
    />
  </div>
</template>

<style scoped>
.bg-node {
  position: relative;
  width: 100%;
  height: 100%;
}

/*
  A locked node is click-through, so a rubber-band selection or a node sitting
  underneath it stays reachable. Only its lock badge answers the pointer.
*/
.bg-node--locked {
  pointer-events: none;
}

.bg-node__lock {
  position: absolute;
  top: -7px;
  right: -7px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  border: 1px solid;
  pointer-events: all;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 120ms ease;
}

.bg-node__lock:hover {
  opacity: 1;
}

/*
 * The handle element is an invisible disc more than twice the size of the dot
 * drawn inside it: it is the thing being grabbed and dropped on, so it is sized
 * for a pointer rather than for the eye. Vue Flow centres a handle on its own
 * side whatever its size, so the point a connection actually meets the node is
 * unchanged — only the target got easier to hit.
 */
.bg-node :deep(.bg-node__handle) {
  width: var(--bg-handle, 24px);
  height: var(--bg-handle, 24px);
  border: none;
  border-radius: 9999px;
  background: transparent;
}

/* The dot itself stays out of the way until the node is hovered or selected. */
.bg-node :deep(.bg-node__handle)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--bg-dot, 10px);
  height: var(--bg-dot, 10px);
  margin: calc(var(--bg-dot, 10px) / -2) 0 0 calc(var(--bg-dot, 10px) / -2);
  border-radius: 9999px;
  border: 1.6px solid var(--bg-selection);
  background: var(--bg-canvas);
  opacity: 0;
  transition: opacity 120ms ease;
}

.bg-node:hover :deep(.bg-node__handle)::after,
.bg-node--selected :deep(.bg-node__handle)::after {
  opacity: 1;
}

/*
 * While a connection is being dragged, every point on the canvas it could land
 * on comes up faintly — the drop targets are the question being asked, and half
 * of them are on nodes the pointer is nowhere near. Faintly, because all of them
 * at full strength turns a busy diagram into a field of dots.
 */
.bg-node--connecting :deep(.bg-node__handle)::after {
  opacity: 0.4;
}

/* The two ends of the connection about to be made: where it left, where it lands. */
.bg-node :deep(.bg-node__handle--from)::after,
.bg-node :deep(.bg-node__handle--drop)::after {
  opacity: 1;
  border-color: var(--bg-connect);
  background: var(--bg-connect);
}

/*
 * And a ring off the one it lands on. The dots are small by the time a side
 * carries six of them, and a colour change alone is easy to miss mid-drag —
 * movement is what the eye finds without being pointed at it.
 */
.bg-node :deep(.bg-node__handle--drop)::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--bg-dot, 10px);
  height: var(--bg-dot, 10px);
  margin: calc(var(--bg-dot, 10px) / -2) 0 0 calc(var(--bg-dot, 10px) / -2);
  border-radius: 9999px;
  border: 2px solid var(--bg-connect);
  /* The ring grows past the handle it belongs to; it must not take the drop. */
  pointer-events: none;
  animation: bg-connect-pulse 900ms ease-out infinite;
}

@keyframes bg-connect-pulse {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(3.2);
    opacity: 0;
  }
}

/* The colour still says it; only the movement goes. */
@media (prefers-reduced-motion: reduce) {
  .bg-node :deep(.bg-node__handle--drop)::before {
    animation: none;
    transform: scale(2);
    opacity: 0.5;
  }
}

/* Nothing can be connected to a locked node, so its dots stay away. */
.bg-node--locked :deep(.bg-node__handle) {
  display: none;
}
</style>
