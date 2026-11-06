<script setup lang="ts">
import { computed } from 'vue'
import { Box } from '@lucide/vue'
import type { Extrusion } from '@/model'
import { EXTRUSIONS } from '@/model'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useView3D } from '@/features/diagram/composables/useView3D'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'

/**
 * How tall a node stands in the 3D view — the one thing about the 3D view a
 * node carries. Where it stands there is never set: it is where the canvas has
 * it. Nothing set here changes the node on the 2D canvas. Edits one node or a
 * whole selection; a selection that disagrees shows nothing picked rather than
 * one node's answer.
 */

const props = defineProps<{ ids: string[] }>()

const { nodes, commit, endCoalesce, setNodesExtrusion } = useDiagram()
const { active: view3d } = useView3D()

const selected = computed(() => nodes.value.filter((n) => props.ids.includes(n.id)))

const extrusion = computed(() => {
  const values = new Set(selected.value.map((n) => (n.data as NodeData).extrusion))
  return values.size === 1 ? [...values][0]! : ''
})

/** A text annotation is only its face; it has no height to set. */
const extrudable = computed(() => selected.value.some((n) => n.type !== 'annotation'))

const EXTRUSION_LABELS: Record<Extrusion, string> = {
  flat: 'Flat',
  low: 'Low',
  regular: 'Regular',
  tall: 'Tall',
  tower: 'Tower',
}
const EXTRUSION_OPTIONS = EXTRUSIONS.map((value) => ({ value, label: EXTRUSION_LABELS[value] }))

function setExtrusion(value: Extrusion) {
  commit()
  endCoalesce()
  setNodesExtrusion(props.ids, value)
}
</script>

<template>
  <section v-if="extrudable" class="space-y-3 border-b p-3">
    <div class="flex items-center justify-between">
      <Label class="text-xs">3D height</Label>
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

    <SegmentedField
      :model-value="extrusion"
      :options="EXTRUSION_OPTIONS"
      @update:model-value="setExtrusion($event as Extrusion)"
    />

    <p class="text-muted-foreground text-[11px] leading-snug">
      Only the 3D view reads this. Say what matters more — load, criticality — at a glance: Tall and
      Tower stand on a post, Flat lies on its back.
    </p>
  </section>
</template>
