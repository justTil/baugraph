<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pause, Play, Plus, Trash2, Waypoints } from '@lucide/vue'
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
 * Message flows, in the inspector.
 *
 * Creating one is a single click because the interesting part is derived, not
 * authored: point at the service that publishes and the editor works out the
 * broker, the subscribers hanging off it and the order it all happens in. What
 * is left to set is what the message *looks* like, which is what this panel is.
 */

const {
  flows,
  selectedNodes,
  selectedEdges,
  commit,
  endCoalesce,
  addFlow,
  updateFlow,
  removeFlow,
  edgesWithin,
  edgesDownstream,
} = useDiagram()

const { paused, reduced, highlighted, planOf } = useFlows()

/** Which flow's settings are open. One at a time; the panel is narrow. */
const open = ref<string | null>(null)

/**
 * What "add a flow" means right now. A single node is the common case and the
 * good one — everything a message reaches from there, fan-out included.
 */
const source = computed(() => {
  const nodes = selectedNodes.value
  const edges = selectedEdges.value

  if (edges.length) {
    return {
      label: `Flow along ${edges.length} connection${edges.length === 1 ? '' : 's'}`,
      edges: () => edges.map((e) => e.id),
    }
  }
  if (nodes.length === 1) {
    const node = nodes[0]!
    return {
      label: `Flow from ${node.data.label || node.id}`,
      edges: () => edgesDownstream(node.id),
    }
  }
  if (nodes.length > 1) {
    return {
      label: `Flow through ${nodes.length} nodes`,
      edges: () => edgesWithin(nodes.map((n) => n.id)),
    }
  }
  return null
})

/** A flow can only be made where there is something for a message to travel. */
const candidate = computed(() => source.value?.edges() ?? [])

function create() {
  const ids = candidate.value
  if (!ids.length) return
  commit()
  endCoalesce()
  const flow = addFlow(ids)
  if (flow) open.value = flow.id
}

function edit(id: string, patch: Partial<MessageFlow>, coalesce?: string) {
  commit(coalesce)
  if (!coalesce) endCoalesce()
  updateFlow(id, patch)
}

function drop(id: string) {
  commit()
  endCoalesce()
  if (highlighted.value?.id === id) highlighted.value = null
  removeFlow(id)
}

function hover(flow: MessageFlow | null) {
  if (!flow) {
    highlighted.value = null
    return
  }
  highlighted.value = { id: flow.id, color: flow.color, edges: planOf(flow).edges }
}

const summaryOf = (flow: MessageFlow) => describeFlow(planOf(flow))
</script>

<template>
  <section class="space-y-2.5 border-b p-3">
    <div class="flex items-center justify-between">
      <Label class="text-xs">Message flows</Label>
      <Button
        v-if="flows.length"
        variant="ghost"
        size="sm"
        class="text-muted-foreground -my-1 h-6 px-1.5 text-xs"
        :title="paused ? 'Resume every flow' : 'Freeze every flow where it is'"
        @click="paused = !paused"
      >
        <component :is="paused ? Play : Pause" />
        {{ paused ? 'Play' : 'Pause' }}
      </Button>
    </div>

    <Button
      variant="outline"
      size="sm"
      class="w-full justify-start"
      :disabled="!candidate.length"
      :title="
        candidate.length
          ? `Animate a message over ${candidate.length} connection${candidate.length === 1 ? '' : 's'}`
          : 'Select a node or a connection to animate a message along'
      "
      @click="create"
    >
      <Plus />
      <span class="truncate">{{ source?.label ?? 'Add message flow' }}</span>
    </Button>

    <p v-if="!flows.length" class="text-muted-foreground text-xs leading-relaxed">
      Select the node a message starts at and add a flow: it travels every connection
      onwards, multiplying wherever the path forks — one message into a topic, three
      out of it.
    </p>

    <p v-if="reduced" class="text-muted-foreground text-xs leading-relaxed">
      Your system asks for reduced motion, so messages are shown parked on the
      connections they travel rather than moving along them.
    </p>

    <ul v-if="flows.length" class="space-y-1">
      <li v-for="flow in flows" :key="flow.id">
        <div
          class="hover:bg-accent/60 flex items-center gap-2 rounded-md px-1.5 py-1.5"
          :class="{ 'bg-accent/60': open === flow.id }"
          @mouseenter="hover(flow)"
          @mouseleave="hover(null)"
        >
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            @click="open = open === flow.id ? null : flow.id"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
                :style="{ background: COLOR_HEX[flow.color], opacity: flow.enabled ? 1 : 0.35 }"
              />
              <span class="truncate text-xs font-medium" :class="{ 'opacity-50': !flow.enabled }">
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

        <!-- ------------------------------------------------------- editor -->
        <div v-if="open === flow.id" class="space-y-3 px-1.5 pt-2 pb-3">
          <div class="space-y-1.5">
            <Label class="text-xs">Name</Label>
            <Input
              :model-value="flow.label"
              class="h-8 text-sm"
              placeholder="Order placed"
              @update:model-value="edit(flow.id, { label: String($event) }, `flow:${flow.id}:label`)"
              @blur="endCoalesce()"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">Colour</Label>
            <ColorSwatches
              :model-value="flow.color"
              @update:model-value="edit(flow.id, { color: $event! })"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">Shown as</Label>
            <SegmentedField
              :model-value="flow.motion"
              :options="[
                { value: 'token', label: 'Messages', title: 'Messages travelling the line' },
                { value: 'dash', label: 'Line', title: 'A moving line, for constant traffic' },
                { value: 'both', label: 'Both', title: 'Messages over a moving line' },
              ]"
              @update:model-value="edit(flow.id, { motion: $event as never })"
            />
          </div>

          <div v-if="flow.motion !== 'dash'" class="space-y-1.5">
            <Label class="text-xs">Message</Label>
            <SegmentedField
              :model-value="flow.token"
              :options="[
                { value: 'dot', label: 'Dot' },
                { value: 'packet', label: 'Packet' },
                { value: 'envelope', label: 'Envelope' },
              ]"
              @update:model-value="edit(flow.id, { token: $event as never })"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">Where the path forks</Label>
            <SegmentedField
              :model-value="flow.mode"
              :options="[
                {
                  value: 'broadcast',
                  label: 'Multiply',
                  title: 'The message takes every onward connection at once — one in, three out',
                },
                {
                  value: 'sequence',
                  label: 'One by one',
                  title: 'A single message walks the connections in turn',
                },
              ]"
              @update:model-value="edit(flow.id, { mode: $event as never })"
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
              :model-value="flow.stream ? 'stream' : 'burst'"
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
              @update:model-value="edit(flow.id, { stream: $event === 'stream' })"
            />
          </div>

          <div class="flex gap-2">
            <div class="relative flex-1 space-y-1.5">
              <Label class="text-xs">Speed</Label>
              <Input
                type="number"
                step="40"
                min="10"
                max="4000"
                class="h-8 text-sm"
                :model-value="flow.speed"
                @change="
                  edit(flow.id, {
                    speed: Math.min(
                      4000,
                      Math.max(10, Number(($event.target as HTMLInputElement).value) || 220),
                    ),
                  })
                "
              />
            </div>
            <div class="flex-1 space-y-1.5">
              <Label
                class="text-xs"
                :title="
                  flow.stream
                    ? 'How many messages are on the way at any moment'
                    : 'How many messages go through per pass'
                "
              >
                {{ flow.stream ? 'In flight' : 'Messages' }}
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                max="12"
                class="h-8 text-sm"
                :model-value="flow.count"
                @change="
                  edit(flow.id, {
                    count: Math.min(
                      12,
                      Math.max(1, Math.round(Number(($event.target as HTMLInputElement).value) || 1)),
                    ),
                  })
                "
              />
            </div>
            <!-- A stream has no pass, so there is nothing to wait between. -->
            <div v-if="!flow.stream" class="flex-1 space-y-1.5">
              <Label class="text-xs">Gap</Label>
              <Input
                type="number"
                step="0.2"
                min="0"
                max="60"
                class="h-8 text-sm"
                :model-value="flow.pause"
                @change="
                  edit(flow.id, {
                    pause: Math.min(
                      60,
                      Math.max(0, Number(($event.target as HTMLInputElement).value) || 0),
                    ),
                  })
                "
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Toggle
              size="sm"
              variant="outline"
              class="flex-1"
              :model-value="flow.loop"
              @update:model-value="edit(flow.id, { loop: Boolean($event) })"
            >
              <Waypoints />
              {{ flow.loop ? 'Repeats' : 'Runs once' }}
            </Toggle>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="drop(flow.id)"
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
