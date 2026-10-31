<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Box } from '@lucide/vue'
import type { Extrusion } from '@/model'
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
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * Where a node stands in the 3D view: which plane, and how tall.
 *
 * Optional on top of everything else in the inspector — a node left alone here
 * follows its zone onto its plane, or stands on the ground, at the regular
 * height — and nothing set here changes the node on the 2D canvas. Edits one
 * node or a whole selection; a field the selection disagrees on shows nothing
 * picked rather than one node's answer.
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

    <p class="text-muted-foreground text-[11px] leading-snug">
      Only the 3D view reads these. Height says what matters more — load, criticality — at a glance.
    </p>
  </section>
</template>
