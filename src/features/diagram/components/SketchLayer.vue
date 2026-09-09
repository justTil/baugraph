<script setup lang="ts">
import Konva from 'konva'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useSketchMode } from '@/features/diagram/composables/useSketch'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * The Canvas layer — a freehand overlay drawn on top of the diagram with Konva.
 *
 * Strokes are stored in the document (see `useDiagram`) in absolute canvas
 * coordinates, and this layer's Konva group carries the same pan/zoom transform
 * Vue Flow applies to its own pane — so a drawn line stays pinned to whatever it
 * annotates. The layer keeps painting when Canvas mode is off; it just stops
 * taking pointer events, so the diagram underneath is live again.
 *
 * While `enabled`, the container swallows every pointer event, which is what
 * freezes the diagram — nothing under it can be dragged, selected or connected.
 */

const props = defineProps<{
  /** Canvas mode: true means a press draws (or erases) instead of reaching the diagram. */
  enabled: boolean
  /** Whether the layer is painted at all — off hides every stroke. */
  shown: boolean
}>()

const { sketchStrokes, addSketchStroke, removeSketchStrokes, commit, endCoalesce } = useDiagram()
const { screenToFlowCoordinate, viewport } = useCanvas()
const { tool, color, width } = useSketchMode()

const container = ref<HTMLDivElement | null>(null)

/** Squared distance from point `p` to segment `a`–`b`. */
function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return (px - cx) ** 2 + (py - cy) ** 2
}

let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
/** The transformed group everything is drawn into — its transform mirrors the viewport. */
let group: Konva.Group | null = null
let resizeObserver: ResizeObserver | null = null

const lineById = new Map<string, Konva.Line>()

/* --------------------------------------------------------------- rendering */

function hexOf(key: string) {
  return COLOR_HEX[key as keyof typeof COLOR_HEX] ?? COLOR_HEX.slate
}

/** Options shared by every drawn line — kept crisp and smoothed. */
const LINE_STYLE = {
  lineCap: 'round',
  lineJoin: 'round',
  // A light spline through the sampled points, so a freehand line reads as a
  // curve rather than a run of short straight segments.
  tension: 0.4,
  listening: false,
  shadowForStrokeEnabled: false,
  // No offscreen buffer: inside a scaled group its bitmap would be upscaled and
  // blur the line as the diagram is zoomed in.
  perfectDrawEnabled: false,
} as const

/** Rebuilds every stored stroke. Called on any change to the document's strokes. */
function renderStrokes() {
  if (!group || !layer) return
  for (const line of lineById.values()) line.destroy()
  lineById.clear()
  for (const stroke of sketchStrokes.value) {
    const line = new Konva.Line({
      ...LINE_STYLE,
      points: stroke.points,
      stroke: hexOf(stroke.color),
      strokeWidth: stroke.width,
    })
    group.add(line)
    lineById.set(stroke.id, line)
  }
  layer.batchDraw()
}

/** Copies the Vue Flow viewport onto the group, so strokes pan and zoom with the diagram. */
function applyTransform() {
  if (!group || !layer) return
  const vp = viewport.value
  group.position({ x: vp.x, y: vp.y })
  group.scale({ x: vp.zoom, y: vp.zoom })
  layer.batchDraw()
}

function resize() {
  if (!stage || !layer || !container.value) return
  stage.size({ width: container.value.clientWidth, height: container.value.clientHeight })
  layer.batchDraw()
}

/* ------------------------------------------------------------------ input */

/** Points of the stroke currently under the pointer, flat `[x, y, …]` in canvas units. */
let current: number[] = []
let liveLine: Konva.Line | null = null
let mode: 'pen' | 'eraser' | null = null
const erased = new Set<string>()

function flowPoint(evt: PointerEvent) {
  return screenToFlowCoordinate({ x: evt.clientX, y: evt.clientY })
}

function beginPen(x: number, y: number) {
  current = [x, y]
  liveLine = new Konva.Line({
    ...LINE_STYLE,
    points: current,
    stroke: hexOf(color.value),
    strokeWidth: width.value,
  })
  group?.add(liveLine)
  layer?.batchDraw()
}

function extendPen(x: number, y: number) {
  const n = current.length
  // Drop a sample only if it is within a screen pixel of the last one — enough
  // to keep the array from exploding on a slow drag without visibly faceting
  // the line at any zoom.
  if (n >= 2) {
    const dx = x - current[n - 2]!
    const dy = y - current[n - 1]!
    const min = 1 / viewport.value.zoom
    if (dx * dx + dy * dy < min * min) return
  }
  current.push(x, y)
  liveLine?.points(current)
  layer?.batchDraw()
}

function endPen() {
  liveLine?.destroy()
  liveLine = null
  if (current.length >= 4) {
    commit()
    endCoalesce()
    addSketchStroke({ color: color.value, width: width.value, points: current })
  }
  current = []
}

function eraseAt(x: number, y: number) {
  for (const stroke of sketchStrokes.value) {
    if (erased.has(stroke.id)) continue
    const reach = (stroke.width / 2 + 6 / viewport.value.zoom) ** 2
    const pts = stroke.points
    let hit = pts.length >= 2 && distSqToSegment(x, y, pts[0]!, pts[1]!, pts[0]!, pts[1]!) <= reach
    for (let i = 2; i < pts.length && !hit; i += 2) {
      if (distSqToSegment(x, y, pts[i - 2]!, pts[i - 1]!, pts[i]!, pts[i + 1]!) <= reach) hit = true
    }
    if (hit) {
      erased.add(stroke.id)
      lineById.get(stroke.id)?.opacity(0.2)
    }
  }
  layer?.batchDraw()
}

function endErase() {
  if (erased.size) {
    commit()
    endCoalesce()
    removeSketchStrokes([...erased])
  }
  erased.clear()
}

function onWindowMove(evt: PointerEvent) {
  if (!mode) return
  const { x, y } = flowPoint(evt)
  if (mode === 'eraser') eraseAt(x, y)
  else extendPen(x, y)
}

function onWindowUp() {
  finishStroke()
}

/**
 * The press starts on the Konva stage — it is always over the canvas — and the
 * rest of the gesture is tracked on `window`, so a stroke that runs off the edge
 * of the canvas still finishes cleanly.
 */
function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
  if (!props.enabled || mode) return
  event.evt.preventDefault()
  const { x, y } = flowPoint(event.evt)
  mode = tool.value
  if (mode === 'eraser') {
    erased.clear()
    eraseAt(x, y)
  } else {
    beginPen(x, y)
  }
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', onWindowUp)
  window.addEventListener('pointercancel', onWindowUp)
}

function finishStroke() {
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', onWindowUp)
  window.removeEventListener('pointercancel', onWindowUp)
  if (mode === 'eraser') endErase()
  else if (mode === 'pen') endPen()
  mode = null
}

/* --------------------------------------------------------------- lifecycle */

onMounted(() => {
  if (!container.value) return
  // Match the backing canvas to the display's real pixel density. Konva samples
  // this once at import, which under a bundler can land before `window` is ready
  // and leave every stroke rendered at half resolution on a retina screen — the
  // "pixelated" look. Setting it here is the documented fix.
  Konva.pixelRatio = window.devicePixelRatio || 1

  stage = new Konva.Stage({
    container: container.value,
    width: container.value.clientWidth,
    height: container.value.clientHeight,
  })
  layer = new Konva.Layer()
  group = new Konva.Group()
  layer.add(group)
  stage.add(layer)

  stage.on('pointerdown', onPointerDown)

  applyTransform()
  renderStrokes()
  layer.visible(props.shown)
  layer.batchDraw()

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', onWindowUp)
  window.removeEventListener('pointercancel', onWindowUp)
  resizeObserver?.disconnect()
  stage?.destroy()
  stage = layer = group = null
  lineById.clear()
})

watch(sketchStrokes, renderStrokes, { deep: true })
watch(viewport, applyTransform, { deep: true })
watch(
  () => props.shown,
  (shown) => {
    layer?.visible(shown)
    layer?.batchDraw()
  },
)
// Leaving Canvas mode mid-stroke still commits what was drawn.
watch(
  () => props.enabled,
  (on) => {
    if (!on) finishStroke()
  },
)
</script>

<template>
  <div
    ref="container"
    class="absolute inset-0 z-30"
    :class="enabled ? 'cursor-crosshair' : 'pointer-events-none'"
    @contextmenu.prevent
  />
</template>
