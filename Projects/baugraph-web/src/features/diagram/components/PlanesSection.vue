<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Box, ChevronDown, ChevronUp, Layers3, Plus, Trash2 } from '@lucide/vue'
import type { ColorKey } from '@/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useView3D } from '@/features/diagram/composables/useView3D'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * The planes of the 3D view — `planes` in the file — edited from the panel you
 * see when nothing is selected, since they belong to the diagram as a whole.
 *
 * Listed the way they stand, top of the stack first: that is how anyone thinks
 * of "the layer above", even though the file writes them ground first. Nothing
 * here touches the 2D canvas; a diagram without planes is simply flat.
 */

const {
  nodes,
  planes,
  canAddPlane,
  commit,
  endCoalesce,
  addPlane,
  updatePlane,
  removePlane,
  movePlane,
  planeOfNode,
} = useDiagram()
const { active: view3d } = useView3D()

const stacked = computed(() => {
  const counts = new Map<string, number>()
  for (const node of nodes.value) {
    const plane = planeOfNode(node.id)
    if (plane) counts.set(plane, (counts.get(plane) ?? 0) + 1)
  }
  const last = planes.value.length - 1
  return planes.value
    .map((plane, level) => ({ ...plane, level, top: level === last, count: counts.get(plane.id) ?? 0 }))
    .reverse()
})

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

/** Typing a name coalesces into one undo step per plane, like every other text field. */
function rename(id: string, label: string) {
  commit(`plane:${id}:label`)
  updatePlane(id, { label })
}

/**
 * A new plane is named before it exists: its id is taken from the name and never
 * changes after, so "plane-3" would be in the file for good.
 */
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
  if (save && label) act(() => addPlane(label))
}
</script>

<template>
  <section class="border-b">
    <header class="bg-muted/50 flex items-center gap-1.5 border-b px-3 py-2">
      <Layers3 class="text-muted-foreground size-3.5 shrink-0" />
      <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
        3D planes
      </span>
      <span v-if="planes.length" class="text-muted-foreground/70 ml-auto text-[10px]">
        {{ planes.length }}
      </span>
    </header>

    <div class="space-y-1 p-3">
      <p v-if="!planes.length && !adding" class="text-muted-foreground pb-1 text-xs leading-relaxed">
        Planes give the 3D view its height: a trust zone, a tier, an environment. Nodes keep their
        place on the canvas and are lifted onto the plane they belong to. Optional — without any,
        the diagram is flat.
      </p>

      <div
        v-for="plane in stacked"
        :key="plane.id"
        class="group hover:bg-accent/60 flex items-center gap-1.5 rounded-md px-1 py-1"
      >
        <Popover>
          <PopoverTrigger as-child>
            <button
              type="button"
              class="size-5 shrink-0 rounded-md border border-black/20 dark:border-white/20"
              :style="{ background: COLOR_HEX[plane.color ?? 'slate'] }"
              :title="`Colour of ${plane.label || plane.id}`"
            />
          </PopoverTrigger>
          <PopoverContent class="w-auto p-2" align="start">
            <ColorSwatches
              :model-value="plane.color ?? 'slate'"
              @update:model-value="act(() => updatePlane(plane.id, { color: ($event ?? 'slate') as ColorKey }))"
            />
          </PopoverContent>
        </Popover>
        <Input
          :model-value="plane.label"
          :placeholder="plane.id"
          class="h-7 min-w-0 flex-1 px-2 text-xs"
          :title="plane.level === 0 ? 'The ground: nodes that name no plane stand here' : undefined"
          @update:model-value="rename(plane.id, String($event))"
          @blur="endCoalesce()"
        />
        <span
          class="text-muted-foreground w-5 shrink-0 text-right text-[10px] tabular-nums"
          :title="`${plane.count} node${plane.count === 1 ? '' : 's'} on this plane`"
        >
          {{ plane.count }}
        </span>
        <div
          class="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        >
          <Button
            variant="ghost"
            size="icon-xs"
            class="text-muted-foreground"
            title="Raise"
            :disabled="plane.top"
            @click="act(() => movePlane(plane.id, 1))"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            class="text-muted-foreground"
            title="Lower"
            :disabled="plane.level === 0"
            @click="act(() => movePlane(plane.id, -1))"
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            class="text-muted-foreground hover:text-destructive"
            title="Delete plane — what stood on it goes back to its zone's plane, or the ground"
            @click="act(() => removePlane(plane.id))"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <form v-if="adding" class="pt-1" @submit.prevent="finishAdding(true)">
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

      <div v-else class="flex gap-2 pt-1">
        <Button variant="outline" size="sm" class="flex-1" :disabled="!canAddPlane" @click="startAdding">
          <Plus />
          Add plane
        </Button>
        <Button v-if="!view3d" variant="outline" size="sm" class="flex-1" @click="view3d = true">
          <Box />
          Open 3D
        </Button>
      </div>
    </div>
  </section>
</template>
