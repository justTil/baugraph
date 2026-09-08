<script setup lang="ts">
import { computed } from 'vue'
import { Pause, Play, Plus, Waypoints, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * Which flows run over *this* connection — membership, and nothing else.
 *
 * How a flow looks, here or anywhere, is edited in the flow editor: two places
 * offering the same colour picker is how a sidebar stops being a sidebar. So
 * this says what the connection is part of, adds it to a flow or takes it out,
 * and hands everything else over — landing the editor on this connection, since
 * that is what was being looked at.
 */

const props = defineProps<{ edgeId: string }>()

const { flows, commit, endCoalesce, addFlow, updateFlow, toggleFlowEdge, flowsOnEdge } = useDiagram()

const { paused, highlighted, planOf, openFlowEditor } = useFlows()

const on = computed(() => flowsOnEdge(props.edgeId))
const off = computed(() => flows.value.filter((flow) => !flow.edges.includes(props.edgeId)))

/** Flows switched off anywhere in the diagram — what "Resume all" would turn back on. */
const stopped = computed(() => flows.value.filter((flow) => !flow.enabled))

/** The colour this connection actually draws in — the override, or the flow's. */
const colourOf = (flow: MessageFlow) =>
  COLOR_HEX[flow.style?.[props.edgeId]?.color ?? flow.color]

/** Whether this connection is drawn its own way rather than like the rest. */
const tweaked = (flow: MessageFlow) => Object.keys(flow.style?.[props.edgeId] ?? {}).length > 0

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

function resume(flow: MessageFlow) {
  act(() => updateFlow(flow.id, { enabled: true }))
}

function resumeAll() {
  act(() => stopped.value.forEach((flow) => updateFlow(flow.id, { enabled: true })))
}

function hover(flow: MessageFlow | null) {
  highlighted.value = flow
    ? { id: flow.id, color: flow.color, edges: planOf(flow).edges }
    : null
}
</script>

<template>
  <section class="border-b">
    <!--
      Given its own header rather than another label in the stack: flows are the
      one thing here that belongs to the diagram rather than to the connection,
      so the panel should read as changing subject at this point.
    -->
    <header class="bg-muted/50 flex items-center gap-1.5 border-b px-3 py-2">
      <Waypoints class="text-muted-foreground size-3.5 shrink-0" />
      <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
        Message flows
      </span>
      <span class="text-muted-foreground/70 ml-auto text-[10px]">on this connection</span>
    </header>

    <!--
      A global pause is easy to set and then forget, so it says so here too — the
      panel for the connection that has visibly stopped moving — with the way out
      right next to it.
    -->
    <div
      v-if="paused && on.length"
      class="bg-muted/60 flex items-center gap-1.5 border-b px-3 py-2"
    >
      <Pause class="text-muted-foreground size-3.5 shrink-0" />
      <span class="text-muted-foreground flex-1 text-[11px] leading-snug">
        All message flows are paused.
      </span>
      <Button
        variant="outline"
        size="sm"
        class="-my-1 h-6 shrink-0 px-2 text-xs"
        @click="paused = false"
      >
        <Play />
        Resume
      </Button>
    </div>

    <div class="space-y-2 p-3">
      <div
        v-for="flow in on"
        :key="flow.id"
        class="hover:bg-accent/60 flex items-center gap-1.5 rounded-md px-1.5 py-1"
        @mouseenter="hover(flow)"
        @mouseleave="hover(null)"
      >
        <span
          class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
          :class="{ 'opacity-40': !flow.enabled }"
          :style="{ background: colourOf(flow) }"
        />
        <span
          class="min-w-0 flex-1 truncate text-xs font-medium"
          :class="{ 'text-muted-foreground': !flow.enabled }"
        >
          {{ flow.label || flow.id }}
          <span v-if="tweaked(flow)" class="text-muted-foreground font-normal">· own look</span>
        </span>
        <span
          v-if="!flow.enabled"
          class="text-muted-foreground bg-muted shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
        >
          Paused
        </span>
        <Button
          v-if="!flow.enabled"
          variant="ghost"
          size="icon"
          class="text-muted-foreground -my-1 size-6 shrink-0"
          title="Switch this flow back on"
          @click="resume(flow)"
        >
          <Play />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground -my-1 h-6 shrink-0 px-2 text-xs"
          title="Edit this flow, and how it looks on this connection"
          @click="openFlowEditor(flow.id, props.edgeId)"
        >
          Edit
        </Button>
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

      <Button
        v-if="!on.length"
        variant="outline"
        size="sm"
        class="w-full justify-start"
        @click="act(() => addFlow([props.edgeId]))"
      >
        <Waypoints />
        Create new message flow
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

      <!--
        Switches every stopped flow back on, not just the ones on this connection:
        a flow left off is off everywhere, and this is the one button that undoes a
        round of pausing without hunting each one down.
      -->
      <Button
        v-if="stopped.length"
        variant="ghost"
        size="sm"
        class="text-muted-foreground w-full justify-start"
        :title="`Switch all ${stopped.length} stopped flows back on`"
        @click="resumeAll"
      >
        <Play />
        Resume all flows ({{ stopped.length }})
      </Button>
    </div>
  </section>
</template>
