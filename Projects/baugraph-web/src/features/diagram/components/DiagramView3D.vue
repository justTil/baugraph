<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  Box,
  Camera,
  ChevronLeft,
  ChevronRight,
  PanelTop,
  RectangleVertical,
  Rotate3d,
  Scan,
  Tag,
  View,
} from '@lucide/vue'
import type { DiagramDocument, MessageFlow } from '@/model'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppTheme } from '@/composables/useAppTheme'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import type { CameraPreset } from '@/features/diagram/composables/useView3D'
import { nextSpotlight, useView3D } from '@/features/diagram/composables/useView3D'
import { usePresentation } from '@/features/workspace/composables/usePresentation'
import { describeFlow } from '@/features/diagram/lib/flow-graph'
import { captionText, nodeCaption } from '@/features/diagram/lib/node-caption'
import { Stage3D } from '@/features/diagram/lib/stage3d'
import { COLOR_HEX, diagramTheme } from '@/features/diagram/lib/theme'

/**
 * The 3D view: the diagram exactly as the canvas lays it out, every node stood
 * up where it is, and every connection an arc from the top of one node to the
 * top of the next, with the message flows travelling along them.
 *
 * Loaded lazily — three.js is a few hundred kilobytes, and someone who never
 * opens this view never downloads it. Everything it draws is read from the same
 * store the 2D canvas edits, so it is never a second copy of the diagram: a
 * rename in the inspector shows up here at once.
 *
 * It is for looking. Nothing is moved, selected or edited here; a click on a
 * node flies to it.
 */

const props = defineProps<{
  /** Whether the panel is on screen. Off, nothing is drawn. */
  visible: boolean
}>()

const { nodes, flows, toDocument, fitRequest } = useDiagram()
const { paused, reduced, highlighted, planOf } = useFlows()
const { autoRotate, labels, spotlight, commands } = useView3D()
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
    stage.value = new Stage3D(host.value, { hover: onHover })
  } catch {
    failed.value = true
    return
  }
  const s = stage.value
  s.setMotion({ paused: paused.value, reduced: reduced.value })
  s.setLabels(labels.value)
  s.setAutoRotate(autoRotate.value)
  rebuild()
  s.setSpotlight(spotlight.value)
  s.setRunning(props.visible)
  s.intro()

  commands.value = {
    frame: () => s.frameAll(),
    view: (preset: CameraPreset) => s.view(preset),
    zoom: (factor: number) => s.zoomBy(factor),
    snapshot: () => s.snapshot(),
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
watch(labels, (value) => stage.value?.setLabels(value))
watch(autoRotate, (value) => stage.value?.setAutoRotate(value))
watch(
  () => props.visible,
  (value) => stage.value?.setRunning(value),
)
watch([paused, reduced], () =>
  stage.value?.setMotion({ paused: paused.value, reduced: reduced.value }),
)
// Hovering a flow in the flow editor lights it up here too, the same as on the canvas.
watch(highlighted, (value) =>
  stage.value?.setHighlight(value?.edges ?? null, value ? COLOR_HEX[value.color] : null),
)

/* ------------------------------------------------------------------ hover */

const hover = ref<{ id: string; x: number; y: number } | null>(null)

function onHover(id: string | null, at: { x: number; y: number } | null) {
  hover.value = id && at ? { id, ...at } : null
}

/** What the node under the pointer is — its name and what it runs on. */
const hoverCard = computed(() => {
  if (!hover.value) return null
  const node = nodes.value.find((n) => n.id === hover.value!.id)
  if (!node) return null
  const data = node.data as NodeData
  return {
    label: data.label.split('\n')[0] || node.id,
    caption: captionText(nodeCaption({ ...data })),
    x: hover.value.x,
    y: hover.value.y,
  }
})

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
  { preset: 'front', icon: RectangleVertical, title: 'From the front — every node face on' },
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

    <!-- What the node under the pointer is. A click flies to it. -->
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
    </div>

    <!-- Camera and what is drawn. Left out while presenting, which has its own controls. -->
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
        <TooltipContent>Fit everything (F)</TooltipContent>
      </Tooltip>

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

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-300 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="hint && !presenting"
        class="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2"
      >
        <div
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg"
          :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
        >
          <View :size="14" :style="{ color: theme.selection }" />
          Drag to orbit · right-drag to pan · scroll to zoom · click a node to fly to it
        </div>
      </div>
    </Transition>
  </div>
</template>
