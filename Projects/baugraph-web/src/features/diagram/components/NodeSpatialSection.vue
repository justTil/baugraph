<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Box, Undo2 } from '@lucide/vue'
import type { Extrusion, Position3D } from '@/model'
import { EXTRUSIONS } from '@/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useView3D } from '@/features/diagram/composables/useView3D'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { AXES, AXIS_COLOR } from '@/features/diagram/lib/axes3d'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * Where a node stands in the 3D view: which plane, how tall, and — once it has
 * been moved there — where on it.
 *
 * Optional on top of everything else in the inspector — a node left alone here
 * follows its zone onto its plane, or stands on the ground, at the regular
 * height, exactly where the canvas has it — and nothing set here changes the
 * node on the 2D canvas. Edits one node or a whole selection; a field the
 * selection disagrees on shows nothing picked rather than one node's answer.
 */

const props = defineProps<{ ids: string[] }>()

const {
  nodes,
  planes,
  canAddPlane,
  commit,
  endCoalesce,
  addPlane,
  setNodesPlane,
  setNodesExtrusion,
  planeOfNode,
  positions3D,
  setNodePosition3D,
  resetNodes3D,
} = useDiagram()
const { active: view3d } = useView3D()

/** Select values may not be empty, so "no plane of its own" needs a name of its own. */
const AUTO = '__auto__'
const NEW = '__new__'

const selected = computed(() => nodes.value.filter((n) => props.ids.includes(n.id)))

/** The plane value the selection shares, `AUTO` for none of its own, `''` when they differ. */
const plane = computed(() => {
  const values = new Set(selected.value.map((n) => (n.data as NodeData).plane ?? AUTO))
  return values.size === 1 ? [...values][0]! : ''
})

/** Where "Auto" lands a single node, so the choice says what it means. */
const autoLabel = computed(() => {
  if (selected.value.length !== 1) return 'Auto'
  const node = selected.value[0]!
  // Resolved as if the node named no plane: its zone's, or the ground.
  const parent = node.parentNode
  const resolved = parent ? planeOfNode(parent) : (planes.value[0]?.id ?? null)
  const target = planes.value.find((p) => p.id === resolved)
  if (!target) return 'Auto'
  return `Auto — ${target.label || target.id}${parent ? ' (zone)' : ''}`
})

/** Top of the stack first, the way it stands. */
const options = computed(() =>
  [...planes.value].reverse().map((p) => ({ id: p.id, label: p.label || p.id, hex: COLOR_HEX[p.color ?? 'slate'] })),
)

const extrusion = computed(() => {
  const values = new Set(selected.value.map((n) => (n.data as NodeData).extrusion))
  return values.size === 1 ? [...values][0]! : ''
})

/** A text annotation is a label lying on its plane; it has no height to set. */
const extrudable = computed(() => selected.value.some((n) => n.type !== 'annotation'))

const EXTRUSION_LABELS: Record<Extrusion, string> = {
  flat: 'Flat',
  low: 'Low',
  regular: 'Regular',
  tall: 'Tall',
  tower: 'Tower',
}
const EXTRUSION_OPTIONS = EXTRUSIONS.map((value) => ({ value, label: EXTRUSION_LABELS[value] }))

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

/* --------------------------------------------------------------- location */

/** How many of the selection have a 3D place of their own. */
const placed = computed(() => selected.value.filter((n) => (n.data as NodeData).position3d).length)

/** One node's place in 3D — moved there, or where the canvas puts it. */
const location = computed<Position3D | null>(() => {
  if (selected.value.length !== 1) return null
  return positions3D().get(selected.value[0]!.id) ?? null
})

/**
 * Typing a coordinate moves the node there in 3D, and what it holds with it,
 * the same as dragging it. One undo step per field, however many edits.
 */
function setLocation(axis: keyof Position3D, raw: string) {
  const at = location.value
  const value = Number(raw)
  if (!at || raw.trim() === '' || !Number.isFinite(value) || value === at[axis]) return
  commit(`position3d:${props.ids[0]}:${axis}`)
  setNodePosition3D(props.ids[0]!, { ...at, [axis]: value })
}

function resetLocation() {
  act(() => resetNodes3D(props.ids))
}

function onPlane(value: unknown) {
  if (value === NEW) {
    void startAdding()
    return
  }
  if (typeof value !== 'string' || !value) return
  act(() => setNodesPlane(props.ids, value === AUTO ? null : value))
}

/** A plane made from here is named first, then the selection is put on it in the same step. */
const adding = ref(false)
const draft = ref('')
const draftInput = ref<InstanceType<typeof Input> | null>(null)

async function startAdding() {
  adding.value = true
  draft.value = ''
  await nextTick()
  ;(draftInput.value?.$el as HTMLInputElement | undefined)?.focus()
}

function finishAdding(save: boolean) {
  const label = draft.value.trim()
  adding.value = false
  if (!save || !label) return
  act(() => {
    const created = addPlane(label)
    if (created) setNodesPlane(props.ids, created.id)
  })
}
</script>

<template>
  <section class="space-y-3 border-b p-3">
    <div class="flex items-center justify-between">
      <Label class="text-xs">3D</Label>
      <Button
        v-if="!view3d"
        variant="ghost"
        size="sm"
        class="text-muted-foreground -my-1 h-6 px-1.5 text-xs"
        title="Open the 3D view (3)"
        @click="view3d = true"
      >
        <Box />
        Open 3D
      </Button>
    </div>

    <div class="space-y-1.5">
      <Label class="text-muted-foreground text-[11px] font-normal">Plane</Label>
      <form v-if="adding" @submit.prevent="finishAdding(true)">
        <Input
          ref="draftInput"
          v-model="draft"
          class="h-8 text-sm"
          placeholder="Name the new plane…"
          @keydown.esc.prevent="finishAdding(false)"
          @keydown.stop
          @blur="finishAdding(true)"
        />
      </form>
      <Select v-else :model-value="plane" @update:model-value="onPlane">
        <SelectTrigger class="h-8 w-full text-sm">
          <SelectValue :placeholder="planes.length ? 'Mixed' : 'Ground — no planes yet'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-if="planes.length" :value="AUTO">{{ autoLabel }}</SelectItem>
          <SelectItem v-for="option in options" :key="option.id" :value="option.id">
            <span class="flex items-center gap-2">
              <span class="size-2.5 shrink-0 rounded-sm" :style="{ background: option.hex }" />
              {{ option.label }}
            </span>
          </SelectItem>
          <template v-if="canAddPlane">
            <SelectSeparator v-if="planes.length" />
            <SelectItem :value="NEW">New plane…</SelectItem>
          </template>
        </SelectContent>
      </Select>
    </div>

    <div v-if="extrudable" class="space-y-1.5">
      <Label class="text-muted-foreground text-[11px] font-normal">Height</Label>
      <SegmentedField
        :model-value="extrusion"
        :options="EXTRUSION_OPTIONS"
        @update:model-value="act(() => setNodesExtrusion(ids, $event as Extrusion))"
      />
    </div>

    <!--
      Where it stands in 3D. X and Y start as the canvas's own numbers and Z is
      height off the plane; changing them only ever moves the 3D view's copy.
    -->
    <div v-if="location || placed" class="space-y-1.5">
      <div class="flex items-center justify-between">
        <Label class="text-muted-foreground text-[11px] font-normal">Location</Label>
        <Button
          v-if="placed"
          variant="ghost"
          size="sm"
          class="text-muted-foreground -my-1 h-6 px-1.5 text-xs"
          title="Back to where the canvas has it (Alt+G in the 3D view)"
          @click="resetLocation"
        >
          <Undo2 />
          {{ selected.length > 1 ? `Reset ${placed}` : 'Reset' }}
        </Button>
      </div>
      <div v-if="location" class="flex gap-1.5">
        <div v-for="axis in AXES" :key="axis" class="relative min-w-0 flex-1">
          <span
            class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] font-bold"
            :style="{ color: AXIS_COLOR[axis] }"
          >{{ axis.toUpperCase() }}</span>
          <Input
            type="number"
            step="10"
            class="h-8 pr-1 pl-6 text-sm tabular-nums"
            :model-value="Math.round(location[axis] * 100) / 100"
            :aria-label="`3D ${axis}`"
            @change="setLocation(axis, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
      <p class="text-muted-foreground text-[11px] leading-snug">
        <template v-if="selected.length > 1">{{ placed }} of {{ selected.length }} moved in 3D.</template>
        <template v-else-if="placed">Moved in 3D — its place on the canvas is untouched.</template>
        <template v-else>Where the canvas has it. Move it in 3D with G, a drag or the gizmo.</template>
      </p>
    </div>

    <p class="text-muted-foreground text-[11px] leading-snug">
      Only the 3D view reads these. Height says what matters more — load, criticality — at a glance.
    </p>
  </section>
</template>
