<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, Pause, Play, Plus, Trash2, X } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toggle } from '@/components/ui/toggle'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { describeFlow } from '@/features/diagram/lib/flow-graph'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * The flow editor.
 *
 * A flow belongs to the diagram rather than to anything selected on it, so it is
 * edited in a room of its own: the list on the left, one flow's settings on the
 * right, wide enough to put the numbers side by side instead of stacking eight
 * controls down a 288-pixel column. Every control a flow has lives here, the
 * per-connection overrides included — a connection's inspector says which flows
 * it is part of and sends you here for the rest, so there is one colour picker
 * for a flow rather than two that disagree about which one you last used.
 */

const {
  nodes,
  edges,
  flows,
  selectedEdges,
  commit,
  endCoalesce,
  addFlow,
  updateFlow,
  removeFlow,
  toggleFlowEdge,
  setFlowEdgeStyle,
} = useDiagram()

const { paused, reduced, highlighted, editorOpen, editing, editingEdge, planOf } = useFlows()

const current = computed(() => flows.value.find((flow) => flow.id === editing.value) ?? null)

/** The flow's connections, named by the nodes they run between. */
const hops = computed(() => {
  const flow = current.value
  if (!flow) return []
  const byId = new Map(edges.value.map((e) => [e.id, e]))
  const label = (id: string) => nodes.value.find((n) => n.id === id)?.data?.label || id
  return flow.edges.flatMap((id) => {
    const edge = byId.get(id)
    return edge ? [{ id, from: label(edge.source), to: label(edge.target) }] : []
  })
})

const overrideOf = (flow: MessageFlow, edgeId: string) => flow.style?.[edgeId] ?? {}

/** Whether a connection is drawn its own way rather than like the rest. */
const tweaked = (flow: MessageFlow, edgeId: string) =>
  Object.keys(overrideOf(flow, edgeId)).length > 0

/** A flow can only be made where there is something for a message to travel. */
const candidate = computed(() => selectedEdges.value.map((e) => e.id))

/** Which connection's overrides are open. One at a time; the list gets long. */
const openHop = ref<string | null>(null)

// Opening on nothing — from the toolbar, with no flow named — should still land
// on something to edit, and a deleted flow must not leave the panel blank.
watch([editorOpen, flows], () => {
  if (!editorOpen.value) return
  if (!current.value) editing.value = flows.value[0]?.id ?? null
})

// Arriving from a connection opens that connection; switching flows by hand
// closes whatever was open, since it belonged to the flow you left.
watch(editingEdge, (edge) => {
  openHop.value = edge
})
watch(editing, () => {
  if (editingEdge.value && current.value?.edges.includes(editingEdge.value)) return
  editingEdge.value = null
  openHop.value = null
})

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

function create() {
  if (!candidate.value.length) return
  act(() => {
    const flow = addFlow(candidate.value)
    if (flow) editing.value = flow.id
  })
}

function edit(id: string, patch: Partial<MessageFlow>, coalesce?: string) {
  commit(coalesce)
  if (!coalesce) endCoalesce()
  updateFlow(id, patch)
}

function drop(id: string) {
  act(() => {
    if (highlighted.value?.id === id) highlighted.value = null
    removeFlow(id)
  })
}

function hover(flow: MessageFlow | null) {
  highlighted.value = flow
    ? { id: flow.id, color: flow.color, edges: planOf(flow).edges }
    : null
}

const summaryOf = (flow: MessageFlow) => describeFlow(planOf(flow))

/**
 * Sets one field of a connection's own look. `undefined` hands it back to the
 * flow, so "same as the rest" stays the absence of a value rather than a copy of
 * one that would go stale the moment the flow changed.
 */
function style(edgeId: string, patch: Parameters<typeof setFlowEdgeStyle>[2]) {
  const flow = current.value
  if (!flow) return
  act(() => setFlowEdgeStyle(flow.id, edgeId, patch))
}

/** An empty speed box means "whatever the flow runs at". */
function setHopSpeed(edgeId: string, raw: string) {
  const value = raw.trim()
  if (!value) return style(edgeId, { speed: undefined })
  const speed = Number(value)
  if (!Number.isFinite(speed)) return
  style(edgeId, { speed: Math.min(4000, Math.max(10, speed)) })
}

/** Dropping the last connection would take the flow with it — so warn instead. */
function dropHop(edgeId: string) {
  const flow = current.value
  if (!flow) return
  if (flow.edges.length === 1) return drop(flow.id)
  if (openHop.value === edgeId) openHop.value = null
  act(() => toggleFlowEdge(flow.id, edgeId))
}

/** Clamps a number field to its own bounds, falling back on the flow's value. */
const clamp = (raw: string, min: number, max: number, fallback: number, round = false) => {
  const value = Number(raw) || fallback
  return Math.min(max, Math.max(min, round ? Math.round(value) : value))
}
</script>

<template>
  <Dialog v-model:open="editorOpen">
    <DialogContent class="flex h-[80vh] flex-col gap-0 p-0 sm:max-w-3xl">
      <DialogHeader class="border-b px-5 py-4">
        <DialogTitle>Message flows</DialogTitle>
        <DialogDescription>
          A message travelling the connections you picked, multiplying wherever the path
          forks — one message into a topic, three out of it.
        </DialogDescription>
      </DialogHeader>

      <div class="flex min-h-0 flex-1">
        <!-- ------------------------------------------------------ the list -->
        <aside class="flex w-60 shrink-0 flex-col border-r">
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <p
              v-if="!flows.length"
              class="text-muted-foreground p-2 text-xs leading-relaxed"
            >
              No flows yet. Select the connections a message travels on the canvas, then add
              one here.
            </p>

            <ul class="space-y-0.5">
              <li v-for="flow in flows" :key="flow.id">
                <div
                  class="hover:bg-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5"
                  :class="{ 'bg-accent': editing === flow.id }"
                  @mouseenter="hover(flow)"
                  @mouseleave="hover(null)"
                >
                  <button type="button" class="min-w-0 flex-1 text-left" @click="editing = flow.id">
                    <span class="flex items-center gap-1.5">
                      <span
                        class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
                        :style="{
                          background: COLOR_HEX[flow.color],
                          opacity: flow.enabled ? 1 : 0.35,
                        }"
                      />
                      <span
                        class="truncate text-xs font-medium"
                        :class="{ 'opacity-50': !flow.enabled }"
                      >
                        {{ flow.label || flow.id }}
                      </span>
                    </span>
                    <span class="text-muted-foreground mt-0.5 block truncate font-mono text-[10px]">
                      {{ summaryOf(flow) }}
                    </span>
                  </button>

                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-6 shrink-0"
                    :title="flow.enabled ? 'Stop this flow' : 'Run this flow'"
                    @click="edit(flow.id, { enabled: !flow.enabled })"
                  >
                    <component :is="flow.enabled ? Pause : Play" />
                  </Button>
                </div>
              </li>
            </ul>
          </div>

          <div class="space-y-2 border-t p-2">
            <Button
              variant="outline"
              size="sm"
              class="w-full justify-start"
              :disabled="!candidate.length"
              :title="
                candidate.length
                  ? `Animate a message over ${candidate.length} connection${candidate.length === 1 ? '' : 's'}`
                  : 'Select the connections on the canvas first'
              "
              @click="create"
            >
              <Plus />
              <span class="truncate">
                {{
                  candidate.length
                    ? `Flow along ${candidate.length} connection${candidate.length === 1 ? '' : 's'}`
                    : 'Add a flow'
                }}
              </span>
            </Button>

            <Button
              v-if="flows.length"
              variant="ghost"
              size="sm"
              class="text-muted-foreground w-full justify-start"
              :title="paused ? 'Resume every flow' : 'Freeze every flow where it is'"
              @click="paused = !paused"
            >
              <component :is="paused ? Play : Pause" />
              {{ paused ? 'Play all' : 'Pause all' }}
            </Button>
          </div>
        </aside>

        <!-- ---------------------------------------------------- the editor -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="!current"
            class="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm"
          >
            Select the connections a message travels on the canvas, then add a flow.
          </div>

          <div v-else class="space-y-5 p-5">
            <div class="space-y-1.5">
              <Label class="text-xs">Name</Label>
              <Input
                :model-value="current.label"
                placeholder="Order placed"
                @update:model-value="
                  edit(current!.id, { label: String($event) }, `flow:${current!.id}:label`)
                "
                @blur="endCoalesce()"
              />
              <p class="text-muted-foreground font-mono text-[11px]">
                {{ summaryOf(current) }}
              </p>
            </div>

            <div class="space-y-1.5">
              <Label class="text-xs">Colour</Label>
              <ColorSwatches
                :model-value="current.color"
                @update:model-value="edit(current!.id, { color: $event! })"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <Label class="text-xs">Shown as</Label>
                <SegmentedField
                  :model-value="current.motion"
                  :options="[
                    { value: 'token', label: 'Messages', title: 'Messages travelling the line' },
                    { value: 'dash', label: 'Line', title: 'A moving line, for constant traffic' },
                    { value: 'both', label: 'Both', title: 'Messages over a moving line' },
                  ]"
                  @update:model-value="edit(current!.id, { motion: $event as never })"
                />
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs" :class="{ 'opacity-50': current.motion === 'dash' }">
                  Message
                </Label>
                <SegmentedField
                  v-if="current.motion !== 'dash'"
                  :model-value="current.token"
                  :options="[
                    { value: 'dot', label: 'Dot' },
                    { value: 'packet', label: 'Packet' },
                    { value: 'envelope', label: 'Envelope' },
                  ]"
                  @update:model-value="edit(current!.id, { token: $event as never })"
                />
                <p v-else class="text-muted-foreground pt-1.5 text-xs">
                  A moving line has no message to shape.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <Label class="text-xs">Where the path forks</Label>
                <SegmentedField
                  :model-value="current.mode"
                  :options="[
                    {
                      value: 'broadcast',
                      label: 'Multiply',
                      title:
                        'The message takes every onward connection at once — one in, three out',
                    },
                    {
                      value: 'sequence',
                      label: 'One by one',
                      title: 'A single message walks the connections in turn',
                    },
                  ]"
                  @update:model-value="edit(current!.id, { mode: $event as never })"
                />
              </div>

              <!--
                An event happens once and the line goes quiet again; traffic never
                does. The difference is the single most visible thing about a flow,
                so it is a choice rather than a checkbox buried in the numbers.
              -->
              <div class="space-y-1.5">
                <Label class="text-xs">Sends</Label>
                <SegmentedField
                  :model-value="current.stream ? 'stream' : 'burst'"
                  :options="[
                    {
                      value: 'burst',
                      label: 'An event',
                      title: 'A message goes through, then the line is quiet until the next one',
                    },
                    {
                      value: 'stream',
                      label: 'Constantly',
                      title: 'Messages leave without stopping, so the line is never empty',
                    },
                  ]"
                  @update:model-value="edit(current!.id, { stream: $event === 'stream' })"
                />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-1.5">
                <Label class="text-xs">Speed</Label>
                <Input
                  type="number"
                  step="40"
                  min="10"
                  max="4000"
                  :model-value="current.speed"
                  @change="
                    edit(current!.id, {
                      speed: clamp(($event.target as HTMLInputElement).value, 10, 4000, 220),
                    })
                  "
                />
                <p class="text-muted-foreground text-[11px]">Canvas units a second.</p>
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs">
                  {{ current.stream ? 'In flight' : 'Messages' }}
                </Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="12"
                  :model-value="current.count"
                  @change="
                    edit(current!.id, {
                      count: clamp(($event.target as HTMLInputElement).value, 1, 12, 1, true),
                    })
                  "
                />
                <p class="text-muted-foreground text-[11px]">
                  {{
                    current.stream
                      ? 'On the way at any moment.'
                      : 'Sent per pass, one behind the other.'
                  }}
                </p>
              </div>

              <!-- A stream has no pass, so there is nothing to wait between. -->
              <div v-if="!current.stream" class="space-y-1.5">
                <Label class="text-xs">Gap</Label>
                <Input
                  type="number"
                  step="0.2"
                  min="0"
                  max="60"
                  :model-value="current.pause"
                  @change="
                    edit(current!.id, {
                      pause: clamp(($event.target as HTMLInputElement).value, 0, 60, 0),
                    })
                  "
                />
                <p class="text-muted-foreground text-[11px]">Seconds before the next pass.</p>
              </div>
            </div>

            <!--
              Two paths out of the same node rarely mean the same thing — the
              failure one crawling to a dead-letter queue, the rest at full speed
              — so any connection can be drawn its own way. Collapsed by default:
              most never need it, and the ones that do say so on their own row.
            -->
            <section class="space-y-1.5 border-t pt-4">
              <Label class="text-xs">Connections</Label>
              <p class="text-muted-foreground text-[11px] leading-relaxed">
                Open one to draw it differently from the rest of the flow.
              </p>

              <ul class="divide-y rounded-md border">
                <li v-for="hop in hops" :key="hop.id">
                  <div
                    class="hover:bg-accent/60 flex items-center gap-1.5 px-2 py-1.5"
                    :class="{ 'bg-accent/60': openHop === hop.id }"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      @click="openHop = openHop === hop.id ? null : hop.id"
                    >
                      <ChevronRight
                        class="text-muted-foreground size-3.5 shrink-0 transition-transform"
                        :class="{ 'rotate-90': openHop === hop.id }"
                      />
                      <span
                        class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
                        :style="{
                          background:
                            COLOR_HEX[overrideOf(current, hop.id).color ?? current.color],
                        }"
                      />
                      <span class="min-w-0 flex-1 truncate text-xs">
                        {{ hop.from }} → {{ hop.to }}
                      </span>
                      <span
                        v-if="tweaked(current, hop.id)"
                        class="text-muted-foreground shrink-0 text-[10px]"
                      >
                        own look
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-muted-foreground -my-1 size-6 shrink-0"
                      title="Take this connection out of the flow"
                      @click="dropHop(hop.id)"
                    >
                      <X />
                    </Button>
                  </div>

                  <div v-if="openHop === hop.id" class="grid grid-cols-2 gap-4 px-2 pt-1 pb-3">
                    <div class="space-y-1.5">
                      <Label class="text-muted-foreground text-[10px]">Colour here</Label>
                      <ColorSwatches
                        :model-value="overrideOf(current, hop.id).color ?? null"
                        allow-default
                        :default-hex="COLOR_HEX[current.color]"
                        @update:model-value="style(hop.id, { color: $event ?? undefined })"
                      />
                    </div>

                    <div class="space-y-1.5">
                      <Label class="text-muted-foreground text-[10px]">Speed here</Label>
                      <Input
                        type="number"
                        step="40"
                        min="10"
                        max="4000"
                        class="h-8"
                        :model-value="overrideOf(current, hop.id).speed ?? ''"
                        :placeholder="`${current.speed} — same as the flow`"
                        @change="setHopSpeed(hop.id, ($event.target as HTMLInputElement).value)"
                      />
                    </div>

                    <div v-if="current.motion !== 'dash'" class="col-span-2 space-y-1.5">
                      <Label class="text-muted-foreground text-[10px]">Message here</Label>
                      <SegmentedField
                        :model-value="overrideOf(current, hop.id).token ?? 'same'"
                        :options="[
                          { value: 'same', label: 'Same', title: 'Whatever the flow uses' },
                          { value: 'dot', label: 'Dot' },
                          { value: 'packet', label: 'Packet' },
                          { value: 'envelope', label: 'Envelope' },
                        ]"
                        @update:model-value="
                          style(hop.id, { token: $event === 'same' ? undefined : ($event as never) })
                        "
                      />
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <div class="flex items-center gap-2 border-t pt-4">
              <Toggle
                size="sm"
                variant="outline"
                :model-value="current.loop"
                @update:model-value="edit(current!.id, { loop: Boolean($event) })"
              >
                {{ current.loop ? 'Repeats' : 'Runs once' }}
              </Toggle>
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground ml-auto"
                @click="drop(current!.id)"
              >
                <Trash2 />
                Delete flow
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="reduced"
        class="text-muted-foreground border-t px-5 py-2.5 text-xs leading-relaxed"
      >
        Your system asks for reduced motion, so messages are shown parked on the connections
        they travel rather than moving along them.
      </p>
    </DialogContent>
  </Dialog>
</template>
