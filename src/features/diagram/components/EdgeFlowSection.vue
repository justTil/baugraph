<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Waypoints, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * How *this* connection animates, on the connection itself.
 *
 * A node's onward connections rarely mean the same thing — one to a service is
 * the happy path, one to a dead-letter queue is a failure — and the place to say
 * so is the connection, not a list somewhere else. Every control here reads
 * "same as the flow" until it is touched, so a connection that should look like
 * the rest keeps saying nothing at all rather than a copy of the flow's setting
 * that would then go stale the moment the flow changed.
 */

const props = defineProps<{ edgeId: string }>()

const {
  flows,
  commit,
  endCoalesce,
  addFlow,
  toggleFlowEdge,
  setFlowEdgeStyle,
  flowsOnEdge,
} = useDiagram()

const { highlighted, planOf } = useFlows()

const on = computed(() => flowsOnEdge(props.edgeId))
const off = computed(() => flows.value.filter((flow) => !flow.edges.includes(props.edgeId)))

const overrideOf = (flow: MessageFlow) => flow.style?.[props.edgeId] ?? {}

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

function hover(flow: MessageFlow | null) {
  highlighted.value = flow
    ? { id: flow.id, color: flow.color, edges: planOf(flow).edges }
    : null
}

/** An empty speed box means "whatever the flow runs at". */
function setSpeed(flow: MessageFlow, raw: string) {
  const value = raw.trim()
  if (!value) return act(() => setFlowEdgeStyle(flow.id, props.edgeId, { speed: undefined }))
  const speed = Math.min(4000, Math.max(10, Number(value)))
  if (!Number.isFinite(speed)) return
  act(() => setFlowEdgeStyle(flow.id, props.edgeId, { speed }))
}
</script>

<template>
  <section class="space-y-2.5 border-b p-3">
    <Label class="text-xs">Message flow</Label>

    <div
      v-for="flow in on"
      :key="flow.id"
      class="space-y-2.5 rounded-md border p-2.5"
      @mouseenter="hover(flow)"
      @mouseleave="hover(null)"
    >
      <div class="flex items-center gap-1.5">
        <span
          class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
          :style="{ background: COLOR_HEX[overrideOf(flow).color ?? flow.color] }"
        />
        <span class="min-w-0 flex-1 truncate text-xs font-medium">
          {{ flow.label || flow.id }}
        </span>
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground -my-1 size-6 shrink-0"
          title="Take this connection out of the flow"
          @click="act(() => toggleFlowEdge(flow.id, props.edgeId))"
        >
          <X />
        </Button>
      </div>

      <div class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Colour on this connection</Label>
        <ColorSwatches
          :model-value="overrideOf(flow).color ?? null"
          allow-default
          :default-hex="COLOR_HEX[flow.color]"
          @update:model-value="
            act(() => setFlowEdgeStyle(flow.id, props.edgeId, { color: $event ?? undefined }))
          "
        />
      </div>

      <div v-if="flow.motion !== 'dash'" class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Message</Label>
        <SegmentedField
          :model-value="overrideOf(flow).token ?? 'same'"
          :options="[
            { value: 'same', label: 'Same', title: 'Whatever the flow uses' },
            { value: 'dot', label: 'Dot' },
            { value: 'packet', label: 'Packet' },
            { value: 'envelope', label: 'Envelope' },
          ]"
          @update:model-value="
            act(() =>
              setFlowEdgeStyle(flow.id, props.edgeId, {
                token: $event === 'same' ? undefined : ($event as never),
              }),
            )
          "
        />
      </div>

      <div class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Speed on this connection</Label>
        <Input
          type="number"
          step="40"
          min="10"
          max="4000"
          class="h-8 text-sm"
          :model-value="overrideOf(flow).speed ?? ''"
          :placeholder="`${flow.speed} — same as the flow`"
          @change="setSpeed(flow, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <Button
      v-if="!on.length"
      variant="outline"
      size="sm"
      class="w-full justify-start"
      @click="act(() => addFlow([props.edgeId]))"
    >
      <Waypoints />
      Animate a message along this
    </Button>

    <Button
      v-for="flow in off"
      :key="flow.id"
      variant="ghost"
      size="sm"
      class="text-muted-foreground w-full justify-start"
      @click="act(() => toggleFlowEdge(flow.id, props.edgeId))"
    >
      <Plus />
      <span class="truncate">Add to “{{ flow.label || flow.id }}”</span>
    </Button>
  </section>
</template>
