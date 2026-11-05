<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { GraphNode } from '@vue-flow/core'
import {
  ArrowDownToLine,
  Box,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers3,
  Move3d,
  PanelTop,
  Plus,
  Rotate3d,
  Scan,
  Tag,
  Undo2,
  View,
} from '@lucide/vue'
import type { DiagramDocument, MessageFlow, Position3D } from '@/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppTheme } from '@/composables/useAppTheme'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useFlows } from '@/features/diagram/composables/useFlows'
import type { CameraPreset } from '@/features/diagram/composables/useView3D'
import { nextSpotlight, useView3D } from '@/features/diagram/composables/useView3D'
import { usePresentation } from '@/features/workspace/composables/usePresentation'
import { describeFlow } from '@/features/diagram/lib/flow-graph'
import { captionText, nodeCaption } from '@/features/diagram/lib/node-caption'
import type { AxisOnScreen } from '@/features/diagram/lib/stage3d'
import { Stage3D } from '@/features/diagram/lib/stage3d'
import type { Axis, TransformStatus } from '@/features/diagram/lib/transform3d'
import { AXES, AXIS_COLOR, numericAxis } from '@/features/diagram/lib/transform3d'
import { COLOR_HEX, diagramTheme } from '@/features/diagram/lib/theme'

/**
 * The 3D view: the diagram stood up in layers, one plane per level of the
 * stack, with the message flows running through it.
 *
 * Loaded lazily — three.js is a few hundred kilobytes, and someone who never
 * opens this view never downloads it. Everything it draws is read from the same
 * store the 2D canvas edits, so it is never a second copy of the diagram: a
 * rename in the inspector shows up here at once, and a node clicked here is
 * selected there.
 *
 * Nodes can be moved here, the way a 3D editor moves objects. A move writes
 * the node's 3D place only — `position3d` — never its place on the canvas, so
 * the 3D layout can drift as far from the 2D one as wanted and the 2D one
 * never notices.
 */

const props = defineProps<{
  /** Whether the panel is on screen. Off, nothing is drawn. */
  visible: boolean
}>()

const {
  nodes,
  flows,
  planes,
  canvas,
  selectedNodes,
  toDocument,
  fitRequest,
  commit,
  endCoalesce,
  addPlane,
  canAddPlane,
  moveNodesToPlane,
  planeOfNode,
  moveNodes3D,
  resetLayout3D,
  placedCount,
} = useDiagram()
const { findNode, addSelectedNodes, removeSelectedNodes, removeSelectedElements } = useCanvas()
const { paused, reduced, highlighted, planOf } = useFlows()
const { spread, autoRotate, labels, spotlight, hiddenPlanes, gizmo, commands } = useView3D()
const { presenting } = usePresentation()

const { mode: appThemeMode } = useAppTheme()
const theme = computed(() => diagramTheme(appThemeMode.value))

const host = ref<HTMLElement | null>(null)
const stage = shallowRef<Stage3D | null>(null)
/** Set when the browser cannot give us a WebGL context. */
const failed = ref(false)

/* ------------------------------------------------------------------ scene */

/**
 * The document as text, so the scene is rebuilt when the diagram changes and
 * not when merely the selection does: Vue Flow replaces the node array on every
 * click, and a rebuild is far dearer than a string comparison.
 */
const documentKey = computed(() => JSON.stringify(toDocument()))

function rebuild() {
  const doc = JSON.parse(documentKey.value) as DiagramDocument
  stage.value?.setScene(doc, theme.value, doc.flows ?? [])
}

onMounted(() => {
  if (!host.value) return
  try {
    stage.value = new Stage3D(host.value, {
      select: onSelect,
      hover: onHover,
      move: onMove,
      transform: (status) => (moving.value = status),
      orient: (axes) => (orientation.value = axes),
    })
  } catch {
    failed.value = true
    return
  }
  const s = stage.value
  s.setMotion({ paused: paused.value, reduced: reduced.value })
  s.setSpread(spread.value)
  s.setLabels(labels.value)
  s.setHiddenPlanes(hiddenPlanes.value)
  s.setAutoRotate(autoRotate.value)
  s.setEditable(!presenting.value)
  s.setGizmo(gizmo.value)
  s.setSnap(canvas.snap, canvas.snapSize)
  rebuild()
  s.setSelection(selectedNodes.value.map((n) => n.id))
  s.setSpotlight(spotlight.value)
  s.setRunning(props.visible)
  s.intro()

  commands.value = {
    frame: () => s.frameAll(),
    view: (preset: CameraPreset) => s.view(preset),
    zoom: (factor: number) => s.zoomBy(factor),
    focusPlane: (id: string) => s.focusPlane(id),
    snapshot: () => s.snapshot(),
    grab: () => s.grab(),
    frameSelection: () => s.frameSelection(),
    viewAxis: (axis: Axis, sign: 1 | -1) => s.viewAxis(axis, sign),
    orbit: (azimuth: number, polar: number) => s.orbitBy(azimuth, polar),
  }
})

onBeforeUnmount(() => {
  commands.value = null
  stage.value?.dispose()
  stage.value = null
})

watch([documentKey, theme], rebuild)
// A different diagram loaded into this tab: frame it, once the rebuild has run.
watch(fitRequest, () => nextTick(() => stage.value?.frameAll()))
watch(spread, (value) => stage.value?.setSpread(value))
watch(labels, (value) => stage.value?.setLabels(value))
watch(autoRotate, (value) => stage.value?.setAutoRotate(value))
watch(hiddenPlanes, (value) => stage.value?.setHiddenPlanes(value), { deep: true })
watch(
  () => props.visible,
  (value) => stage.value?.setRunning(value),
)
watch([paused, reduced], () =>
  stage.value?.setMotion({ paused: paused.value, reduced: reduced.value }),
)
// Presenting is looking, not editing: nothing moves, and the gizmo goes.
watch(presenting, (value) => stage.value?.setEditable(!value))
watch(gizmo, (value) => stage.value?.setGizmo(value))
watch(
  () => [canvas.snap, canvas.snapSize] as const,
  ([on, size]) => stage.value?.setSnap(on, size),
)
watch(
  () => selectedNodes.value.map((n) => n.id).join('\n'),
  () => stage.value?.setSelection(selectedNodes.value.map((n) => n.id)),
)
// Hovering a flow in the flow editor lights it up here too, the same as on the canvas.
watch(highlighted, (value) =>
  stage.value?.setHighlight(value?.edges ?? null, value ? COLOR_HEX[value.color] : null),
)

/* ------------------------------------------------------------- selection */

/**
 * A click here is a click on the canvas: it selects, and ⌘ or ⇧ adds to the
 * selection. While presenting nothing is selectable, so a click flies to the
 * node instead — the way to say "this one" to a room.
 */
function onSelect(id: string | null, additive: boolean) {
  if (presenting.value) {
    if (id) stage.value?.focusNode(id)
    return
  }
  if (!id) {
    if (!additive) removeSelectedElements()
    return
  }
  const node = findNode(id)
  // A locked node keeps out of the way here the same as on the canvas.
  if (!node || (node.data as NodeData | undefined)?.locked) return
  if (!additive) {
    addSelectedNodes([node])
    return
  }
  if (selectedNodes.value.some((n) => n.id === id)) {
    removeSelectedNodes([node])
    return
  }
  const others = selectedNodes.value
    .map((n) => findNode(n.id))
    .filter((n): n is GraphNode => !!n)
  addSelectedNodes([...others, node])
}

/* ----------------------------------------------------------------- moving */

/** The move in progress, as the stage reports it; `null` while nothing is moving. */
const moving = ref<TransformStatus | null>(null)

/** A confirmed move: one undo step, written to the nodes' 3D places and nowhere else. */
function onMove(ids: string[], delta: Position3D) {
  commit()
  endCoalesce()
  moveNodes3D(ids, delta)
}

/** What the header says about the move: how far, along what, and how to finish it. */
const movingLine = computed(() => {
  const status = moving.value
  if (!status) return null
  const round = (v: number) => {
    const r = Math.round(v * 10) / 10
    return Object.is(r, -0) ? 0 : r
  }
  const typedAxis = status.numeric !== null ? numericAxis(status.constraint) : null
  const shown = status.constraint.length ? status.constraint : AXES
  return {
    title: status.count === 1 ? 'Move' : `Move ${status.count}`,
    values: shown.map((axis) => ({
      axis,
      color: AXIS_COLOR[axis],
      text: axis === typedAxis ? `${status.numeric || '0'}▏` : String(round(status.delta[axis])),
      typing: axis === typedAxis,
    })),
    along:
      status.constraint.length === 1
        ? `along ${status.constraint[0]!.toUpperCase()}`
        : status.constraint.length === 2
          ? `on the ${status.constraint.map((a) => a.toUpperCase()).join('–')} plane`
          : 'along the screen',
    snapping: status.snapping ? `snap ${canvas.snapSize}` : null,
    precise: status.precise,
    finish: status.kind === 'grab' ? 'click or ↵ to place' : 'let go to place',
  }
})

/** Takes every node in the 3D view back to its place on the canvas. */
function resetLayout() {
  if (!placedCount.value) return
  commit()
  endCoalesce()
  resetLayout3D()
}

/* -------------------------------------------------------------- navigator */

/** Where the three axes point from the camera, for the navigator in the corner. */
const orientation = ref<Record<Axis, AxisOnScreen> | null>(null)

/** Navigator radius, in pixels, to the centre of each axis's ball. */
const NAV_REACH = 30

/** Both ends of every axis, the farthest drawn first so the nearer ones sit on top. */
const navigatorBalls = computed(() => {
  const axes = orientation.value
  if (!axes) return []
  return AXES.flatMap((axis) =>
    ([1, -1] as const).map((sign) => ({
      key: `${sign > 0 ? '+' : '-'}${axis}`,
      axis,
      sign,
      x: 40 + axes[axis].x * NAV_REACH * sign,
      y: 40 + axes[axis].y * NAV_REACH * sign,
      depth: axes[axis].z * sign,
      color: AXIS_COLOR[axis],
      label: sign > 0 ? axis.toUpperCase() : '',
    })),
  ).sort((a, b) => a.depth - b.depth)
})

const NAV_TITLES: Record<string, string> = {
  '+x': 'Look from the right (numpad 3)',
  '-x': 'Look from the left (Ctrl + numpad 3)',
  '+y': 'Look from the front (numpad 1)',
  '-y': 'Look from the back (Ctrl + numpad 1)',
  '+z': 'Look from above (numpad 7)',
  '-z': 'Look from above (numpad 7)',
}

/* ------------------------------------------------------------------ hover */

const hover = ref<{ id: string; x: number; y: number } | null>(null)

function onHover(id: string | null, at: { x: number; y: number } | null) {
  hover.value = id && at ? { id, ...at } : null
}

const hoverCard = computed(() => {
  if (!hover.value) return null
  const node = nodes.value.find((n) => n.id === hover.value!.id)
  if (!node) return null
  const data = node.data as NodeData
  const planeId = planeOfNode(node.id)
  const plane = planes.value.find((p) => p.id === planeId)
  return {
    label: data.label.split('\n')[0] || node.id,
    caption: captionText(nodeCaption({ ...data })),
    plane: plane ? plane.label || plane.id : null,
    color: plane ? COLOR_HEX[plane.color ?? 'slate'] : null,
    x: hover.value.x,
    y: hover.value.y,
  }
})

/* ----------------------------------------------------------------- planes */

/** The stack as it is seen: top plane first, ground last. */
const stackedPlanes = computed(() => {
  const counts = new Map<string, number>()
  for (const node of nodes.value) {
    const plane = planeOfNode(node.id)
    if (plane) counts.set(plane, (counts.get(plane) ?? 0) + 1)
  }
  return [...planes.value]
    .map((plane, level) => ({
      ...plane,
      level,
      count: counts.get(plane.id) ?? 0,
      hex: COLOR_HEX[plane.color ?? 'slate'],
      hidden: hiddenPlanes.value.includes(plane.id),
    }))
    .reverse()
})

function toggleHidden(id: string) {
  hiddenPlanes.value = hiddenPlanes.value.includes(id)
    ? hiddenPlanes.value.filter((p) => p !== id)
    : [...hiddenPlanes.value, id]
}

/** Lifts or lowers the whole selection onto one plane — the quickest way to build a stack. */
function moveSelectionTo(planeId: string) {
  if (!selectedNodes.value.length) return
  commit()
  endCoalesce()
  moveNodesToPlane(
    selectedNodes.value.map((n) => n.id),
    planeId,
  )
}

/** Folded to its header, for when the legend is sitting over the part of the stack being looked at. */
const legendOpen = ref(true)

const adding = ref(false)
const draft = ref('')
const draftInput = ref<InstanceType<typeof Input> | null>(null)

async function startAdding() {
  legendOpen.value = true
  adding.value = true
  draft.value = ''
  await nextTick()
  ;(draftInput.value?.$el as HTMLInputElement | undefined)?.focus()
}

function finishAdding(save: boolean) {
  const label = draft.value.trim()
  adding.value = false
  if (!save || !label) return
  commit()
  endCoalesce()
  addPlane(label)
}

/* -------------------------------------------------------------- spotlight */

const playable = computed(() => flows.value.filter((f) => f.enabled))
const spotlit = computed<MessageFlow | null>(
  () => playable.value.find((f) => f.id === spotlight.value) ?? null,
)
const spotlightCaption = computed(() => {
  if (spotlit.value) return describeFlow(planOf(spotlit.value))
  const count = playable.value.length
  return `${count} flow${count === 1 ? '' : 's'}`
})

function stepSpotlight(by: -1 | 1) {
  spotlight.value = nextSpotlight(
    spotlight.value,
    playable.value.map((f) => f.id),
    by,
  )
}

// A flow that is switched off or deleted cannot stay in the spotlight.
watch(playable, (list) => {
  if (spotlight.value && !list.some((f) => f.id === spotlight.value)) spotlight.value = null
})
watch(spotlight, (value) => stage.value?.setSpotlight(value))

/* ---------------------------------------------------------------- toolbar */

async function saveSnapshot() {
  const blob = await stage.value?.snapshot()
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(toDocument().meta.title || 'diagram').replace(/[^\w.-]+/g, '-')}-3d.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PRESETS: { preset: CameraPreset; icon: unknown; title: string }[] = [
  { preset: 'iso', icon: Box, title: 'Angled view' },
  { preset: 'top', icon: PanelTop, title: 'From above — the 2D layout' },
  { preset: 'side', icon: Layers3, title: 'From the side — the stack itself' },
]

/**
 * The camera is driven differently from the canvas, and nothing on screen says
 * how — so the first time the 3D view opens, it says so for a few seconds.
 */
const hint = ref(!hintShown)
hintShown = true
let hintTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => (hintTimer = setTimeout(() => (hint.value = false), 7000)))
onBeforeUnmount(() => clearTimeout(hintTimer))
</script>

<script lang="ts">
/** Once per page load, across every diagram: by the second time, it is known. */
let hintShown = false
</script>

<template>
  <div class="absolute inset-0" :style="{ background: theme.bg }" @contextmenu.prevent.stop>
    <div ref="host" class="absolute inset-0" />

    <div
      v-if="failed"
      class="absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
      :style="{ color: theme.muted }"
    >
      The 3D view needs WebGL, which this browser has turned off or does not offer.
    </div>

    <!-- What the node under the pointer is, and which plane it stands on. -->
    <div
      v-if="hoverCard"
      class="pointer-events-none absolute z-20 max-w-64 rounded-md border px-2.5 py-1.5 text-xs shadow-lg"
      :style="{
        left: `${hoverCard.x + 14}px`,
        top: `${hoverCard.y + 14}px`,
        background: theme.surface,
        borderColor: theme.line,
        color: theme.ink,
      }"
    >
      <p class="truncate font-semibold">{{ hoverCard.label }}</p>
      <p v-if="hoverCard.caption" class="truncate" :style="{ color: theme.muted }">
        {{ hoverCard.caption }}
      </p>
      <p v-if="hoverCard.plane" class="mt-0.5 flex items-center gap-1.5 truncate">
        <span class="size-2 shrink-0 rounded-sm" :style="{ background: hoverCard.color ?? undefined }" />
        {{ hoverCard.plane }}
      </p>
    </div>

    <!--
      The stack, read top to bottom the way it stands. A legend while presenting;
      while editing, also where a plane is added and where a selection is put.
    -->
    <div
      class="absolute top-4 left-4 z-30 rounded-lg border shadow-sm"
      :class="legendOpen ? 'w-60' : 'w-auto'"
      :style="{ background: theme.surface, borderColor: theme.line, color: theme.ink }"
    >
      <div
        class="flex h-9 items-center gap-2 px-3"
        :class="legendOpen && 'border-b'"
        :style="{ borderColor: theme.line }"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2"
          :aria-expanded="legendOpen"
          :title="legendOpen ? 'Fold the legend' : 'Show the legend'"
          @click="legendOpen = !legendOpen"
        >
          <Layers3 :size="14" :style="{ color: theme.muted }" />
          <span class="text-[10px] font-bold tracking-[0.09em] uppercase" :style="{ color: theme.muted }">
            Planes
          </span>
          <ChevronDown
            :size="13"
            class="transition-transform"
            :class="!legendOpen && '-rotate-90'"
            :style="{ color: theme.muted }"
          />
        </button>
        <Tooltip v-if="!presenting">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="size-6" :disabled="!canAddPlane" @click="startAdding">
              <Plus :size="14" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add a plane on top of the stack</TooltipContent>
        </Tooltip>
      </div>

      <template v-if="legendOpen">
        <ul v-if="stackedPlanes.length" class="max-h-72 overflow-y-auto py-1">
          <li
            v-for="plane in stackedPlanes"
            :key="plane.id"
            class="group flex h-8 items-center gap-2 px-2"
            :class="plane.hidden && 'opacity-50'"
          >
            <span class="size-2.5 shrink-0 rounded-sm" :style="{ background: plane.hex }" />
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
              :title="`Fly to ${plane.label || plane.id}`"
              @click="stage?.focusPlane(plane.id)"
            >
              {{ plane.label || plane.id }}
            </button>
            <span class="text-[11px] tabular-nums" :style="{ color: theme.muted }">{{ plane.count }}</span>
            <Tooltip v-if="!presenting && selectedNodes.length">
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-6" @click="moveSelectionTo(plane.id)">
                  <ArrowDownToLine :size="13" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Put the selection on {{ plane.label || plane.id }}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="size-6" @click="toggleHidden(plane.id)">
                  <EyeOff v-if="plane.hidden" :size="13" />
                  <Eye v-else :size="13" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ plane.hidden ? 'Show' : 'Hide' }} this plane in the view</TooltipContent>
            </Tooltip>
          </li>
        </ul>

        <p
          v-else-if="!adding"
          class="px-3 py-2.5 text-xs leading-relaxed"
          :style="{ color: theme.muted }"
        >
          Everything stands on one plane. Add planes for what the height should mean — trust
          zones, tiers, environments — and put nodes on them.
        </p>
      </template>

      <form v-if="adding" class="border-t p-2" :style="{ borderColor: theme.line }" @submit.prevent="finishAdding(true)">
        <Input
          ref="draftInput"
          v-model="draft"
          class="h-8 text-sm"
          placeholder="DMZ, Data tier, Production…"
          @keydown.esc.prevent="finishAdding(false)"
          @keydown.stop
          @blur="finishAdding(true)"
        />
      </form>
    </div>

    <!-- Camera, spread and what is drawn. Left out while presenting, which has its own controls. -->
    <div
      v-if="!presenting"
      class="absolute bottom-4 left-4 z-30 flex items-center gap-0.5 rounded-lg border p-1 shadow-sm"
      :style="{ background: theme.surface, borderColor: theme.line, color: theme.ink }"
    >
      <Tooltip v-for="item in PRESETS" :key="item.preset">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-7" @click="stage?.view(item.preset)">
            <component :is="item.icon" :size="15" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ item.title }}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-7" @click="stage?.frameAll()">
            <Scan :size="15" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fit the stack (F)</TooltipContent>
      </Tooltip>

      <div class="mx-1 h-4 w-px" :style="{ background: theme.line }" />

      <Tooltip>
        <TooltipTrigger as-child>
          <Toggle size="sm" class="h-7" :model-value="gizmo" aria-label="Move gizmo" @update:model-value="gizmo = Boolean($event)">
            <Move3d :size="15" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Move gizmo on the selection — or press G to grab</TooltipContent>
      </Tooltip>
      <Tooltip v-if="placedCount">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-7" aria-label="Back to the canvas layout" @click="resetLayout">
            <Undo2 :size="15" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Put every node back where the canvas has it ({{ placedCount }} moved in 3D) — Alt+G does the selection
        </TooltipContent>
      </Tooltip>

      <div class="mx-1 h-4 w-px" :style="{ background: theme.line }" />

      <label class="flex items-center gap-2 px-1.5 text-xs" :title="'How far apart the planes stand'">
        <span :style="{ color: theme.muted }">Spread</span>
        <input
          v-model.number="spread"
          type="range"
          min="0"
          max="2.5"
          step="0.05"
          class="w-24"
          :style="{ accentColor: theme.selection }"
          aria-label="Plane spread"
        />
      </label>

      <div class="mx-1 h-4 w-px" :style="{ background: theme.line }" />

      <Tooltip>
        <TooltipTrigger as-child>
          <Toggle size="sm" class="h-7" :model-value="labels" aria-label="Labels" @update:model-value="labels = Boolean($event)">
            <Tag :size="15" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Connection labels</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Toggle
            size="sm"
            class="h-7"
            :model-value="autoRotate"
            :disabled="reduced"
            aria-label="Turntable"
            @update:model-value="autoRotate = Boolean($event)"
          >
            <Rotate3d :size="15" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Turntable (R)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-7" @click="saveSnapshot">
            <Camera :size="15" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save this view as a PNG</TooltipContent>
      </Tooltip>
    </div>

    <!--
      The flow spotlight: one flow at full strength, everything it does not
      touch dimmed. ← and → step through them — the way to walk a room through
      a diagram's traffic one message at a time.
    -->
    <div
      v-if="playable.length"
      class="absolute z-30 flex items-center gap-1 rounded-full border p-1 shadow-lg"
      :class="presenting ? 'bottom-10 left-1/2 -translate-x-1/2' : 'right-4 bottom-4'"
      :style="{ background: theme.surface, borderColor: theme.line, color: theme.ink }"
    >
      <Button variant="ghost" size="icon" class="size-7 rounded-full" aria-label="Previous flow" @click="stepSpotlight(-1)">
        <ChevronLeft :size="15" />
      </Button>
      <div class="flex min-w-44 items-center justify-center gap-2 px-1 text-xs">
        <span
          class="size-2 shrink-0 rounded-full"
          :style="{ background: spotlit ? COLOR_HEX[spotlit.color] : theme.muted }"
        />
        <span class="truncate font-medium">{{ spotlit ? spotlit.label || spotlit.id : 'All flows' }}</span>
        <span class="shrink-0 tabular-nums" :style="{ color: theme.muted }">{{ spotlightCaption }}</span>
      </div>
      <Button variant="ghost" size="icon" class="size-7 rounded-full" aria-label="Next flow" @click="stepSpotlight(1)">
        <ChevronRight :size="15" />
      </Button>
    </div>

    <!--
      What a move is doing while it is in progress — the header a 3D editor
      shows: how far, along which axis, and how to put it down or back.
    -->
    <div
      v-if="movingLine"
      class="pointer-events-none absolute top-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1"
    >
      <div
        class="flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg"
        :style="{ background: theme.surface, borderColor: theme.selection, color: theme.ink }"
      >
        <Move3d :size="14" :style="{ color: theme.selection }" />
        <span class="font-semibold">{{ movingLine.title }}</span>
        <span v-for="value in movingLine.values" :key="value.axis" class="flex items-center gap-1 tabular-nums">
          <span class="font-bold" :style="{ color: value.color }">{{ value.axis.toUpperCase() }}</span>
          <span :class="value.typing && 'rounded px-1 ring-1'" :style="value.typing ? { '--tw-ring-color': value.color } : undefined">
            {{ value.text }}
          </span>
        </span>
        <span :style="{ color: theme.muted }">{{ movingLine.along }}</span>
        <span v-if="movingLine.snapping" class="rounded border px-1.5 text-[10px]" :style="{ borderColor: theme.line, color: theme.muted }">
          {{ movingLine.snapping }}
        </span>
        <span v-if="movingLine.precise" class="rounded border px-1.5 text-[10px]" :style="{ borderColor: theme.line, color: theme.muted }">
          fine
        </span>
      </div>
      <p
        class="max-w-[24rem] rounded-lg px-2.5 py-0.5 text-center text-[11px] leading-snug"
        :style="{ background: theme.bg, color: theme.muted }"
      >
        <b>X Y Z</b> axis · <b>⇧</b>+axis plane · type a distance · <b>⇧</b> fine ·
        <b>Ctrl</b> {{ canvas.snap ? 'no snap' : 'snap' }} · {{ movingLine.finish }} · <b>Esc</b> cancel
      </p>
    </div>

    <!--
      Which way the axes point, in the corner the way 3D editors keep it. A
      ball looks straight down that axis — the numpad's views, for a mouse.
    -->
    <svg
      v-if="navigatorBalls.length"
      class="absolute top-16 right-4 z-30 overflow-visible"
      width="80"
      height="80"
      viewBox="0 0 80 80"
      role="group"
      aria-label="View axes"
    >
      <circle cx="40" cy="40" r="39" :fill="theme.surface" fill-opacity="0.55" :stroke="theme.line" />
      <template v-for="ball in navigatorBalls" :key="ball.key">
        <line
          v-if="ball.sign > 0"
          x1="40"
          y1="40"
          :x2="ball.x"
          :y2="ball.y"
          :stroke="ball.color"
          stroke-width="2"
          stroke-linecap="round"
        />
        <g class="cursor-pointer" @click="stage?.viewAxis(ball.axis, ball.sign)">
          <title>{{ NAV_TITLES[ball.key] }}</title>
          <circle
            :cx="ball.x"
            :cy="ball.y"
            :r="ball.sign > 0 ? 8.5 : 6.5"
            :fill="ball.sign > 0 ? ball.color : theme.surface"
            :stroke="ball.color"
            :stroke-width="ball.sign > 0 ? 0 : 1.5"
            class="transition-opacity hover:opacity-75"
          />
          <text
            v-if="ball.label"
            :x="ball.x"
            :y="ball.y + 3.5"
            text-anchor="middle"
            font-size="10"
            font-weight="700"
            fill="#fff"
            class="pointer-events-none select-none"
          >
            {{ ball.label }}
          </text>
        </g>
      </template>
    </svg>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-300 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="hint && !presenting && !moving"
        class="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2"
      >
        <div
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg"
          :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
        >
          <View :size="14" :style="{ color: theme.selection }" />
          Drag to orbit · right-drag to pan · scroll to zoom ·
          <kbd class="rounded border px-1 font-sans text-[11px]">G</kbd>
          moves the selection,
          <kbd class="rounded border px-1 font-sans text-[11px]">↑</kbd>
          <kbd class="rounded border px-1 font-sans text-[11px]">↓</kbd>
          its plane
        </div>
      </div>
    </Transition>
  </div>
</template>
