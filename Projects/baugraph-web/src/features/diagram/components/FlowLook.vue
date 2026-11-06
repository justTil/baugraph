<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import FlowGlyph from '@/features/diagram/components/FlowGlyph.vue'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * How a flow looks and how fast it goes — everything about it that is not
 * *what* it travels or *in which order*, which the sequence beside it shows.
 *
 * With a connection picked out in the sequence, what that one connection draws
 * comes first: a failure path drawn as a red packet crawling to the dead-letter
 * queue while the rest stay blue envelopes at full speed. Every control there
 * reads "same as the flow" until it is touched, and the file records only what
 * differs.
 */

const props = defineProps<{
  flow: MessageFlow
  /** The connection picked out in the sequence, if any. */
  edge: string | null
}>()

const emit = defineEmits<{ (e: 'close-edge'): void }>()

const { nodes, edges, commit, endCoalesce, updateFlow, setFlowEdgeStyle } = useDiagram()

const labelOf = (id: string) => nodes.value.find((n) => n.id === id)?.data?.label || id

const hop = computed(() => {
  if (!props.edge || !props.flow.edges.includes(props.edge)) return null
  const edge = edges.value.find((e) => e.id === props.edge)
  return edge ? { id: edge.id, from: labelOf(edge.source), to: labelOf(edge.target) } : null
})

const override = computed(() => (hop.value ? (props.flow.style?.[hop.value.id] ?? {}) : {}))
const tweaked = computed(() => Object.keys(override.value).length > 0)

function edit(patch: Partial<MessageFlow>) {
  commit()
  endCoalesce()
  updateFlow(props.flow.id, patch)
}

/**
 * Sets one field of a connection's own look. `undefined` hands it back to the
 * flow, so "same as the rest" stays the absence of a value rather than a copy of
 * one that would go stale the moment the flow changed.
 */
function style(patch: Parameters<typeof setFlowEdgeStyle>[2]) {
  if (!hop.value) return
  commit()
  endCoalesce()
  setFlowEdgeStyle(props.flow.id, hop.value.id, patch)
}

/** An empty speed box means "whatever the flow runs at". */
function setHopSpeed(raw: string) {
  const value = raw.trim()
  if (!value) return style({ speed: undefined })
  const speed = Number(value)
  if (!Number.isFinite(speed)) return
  style({ speed: Math.min(4000, Math.max(10, speed)) })
}

/** Clamps a number field to its own bounds, falling back on the flow's value. */
const clamp = (raw: string, min: number, max: number, fallback: number, round = false) => {
  const value = Number(raw) || fallback
  return Math.min(max, Math.max(min, round ? Math.round(value) : value))
}

const valueOf = (event: Event) => (event.target as HTMLInputElement).value
</script>

<template>
  <div class="space-y-5 p-3">
    <!-- ------------------------------------------- one connection's own look -->
    <section
      v-if="hop"
      class="bg-background space-y-3 rounded-lg border p-3 shadow-xs"
      :style="{ borderColor: COLOR_HEX[override.color ?? flow.color] }"
    >
      <header class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
            Only on this connection
          </p>
          <p class="truncate text-xs font-medium" :title="`${hop.from} → ${hop.to}`">
            {{ hop.from }} → {{ hop.to }}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground -mt-1 -mr-1 size-6"
          title="Done with this connection"
          @click="emit('close-edge')"
        >
          <X />
        </Button>
      </header>

      <div v-if="flow.motion !== 'dash'" class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Message</Label>
        <SegmentedField
          :model-value="override.token ?? 'same'"
          :options="[
            { value: 'same', label: 'Same', title: 'Whatever the flow uses', preview: flow.token },
            { value: 'dot', label: 'Dot', preview: 'dot' },
            { value: 'packet', label: 'Packet', preview: 'packet' },
            { value: 'envelope', label: 'Envelope', preview: 'envelope' },
          ]"
          @update:model-value="style({ token: $event === 'same' ? undefined : ($event as never) })"
        >
          <template #preview="{ option }">
            <FlowGlyph
              :kind="option.preview as never"
              :colour="COLOR_HEX[override.color ?? flow.color]"
              :faint="option.value === 'same'"
            />
          </template>
        </SegmentedField>
      </div>

      <div class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Colour</Label>
        <ColorSwatches
          :model-value="override.color ?? null"
          allow-default
          :default-hex="COLOR_HEX[flow.color]"
          @update:model-value="style({ color: $event ?? undefined })"
        />
      </div>

      <div class="space-y-1.5">
        <Label class="text-muted-foreground text-[10px]">Speed</Label>
        <Input
          type="number"
          step="40"
          min="10"
          max="4000"
          class="h-8"
          :model-value="override.speed ?? ''"
          :placeholder="`${flow.speed} — same as the flow`"
          @change="setHopSpeed(valueOf($event))"
        />
      </div>

      <Button
        v-if="tweaked"
        variant="ghost"
        size="sm"
        class="text-muted-foreground h-7 w-full justify-start text-xs"
        @click="style({ color: undefined, token: undefined, speed: undefined })"
      >
        <RotateCcw />
        Draw this one like the rest again
      </Button>
    </section>

    <!-- ------------------------------------------------------- the whole flow -->
    <section class="space-y-4">
      <p
        v-if="hop"
        class="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase"
      >
        Whole flow
      </p>

      <div class="space-y-1.5">
        <Label class="text-xs">Colour</Label>
        <ColorSwatches
          :model-value="flow.color"
          @update:model-value="edit({ color: $event! })"
        />
      </div>

      <div class="space-y-1.5">
        <Label class="text-xs">Shown as</Label>
        <SegmentedField
          :model-value="flow.motion"
          :options="[
            { value: 'token', label: 'Messages', title: 'Messages travelling the line', preview: 'motion-token' },
            { value: 'dash', label: 'Line', title: 'A moving line, for constant traffic', preview: 'motion-dash' },
            { value: 'both', label: 'Both', title: 'Messages over a moving line', preview: 'motion-both' },
          ]"
          @update:model-value="edit({ motion: $event as never })"
        >
          <template #preview="{ option }">
            <FlowGlyph :kind="option.preview as never" :colour="COLOR_HEX[flow.color]" />
          </template>
        </SegmentedField>
      </div>

      <div v-if="flow.motion !== 'dash'" class="space-y-1.5">
        <Label class="text-xs">Message</Label>
        <SegmentedField
          :model-value="flow.token"
          :options="[
            { value: 'dot', label: 'Dot', preview: 'dot' },
            { value: 'packet', label: 'Packet', preview: 'packet' },
            { value: 'envelope', label: 'Envelope', preview: 'envelope' },
          ]"
          @update:model-value="edit({ token: $event as never })"
        >
          <template #preview="{ option }">
            <FlowGlyph :kind="option.preview as never" :colour="COLOR_HEX[flow.color]" />
          </template>
        </SegmentedField>
      </div>

      <!--
        An event happens once and the line goes quiet again; traffic never does.
        The difference is the single most visible thing about a flow, so it is a
        choice rather than a checkbox buried in the numbers.
      -->
      <div class="space-y-1.5">
        <Label class="text-xs">Sends</Label>
        <SegmentedField
          :model-value="flow.stream ? 'stream' : 'burst'"
          :options="[
            {
              value: 'burst',
              label: 'An event',
              title: 'A message goes through, then the line is quiet until the next one',
              preview: 'send-burst',
            },
            {
              value: 'stream',
              label: 'Constantly',
              title: 'Messages leave without stopping, so the line is never empty',
              preview: 'send-stream',
            },
          ]"
          @update:model-value="edit({ stream: $event === 'stream' })"
        >
          <template #preview="{ option }">
            <FlowGlyph :kind="option.preview as never" :colour="COLOR_HEX[flow.color]" />
          </template>
        </SegmentedField>
        <p class="text-muted-foreground text-[11px] leading-relaxed">
          {{
            flow.stream
              ? 'The line is never empty: as one message arrives the next has already left.'
              : 'A message goes through and the line falls quiet until the next one.'
          }}
        </p>
      </div>

      <div class="grid gap-2" :class="flow.stream ? 'grid-cols-2' : 'grid-cols-3'">
        <div class="space-y-1.5">
          <Label class="text-xs" title="Canvas units a second">Speed</Label>
          <Input
            type="number"
            step="40"
            min="10"
            max="4000"
            class="h-8"
            title="Canvas units a second"
            :model-value="flow.speed"
            @change="edit({ speed: clamp(valueOf($event), 10, 4000, 220) })"
          />
        </div>

        <div class="space-y-1.5">
          <Label
            class="text-xs"
            :title="flow.stream ? 'On the way at any moment' : 'Sent per pass, one behind the other'"
          >
            {{ flow.stream ? 'In flight' : 'Messages' }}
          </Label>
          <Input
            type="number"
            step="1"
            min="1"
            max="12"
            class="h-8"
            :model-value="flow.count"
            @change="edit({ count: clamp(valueOf($event), 1, 12, 1, true) })"
          />
        </div>

        <!-- A stream has no pass, so there is nothing to wait between. -->
        <div v-if="!flow.stream" class="space-y-1.5">
          <Label class="text-xs" title="Seconds before the next pass">Gap (s)</Label>
          <Input
            type="number"
            step="0.2"
            min="0"
            max="60"
            class="h-8"
            title="Seconds before the next pass"
            :model-value="flow.pause"
            @change="edit({ pause: clamp(valueOf($event), 0, 60, 0) })"
          />
        </div>
      </div>

      <Toggle
        size="sm"
        variant="outline"
        :model-value="flow.loop"
        :title="flow.loop ? 'Plays over and over' : 'Plays once, then stops'"
        @update:model-value="edit({ loop: Boolean($event) })"
      >
        {{ flow.loop ? 'Repeats' : 'Runs once' }}
      </Toggle>
    </section>
  </div>
</template>
