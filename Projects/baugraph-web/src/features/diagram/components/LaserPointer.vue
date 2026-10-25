<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLaserPointer } from '@/features/diagram/composables/useLaserPointer'

/**
 * The presentation laser pointer overlay.
 *
 * A glowing dot follows the cursor over the canvas; moving leaves a short comet
 * tail behind it, and holding the button draws a thicker stroke of "ink" that
 * lingers a couple of seconds — for circling the thing you are talking about.
 *
 * The overlay itself takes no pointer events, but while it is on a press on the
 * canvas is caught in the capture phase and kept from it: during a presentation
 * a drag should draw, not pan the view or move a node. Scroll-to-pan and
 * pinch-to-zoom don't start with a press, so they still work.
 *
 * Trail points are kept in screen space and aged by wall-clock time. A single
 * `requestAnimationFrame` loop runs only while there is a trail left to fade;
 * the dot itself is static markup that costs nothing while the cursor rests.
 */

const props = defineProps<{
  /** The element the pointer is tracked against — the canvas wrapper. */
  host: HTMLElement | null
}>()

const { active } = useLaserPointer()

/** How long a segment stays visible: a flick of a tail, or a drawn stroke. */
const TAIL_MS = 420
const INK_MS = 2200
/** A jump longer than this starts a new stroke rather than joining the dots. */
const BREAK_MS = 100

interface Point {
  x: number
  y: number
  t: number
  ink: boolean
}

const points = ref<Point[]>([])
const now = ref(0)
/** Where the dot sits — the last position over the canvas, held while at rest. */
const cursor = ref<{ x: number; y: number } | null>(null)
const drawing = ref(false)

let raf = 0

/**
 * The pointer's last screen position, tracked whether or not the laser is on, so
 * the dot can appear the instant it is switched on rather than waiting for the
 * first move.
 */
const last = { x: 0, y: 0, known: false }

function track(event: PointerEvent) {
  last.x = event.clientX
  last.y = event.clientY
  last.known = true
}

/** Places the dot at wherever the pointer already is, if that is over the canvas. */
function seed() {
  const rect = props.host?.getBoundingClientRect()
  if (!rect || !last.known) return
  const x = last.x - rect.left
  const y = last.y - rect.top
  if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) cursor.value = { x, y }
}

const maxAgeOf = (p: Point) => (p.ink ? INK_MS : TAIL_MS)

function tick() {
  now.value = performance.now()
  // Drop what has fully faded; keep the array identity stable when nothing did.
  const kept = points.value.filter((p) => now.value - p.t < maxAgeOf(p))
  if (kept.length !== points.value.length) points.value = kept
  raf = kept.length ? requestAnimationFrame(tick) : 0
}

function start() {
  if (!raf) raf = requestAnimationFrame(tick)
}

function pointFromEvent(event: PointerEvent): Point | null {
  const rect = props.host?.getBoundingClientRect()
  if (!rect) return null
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const on = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
  cursor.value = on ? { x, y } : null
  if (!on) return null
  return { x, y, t: performance.now(), ink: drawing.value }
}

/** True when the event landed on the canvas rather than the surrounding chrome. */
function onCanvas(event: Event) {
  return !!(event.target as HTMLElement | null)?.closest?.('.vue-flow')
}

/**
 * While the pointer is on, a press on the diagram draws rather than pans, moves a
 * node or drops a selection box: the press events are caught here, before the
 * canvas sees them. The gestures that don't begin with a press — scroll to pan,
 * pinch to zoom — are left alone, so the view can still be navigated mid-talk.
 */
function block(event: Event) {
  if (!onCanvas(event)) return
  event.stopPropagation()
  if (event.cancelable) event.preventDefault()
}

function onMove(event: PointerEvent) {
  const point = pointFromEvent(event)
  if (!point) return
  points.value.push(point)
  start()
}

function onDown(event: PointerEvent) {
  if (onCanvas(event)) {
    drawing.value = true
    onMove(event)
  }
  block(event)
}

function onUp() {
  drawing.value = false
}

// All in the capture phase: `block` stops the press before it reaches the
// canvas, which also means the bubble phase never runs — so the handlers that
// need the event have to see it on the way down too.
const CAPTURED: [keyof WindowEventMap, EventListener][] = [
  ['pointermove', onMove as EventListener],
  ['pointerdown', onDown as EventListener],
  ['pointerup', onUp],
  ['pointercancel', onUp],
  ['mousedown', block],
  ['click', block],
  ['dblclick', block],
  ['contextmenu', block],
]

function bind() {
  for (const [type, fn] of CAPTURED) window.addEventListener(type, fn, true)
  seed()
}

function unbind() {
  for (const [type, fn] of CAPTURED) window.removeEventListener(type, fn, true)
  cancelAnimationFrame(raf)
  raf = 0
  points.value = []
  drawing.value = false
  cursor.value = null
}

watch(active, (on) => (on ? bind() : unbind()), { immediate: true })

onMounted(() => window.addEventListener('pointermove', track, true))
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', track, true)
  unbind()
})

/** The tail and any drawn strokes, as fading line segments. */
const segments = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number; o: number; w: number }[] = []
  const pts = points.value
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    if (b.t - a.t > BREAK_MS || b.ink !== a.ink) continue
    const age = now.value - b.t
    const o = 1 - age / maxAgeOf(b)
    if (o <= 0) continue
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, o, w: b.ink ? 4 : 2.5 })
  }
  return out
})

</script>

<template>
  <svg
    v-if="active"
    class="pointer-events-none absolute inset-0 z-40 h-full w-full overflow-hidden"
    aria-hidden="true"
  >
    <line
      v-for="(s, i) in segments"
      :key="i"
      :x1="s.x1"
      :y1="s.y1"
      :x2="s.x2"
      :y2="s.y2"
      stroke="#ff2d2d"
      stroke-linecap="round"
      :stroke-width="s.w"
      :opacity="s.o"
      style="filter: drop-shadow(0 0 4px rgba(255, 45, 45, 0.7))"
    />
    <g v-if="cursor" style="filter: drop-shadow(0 0 6px rgba(255, 45, 45, 0.9))">
      <circle :cx="cursor.x" :cy="cursor.y" r="11" fill="rgba(255, 45, 45, 0.25)" />
      <circle :cx="cursor.x" :cy="cursor.y" r="5" fill="#ff2d2d" />
      <circle :cx="cursor.x" :cy="cursor.y" r="2" fill="#fff" />
    </g>
  </svg>
</template>
