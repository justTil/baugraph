<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, onBeforeUnmount } from 'vue'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import {
  registerToken,
  unregisterToken,
  useFlows,
} from '@/features/diagram/composables/useFlows'
import { COLOR_HEX, diagramTheme } from '@/features/diagram/lib/theme'

/**
 * Everything a single connection draws on behalf of the flows that run over it.
 *
 * The two halves are deliberately different machinery. The marching line is pure
 * CSS on an SVG stroke — the animation Vue Flow itself uses for a live edge, and
 * it costs nothing because the browser never asks us about it again. The
 * messages are GSAP's: their `<g>` elements are rendered here and then handed to
 * the runtime, which writes their transforms every frame. Vue owns *which*
 * elements exist, GSAP owns where they are.
 */

const props = defineProps<{
  /** Connection this layer belongs to. */
  edgeId: string
  /** The connection's path data, for the moving line to trace. */
  path: string
}>()

const { canvas } = useDiagram()
const { tokensFor, dashesFor, running } = useFlows()

const theme = computed(() => diagramTheme(canvas.theme))
const tokens = computed(() => tokensFor(props.edgeId))
const dashes = computed(() => dashesFor(props.edgeId))

/**
 * One binder per slot, kept so the callback's identity is stable: a fresh
 * closure every render would have Vue unregister and re-register an element that
 * never moved.
 */
type TemplateRef = Element | ComponentPublicInstance | null

const binders = new Map<string, (el: TemplateRef) => void>()

function bind(key: string) {
  let fn = binders.get(key)
  if (!fn) {
    fn = (el: TemplateRef) => {
      if (el) registerToken(key, el as SVGGElement)
      else unregisterToken(key)
    }
    binders.set(key, fn)
  }
  return fn
}

onBeforeUnmount(() => {
  binders.forEach((_, key) => unregisterToken(key))
  binders.clear()
})
</script>

<template>
  <!--
    The moving line, under the messages. `stroke-linecap` is round so the dashes
    read as travelling pulses rather than as a dashed line style, which is a
    thing a connection can already be.
  -->
  <path
    v-for="dash in dashes"
    :key="`dash-${dash.flow}`"
    :d="path"
    fill="none"
    :stroke="COLOR_HEX[dash.color]"
    stroke-width="2.4"
    stroke-linecap="round"
    stroke-dasharray="6 16"
    class="bg-flow-dash pointer-events-none"
    :class="{ 'bg-flow-dash--still': !running }"
    :style="{ '--bg-flow-dash-duration': `${dash.duration}s` }"
  />

  <!--
    A message. Positioned entirely by the runtime, so it starts hidden and is
    only ever shown once it has been put somewhere.
  -->
  <g
    v-for="slot in tokens"
    :key="slot.key"
    :ref="bind(slot.key)"
    class="pointer-events-none"
    style="display: none"
  >
    <template v-if="slot.shape === 'dot'">
      <!-- The halo lifts the message off a line of its own colour. -->
      <circle r="7.5" :fill="COLOR_HEX[slot.color]" opacity="0.18" />
      <circle
        r="3.8"
        :fill="COLOR_HEX[slot.color]"
        :stroke="theme.bg"
        stroke-width="1.2"
      />
    </template>

    <template v-else-if="slot.shape === 'packet'">
      <rect
        x="-6.5"
        y="-4.5"
        width="13"
        height="9"
        rx="2.5"
        :fill="COLOR_HEX[slot.color]"
        :stroke="theme.bg"
        stroke-width="1.2"
      />
    </template>

    <template v-else>
      <rect
        x="-7.5"
        y="-5.5"
        width="15"
        height="11"
        rx="1.8"
        :fill="COLOR_HEX[slot.color]"
        :stroke="theme.bg"
        stroke-width="1.2"
      />
      <path
        d="M-7.5,-5.5 L0,0.6 L7.5,-5.5"
        fill="none"
        :stroke="theme.bg"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
  </g>
</template>

<style>
/*
 * Decreasing the offset walks the pattern forwards along the path, so the line
 * moves the way the connection points. One pattern per cycle is what makes the
 * motion seamless when it repeats.
 */
@keyframes bg-flow-dash {
  to {
    stroke-dashoffset: -22;
  }
}

.bg-flow-dash {
  stroke-dashoffset: 0;
  animation: bg-flow-dash var(--bg-flow-dash-duration, 1s) linear infinite;
}

/* Paused, or a reduced-motion preference: the line stays, the motion goes. */
.bg-flow-dash--still {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .bg-flow-dash {
    animation: none;
  }
}
</style>
