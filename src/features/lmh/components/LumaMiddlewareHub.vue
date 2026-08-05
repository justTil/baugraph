<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  BOUNDARY_X,
  BUS_LABEL,
  BUS_X1,
  BUS_X2,
  BUS_Y,
  busStubs,
  edgeKey,
  edgePath,
  edges,
  laneBands,
  lanes,
  nodeBoxes,
  nodeById,
  resolveEdge,
  SIDE_COLUMN_H,
  SIDE_COLUMN_Y,
  SIDE_HEADER_H,
  SIDE_HEADER_Y,
  sides,
  signalFlow,
  VIEW_H,
  VIEW_W,
} from '@/features/lmh/topology'

const props = withDefaults(defineProps<{
  /** Node ids the message travels through, in order. */
  flow?: string[]
  /** Milliseconds a single hop takes. */
  hopDuration?: number
  /** Render the step list underneath the diagram. */
  showSteps?: boolean
  /** Explain the node accent colours - useful when nothing is animated. */
  showLegend?: boolean
}>(), {
  flow: () => signalFlow,
  hopDuration: 900,
  showSteps: true,
  showLegend: false,
})

const emit = defineEmits<{
  hop: [nodeId: string, index: number]
  done: []
}>()

const playing = ref(false)
const visited = ref<string[]>([])
const activeEdges = ref<string[]>([])
const travelledEdges = ref<string[]>([])
const packet = ref<{ x: number, y: number } | null>(null)

/**
 * Set for a moment whenever the packet passes BOUNDARY_X - leaving one side of
 * the network for the other is the interesting moment in a hybrid hub, and it
 * happens mid-hop, so it cannot be derived from the step list alone.
 * `id` keys the element so the CSS animation restarts on every crossing.
 */
const crossing = ref<{ id: number, y: number, into: 'cloud' | 'onprem' } | null>(null)
const CROSSING_MS = 1600
let crossingId = 0
let crossingTimer: ReturnType<typeof setTimeout> | undefined

function markCrossing(y: number, into: 'cloud' | 'onprem') {
  crossingId += 1
  crossing.value = { id: crossingId, y, into }
  clearTimeout(crossingTimer)
  crossingTimer = setTimeout(() => {
    crossing.value = null
  }, CROSSING_MS)
}

const pathEls = new Map<string, SVGPathElement>()
let frame = 0
let cancelled = false

function setPathEl(key: string, el: unknown) {
  if (el)
    pathEls.set(key, el as SVGPathElement)
  else
    pathEls.delete(key)
}

const drawnEdges = computed(() =>
  edges.map(e => ({
    key: edgeKey(e.from, e.to),
    d: edgePath(e.from, e.to),
    route: e.route,
    planned: Boolean(nodeById[e.from]?.planned || nodeById[e.to]?.planned),
  })),
)

const steps = computed(() =>
  props.flow.map((id, index) => ({ id, index, label: nodeById[id]?.label ?? id })),
)

const currentStep = computed(() => visited.value.length - 1)

const crossingLabel = computed(() =>
  crossing.value?.into === 'onprem' ? 'Cloud → On-Premise' : 'On-Premise → Cloud',
)

const busEdgeKeys = new Map(
  edges.filter(e => e.route === 'bus').map(e => [edgeKey(e.from, e.to), [e.from, e.to]]),
)

/** A bus stub lights up while one of its routes carries the message. */
const litStubs = computed(() => {
  const keys = [...activeEdges.value, ...travelledEdges.value]
  return new Set(keys.flatMap(key => busEdgeKeys.get(key) ?? []))
})

/** Ease-in-out so the packet accelerates out of a node and settles into the next. */
function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function animateAlong(key: string, reversed: boolean, duration: number) {
  return new Promise<void>((resolve) => {
    const el = pathEls.get(key)
    if (!el) {
      resolve()
      return
    }

    const length = el.getTotalLength()
    const start = performance.now()
    let previousX: number | null = null

    const step = (now: number) => {
      if (cancelled) {
        resolve()
        return
      }
      const t = Math.min(1, (now - start) / duration)
      const eased = ease(t)
      const point = el.getPointAtLength((reversed ? 1 - eased : eased) * length)
      packet.value = { x: point.x, y: point.y }

      if (previousX !== null && (previousX < BOUNDARY_X) !== (point.x < BOUNDARY_X))
        markCrossing(point.y, point.x < BOUNDARY_X ? 'cloud' : 'onprem')
      previousX = point.x

      if (t < 1)
        frame = requestAnimationFrame(step)
      else
        resolve()
    }

    frame = requestAnimationFrame(step)
  })
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function reset() {
  cancelled = true
  cancelAnimationFrame(frame)
  clearTimeout(crossingTimer)
  playing.value = false
  visited.value = []
  activeEdges.value = []
  travelledEdges.value = []
  packet.value = null
  crossing.value = null
}

async function play() {
  if (playing.value)
    return

  reset()
  cancelled = false
  playing.value = true

  const flow = props.flow
  if (!flow.length)
    return

  visited.value = [flow[0]!]
  emit('hop', flow[0]!, 0)

  for (let i = 0; i < flow.length - 1; i++) {
    const from = flow[i]!
    const to = flow[i + 1]!
    const edge = resolveEdge(from, to)

    // A flow that names a hop the topology has no edge for is a bug in the
    // flow, not something to swallow - still advance so the run completes.
    if (!edge) {
      console.warn(`[LumaMiddlewareHub] Keine Verbindung zwischen "${from}" und "${to}".`)
    }
    else {
      activeEdges.value = [edge.key]
      await animateAlong(edge.key, edge.reversed, props.hopDuration)
      if (cancelled)
        return

      activeEdges.value = []
      travelledEdges.value = [...travelledEdges.value, edge.key]
    }

    visited.value = [...visited.value, to]
    emit('hop', to, i + 1)
    await wait(160)
    if (cancelled)
      return
  }

  packet.value = null
  playing.value = false
  emit('done')
}

onBeforeUnmount(reset)

defineExpose({ play, reset, playing })
</script>

<template>
  <div class="lmh">
    <svg
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      class="lmh-svg"
      role="img"
      aria-label="Luma Middleware Hub: Anwendungen, Messaging und Mediation Layer, jeweils in der Cloud und On-Premise, verbunden über einen gemeinsamen Message Bus."
    >
      <!-- the two coloured fields: cloud on the left, data centre on the right -->
      <g>
        <rect
          v-for="side in sides" :key="side.id"
          :x="side.x" :y="SIDE_COLUMN_Y" :width="side.w" :height="SIDE_COLUMN_H"
          rx="18" class="side-column"
          :class="[`side-${side.id}`, { 'is-entered': crossing?.into === side.id }]"
        />
      </g>

      <!-- lanes: what a row of boxes is responsible for, tinted per side -->
      <g>
        <rect
          v-for="band in laneBands" :key="band.id"
          :x="band.x" :y="band.y" :width="band.w" :height="band.h"
          rx="18" class="lane-box" :class="`side-${band.side}`"
        />
      </g>

      <!-- the network boundary: cloud on the left, data centre on the right -->
      <g>
        <line
          :x1="BOUNDARY_X" :y1="14" :x2="BOUNDARY_X" :y2="VIEW_H - 14"
          class="boundary"
        />
        <g v-for="side in sides" :key="side.id" :class="`side-${side.id}`">
          <rect
            :x="side.x" :y="SIDE_HEADER_Y" :width="side.w" :height="SIDE_HEADER_H"
            rx="14" class="side-header"
          />
          <text :x="side.center" :y="SIDE_HEADER_Y + 19" text-anchor="middle" class="side-label">
            {{ side.label }}
          </text>
        </g>
        <text
          :x="BOUNDARY_X" :y="VIEW_H - 10" text-anchor="middle" class="boundary-label knockout"
        >
          Netzwerkgrenze
        </text>
      </g>

      <!-- the message bus: drawn once instead of every engine-broker pair -->
      <g>
        <line :x1="BUS_X1" :y1="BUS_Y" :x2="BUS_X2" :y2="BUS_Y" class="bus-rail" />
        <line
          v-for="stub in busStubs"
          :key="stub.id"
          :x1="stub.x" :y1="stub.y1" :x2="stub.x" :y2="stub.y2"
          class="bus-stub"
          :class="[`side-${stub.side}`, { 'is-planned': stub.planned, 'is-lit': litStubs.has(stub.id) }]"
        />
        <circle
          v-for="stub in busStubs"
          :key="`dot-${stub.id}`"
          :cx="stub.x" :cy="BUS_Y" r="4"
          class="bus-dot"
          :class="[`side-${stub.side}`, { 'is-planned': stub.planned, 'is-lit': litStubs.has(stub.id) }]"
        />
        <text :x="BUS_X1 + (BUS_X2 - BUS_X1) / 2" :y="BUS_Y - 18" text-anchor="middle" class="bus-label knockout">
          {{ BUS_LABEL }}
        </text>
      </g>

      <!-- edges -->
      <g fill="none">
        <path
          v-for="edge in drawnEdges"
          :key="edge.key"
          :ref="el => setPathEl(edge.key, el)"
          :d="edge.d"
          class="edge"
          :class="[
            `edge-${edge.route}`,
            {
              'edge-planned': edge.planned,
              'edge-travelled': travelledEdges.includes(edge.key),
              'edge-active': activeEdges.includes(edge.key),
            },
          ]"
        />
      </g>

      <!-- lane captions sit above the edges so nothing is drawn through them -->
      <g>
        <text
          v-for="lane in lanes" :key="lane.id"
          :x="44" :y="lane.y + 27" class="lane-knockout"
        >
          <tspan class="lane-label">{{ lane.label }}</tspan>
          <tspan class="lane-caption">  ·  {{ lane.caption }}</tspan>
        </text>
      </g>

      <!-- nodes -->
      <g>
        <g
          v-for="node in nodeBoxes"
          :key="node.id"
          :class="[
            `kind-${node.kind}`,
            `side-${node.side}`,
            { 'node-planned': node.planned, 'node-visited': visited.includes(node.id) },
          ]"
          class="node"
        >
          <rect :x="node.x" :y="node.y" :width="node.w" :height="node.h" rx="12" class="node-box" />
          <rect :x="node.x + 12" :y="node.y + 14" width="4" :height="node.h - 28" rx="2" class="node-accent" />
          <text :x="node.x + 28" :y="node.cy - 3" class="node-label">{{ node.label }}</text>
          <text v-if="node.sublabel" :x="node.x + 28" :y="node.cy + 15" class="node-sub">
            {{ node.sublabel }}
          </text>
        </g>
      </g>

      <!-- the packet just left one side of the network for the other -->
      <g
        v-if="crossing"
        :key="crossing.id"
        class="crossing"
        :class="`side-${crossing.into}`"
        :transform="`translate(${BOUNDARY_X} ${crossing.y})`"
      >
        <line x1="0" y1="-78" x2="0" y2="78" class="crossing-seam" />
        <circle r="9" class="crossing-ring" />
        <circle r="9" class="crossing-ring is-delayed" />
        <text y="-92" text-anchor="middle" class="crossing-label">
          {{ crossingLabel }}
        </text>
      </g>

      <!-- travelling message -->
      <g v-if="packet">
        <circle :cx="packet.x" :cy="packet.y" r="14" class="packet-glow" />
        <circle :cx="packet.x" :cy="packet.y" r="6" class="packet" />
      </g>
    </svg>

    <ul v-if="showLegend" class="lmh-legend">
      <li class="lmh-legend-item">
        <span class="lmh-swatch kind-engine" /> Integration Engine
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-swatch kind-broker" /> Message Broker
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-swatch kind-system" /> Anwendung / System
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-swatch lmh-swatch-side side-cloud" /> Cloud
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-swatch lmh-swatch-side side-onprem" /> On-Premise
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-swatch lmh-swatch-planned" /> geplant
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-rule" /> Anbindung an den Message Bus
      </li>
      <li class="lmh-legend-item">
        <span class="lmh-rule lmh-rule-direct" /> Direktverbindung ohne Broker
      </li>
    </ul>

    <ol v-if="showSteps" class="lmh-steps">
      <li
        v-for="step in steps"
        :key="step.id"
        class="lmh-step"
        :class="{
          'is-done': step.index < currentStep,
          'is-current': step.index === currentStep,
        }"
      >
        <span class="lmh-step-index">{{ step.index + 1 }}</span>
        {{ step.label }}
      </li>
    </ol>
  </div>
</template>

<style scoped>
.lmh {
  --lmh-engine: oklch(0.55 0.16 265);
  --lmh-broker: oklch(0.62 0.14 60);
  --lmh-system: oklch(0.55 0.1 195);
  --lmh-flow: oklch(0.55 0.16 265);

  /* WHERE a node runs is carried by a cool/warm pair, kept low in chroma so it
     tints surfaces without competing with the kind accents above. */
  --lmh-cloud: oklch(0.6 0.12 240);
  --lmh-onprem: oklch(0.55 0.12 25);
}

.dark .lmh {
  --lmh-engine: oklch(0.75 0.14 265);
  --lmh-broker: oklch(0.79 0.13 70);
  --lmh-system: oklch(0.75 0.1 195);
  --lmh-flow: oklch(0.8 0.15 265);

  --lmh-cloud: oklch(0.75 0.11 240);
  --lmh-onprem: oklch(0.72 0.12 30);
}

/* every element that belongs to a side resolves its tint through one var */
.side-cloud {
  --lmh-side: var(--lmh-cloud);
}

.side-onprem {
  --lmh-side: var(--lmh-onprem);
}

.lmh-svg {
  width: 100%;
  height: auto;
  font-family: inherit;
}

/* --------------------------------------------------------------- structure */

/* the field itself - the same blue / terracotta the side header carries */
.side-column {
  fill: color-mix(in oklch, var(--lmh-side) 14%, var(--card));
  stroke: color-mix(in oklch, var(--lmh-side) 30%, transparent);
  stroke-width: 1;
  transition: fill 0.6s ease-out, stroke 0.6s ease-out;
}

/* a lane sits a shade deeper in the field it belongs to */
.lane-box {
  fill: color-mix(in oklch, var(--lmh-side) 26%, var(--card));
  stroke: none;
}

.lane-label {
  fill: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lane-caption {
  fill: var(--muted-foreground);
  font-size: 12px;
  letter-spacing: 0.01em;
}

.boundary {
  stroke: var(--border);
  stroke-width: 1.5;
  stroke-dasharray: 2 7;
  stroke-linecap: round;
}

.side-header {
  fill: color-mix(in oklch, var(--lmh-side) 34%, var(--card));
  stroke: color-mix(in oklch, var(--lmh-side) 45%, transparent);
  stroke-width: 1;
}

.side-label {
  fill: color-mix(in oklch, var(--lmh-side) 85%, var(--foreground));
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.boundary-label,
.bus-label {
  fill: var(--muted-foreground);
  font-size: 11px;
  letter-spacing: 0.06em;
}

/* keeps lines from running through a label */
.knockout,
.lane-knockout {
  paint-order: stroke;
  stroke: var(--card);
  stroke-width: 8px;
  stroke-linejoin: round;
}

/* same fill the cloud-side lane band paints - the captions all start on the
   left half, so one mix is enough */
.lane-knockout {
  stroke: color-mix(in oklch, var(--lmh-cloud) 26%, var(--card));
  stroke-width: 6px;
}

/* the bus label spans both fields; knock it out with their average so neither
   side shows a halo */
.bus-label {
  stroke: color-mix(
    in oklch,
    color-mix(in oklch, var(--lmh-cloud) 50%, var(--lmh-onprem)) 14%,
    var(--card)
  );
}

/* ------------------------------------------------------------------ the bus */

.bus-rail {
  stroke: var(--muted-foreground);
  stroke-opacity: 0.45;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.bus-stub {
  stroke: color-mix(in oklch, var(--lmh-side) 45%, var(--border));
  stroke-width: 1.5;
  transition: stroke 0.25s, stroke-width 0.25s;
}

.bus-stub.is-planned {
  stroke-dasharray: 5 5;
  opacity: 0.6;
}

.bus-stub.is-lit {
  stroke: color-mix(in oklch, var(--lmh-flow) 55%, transparent);
  stroke-width: 2;
}

.bus-dot {
  fill: var(--lmh-side, var(--muted-foreground));
  fill-opacity: 0.5;
  transition: fill 0.25s;
}

.bus-dot.is-planned {
  fill-opacity: 0.25;
}

.bus-dot.is-lit {
  fill: var(--lmh-flow);
  fill-opacity: 1;
}

/* ----------------------------------------------------------------- edges */

.edge {
  stroke: var(--border);
  stroke-width: 1.5;
  transition: stroke 0.25s, stroke-width 0.25s, opacity 0.25s;
}

/* the n:m mesh is represented by the bus - a concrete route only shows up
   while a message actually travels it */
.edge-bus {
  stroke: transparent;
}

.edge-bypass {
  stroke-dasharray: 1 6;
  stroke-linecap: round;
  stroke-width: 2;
}

.edge-planned {
  stroke-dasharray: 5 5;
  opacity: 0.55;
}

.edge-travelled,
.edge-bus.edge-travelled {
  stroke: color-mix(in oklch, var(--lmh-flow) 55%, transparent);
  stroke-width: 2;
}

.edge-active,
.edge-bus.edge-active {
  stroke: var(--lmh-flow);
  stroke-width: 2.5;
}

/* ------------------------------------------------------------------ nodes */

/* plain card, so a node lifts off the coloured field behind it */
.node-box {
  fill: var(--card);
  stroke: color-mix(in oklch, var(--lmh-side) 45%, var(--border));
  transition: stroke 0.25s, filter 0.25s;
}

.node-visited .node-box {
  stroke: var(--lmh-flow);
  filter: drop-shadow(0 0 6px color-mix(in oklch, var(--lmh-flow) 35%, transparent));
}

.node-label {
  fill: var(--foreground);
  font-size: 14px;
  font-weight: 500;
}

.node-sub {
  fill: var(--muted-foreground);
  font-size: 11px;
}

.node-accent {
  fill: var(--muted-foreground);
}

.kind-engine .node-accent {
  fill: var(--lmh-engine);
}

.kind-broker .node-accent {
  fill: var(--lmh-broker);
}

.kind-system .node-accent {
  fill: var(--lmh-system);
}

.node-planned .node-box {
  stroke-dasharray: 5 5;
}

.node-planned {
  opacity: 0.6;
}

/* ------------------------------------------------- crossing the boundary */

/* everything here is painted in the colour of the side being entered, so the
   effect answers "into what?" and not just "something happened" */

.crossing {
  pointer-events: none;
}

.crossing-seam {
  stroke: var(--lmh-side);
  stroke-width: 2.5;
  stroke-linecap: round;
  animation: lmh-seam 1.6s ease-out forwards;
}

.crossing-ring {
  fill: none;
  stroke: var(--lmh-side);
  stroke-width: 2;
  animation: lmh-ring 1.2s ease-out forwards;
}

.crossing-ring.is-delayed {
  animation-delay: 0.22s;
}

.crossing-label {
  fill: color-mix(in oklch, var(--lmh-side) 80%, var(--foreground));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  paint-order: stroke;
  stroke: var(--card);
  stroke-width: 6px;
  stroke-linejoin: round;
  animation: lmh-crossing-label 1.6s ease-out forwards;
}

/* the field being entered lights up for the same beat */
.side-column.is-entered {
  stroke: var(--lmh-side);
  fill: color-mix(in oklch, var(--lmh-side) 22%, var(--card));
}

@keyframes lmh-ring {
  from {
    transform: scale(0.4);
    opacity: 0.9;
  }
  to {
    transform: scale(4.5);
    opacity: 0;
  }
}

@keyframes lmh-seam {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  25% {
    opacity: 1;
    transform: scaleY(1);
  }
  100% {
    opacity: 0;
    transform: scaleY(1);
  }
}

@keyframes lmh-crossing-label {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  20%,
  70% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-4px);
  }
}

/* no motion: the marker still appears for its 1.6s, it just does not move */
@media (prefers-reduced-motion: reduce) {
  .crossing-seam,
  .crossing-label {
    animation: none;
  }

  .crossing-ring {
    display: none;
  }
}

.packet {
  fill: var(--lmh-flow);
}

.packet-glow {
  fill: var(--lmh-flow);
  opacity: 0.2;
}

/* ----------------------------------------------------------------- legend */

.lmh-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin-top: 1rem;
}

.lmh-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.lmh-swatch {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background-color: var(--muted-foreground);
}

.lmh-swatch.kind-engine {
  background-color: var(--lmh-engine);
}

.lmh-swatch.kind-broker {
  background-color: var(--lmh-broker);
}

.lmh-swatch.kind-system {
  background-color: var(--lmh-system);
}

/* side is a surface tint, so its swatch is a tinted box, not a dot */
.lmh-swatch-side {
  width: 0.875rem;
  border-radius: 0.25rem;
  background-color: color-mix(in oklch, var(--lmh-side) 30%, var(--card));
  border: 1px solid color-mix(in oklch, var(--lmh-side) 55%, var(--border));
}

.lmh-swatch-planned {
  background-color: transparent;
  border: 1px dashed var(--muted-foreground);
}

.lmh-rule {
  display: inline-block;
  width: 1.25rem;
  border-top: 1.5px solid var(--border);
}

.lmh-rule-direct {
  border-top-style: dotted;
  border-top-width: 2px;
  border-color: var(--muted-foreground);
}

.lmh-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.lmh-step {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  transition: color 0.2s, border-color 0.2s, background-color 0.2s;
}

.lmh-step-index {
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.lmh-step.is-done {
  color: var(--foreground);
  border-color: color-mix(in oklch, var(--lmh-flow) 45%, transparent);
}

.lmh-step.is-current {
  color: var(--foreground);
  border-color: var(--lmh-flow);
  background-color: color-mix(in oklch, var(--lmh-flow) 12%, transparent);
}
</style>
