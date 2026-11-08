<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import {
  MousePointerClick,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Waypoints,
  X,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { describeFlow } from '@/features/diagram/lib/flow-graph'
import FlowLook from '@/features/diagram/components/FlowLook.vue'
import FlowSequence from '@/features/diagram/components/FlowSequence.vue'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * The message-flow editor, docked under the canvas.
 *
 * Docked rather than a dialog so the diagram stays in sight while a flow is
 * worked on: the messages keep moving on the canvas above, hovering a row
 * lights its connection up there, and connections can be selected on the
 * canvas and added to a flow without closing anything.
 *
 * Three columns, read left to right: which flow, what it does in which order,
 * and how it looks. The middle one is the point — the flow as a sequence
 * diagram, which is both the clearest picture of how a message travels and
 * the place its order is changed.
 */

const {
  nodes,
  flows,
  selectedEdges,
  commit,
  endCoalesce,
  addFlow,
  updateFlow,
  removeFlow,
  toggleFlowEdge,
  setFlowSteps,
} = useDiagram()

const { paused, reduced, highlighted, editorOpen, editing, editingEdge, planOf, stepsOf } =
  useFlows()

const current = computed(() => flows.value.find((flow) => flow.id === editing.value) ?? null)
const steps = computed(() => (current.value ? stepsOf(current.value) : []))
const plan = computed(() => (current.value ? planOf(current.value) : null))

const labelOf = (id: string) => nodes.value.find((n) => n.id === id)?.data?.label || id

// Opening on nothing — from the toolbar, with no flow named — should still land
// on something to edit, and a deleted flow must not leave the panel blank.
watch(
  [editorOpen, flows],
  () => {
    if (!editorOpen.value) return
    if (!current.value) editing.value = flows.value[0]?.id ?? null
  },
  { immediate: true },
)

// The connection picked out belongs to the flow it was picked in.
watch(editing, () => {
  if (editingEdge.value && !current.value?.edges.includes(editingEdge.value)) {
    editingEdge.value = null
  }
})

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

/* -------------------------------------------------------------- the list */

/** A flow can only be made where there is something for a message to travel. */
const selection = computed(() => selectedEdges.value.map((e) => e.id))

function create() {
  if (!selection.value.length) return
  act(() => {
    const flow = addFlow(selection.value)
    if (flow) editing.value = flow.id
  })
}

/** Flows switched off, and the one action that turns every one of them back on. */
const stopped = computed(() => flows.value.filter((flow) => !flow.enabled))

function resumeAll() {
  act(() => stopped.value.forEach((flow) => updateFlow(flow.id, { enabled: true })))
}

function toggle(flow: MessageFlow) {
  act(() => updateFlow(flow.id, { enabled: !flow.enabled }))
}

function hoverFlow(flow: MessageFlow | null) {
  highlighted.value = flow ? { id: flow.id, color: flow.color, edges: planOf(flow).edges } : null
}

/** The short version, for the list: how many steps over how many connections. */
const summaryOf = (flow: MessageFlow) => {
  const count = stepsOf(flow).length
  const hops = flow.edges.length
  return [
    `${count} step${count === 1 ? '' : 's'}`,
    `${hops} connection${hops === 1 ? '' : 's'}`,
    ...(flow.stream ? ['constant'] : []),
  ].join(' · ')
}

/** The long version, for the flow's own header. */
const detailOf = (flow: MessageFlow) => describeFlow(planOf(flow))

/* ------------------------------------------------------------ this flow */

function rename(value: string) {
  const flow = current.value
  if (!flow) return
  commit(`flow:${flow.id}:label`)
  updateFlow(flow.id, { label: value })
}

function drop() {
  const flow = current.value
  if (!flow) return
  act(() => {
    if (highlighted.value?.id === flow.id) highlighted.value = null
    editingEdge.value = null
    removeFlow(flow.id)
  })
}

/** Selected connections this flow does not travel yet — what "Add" would bring in. */
const addable = computed(() => {
  const flow = current.value
  if (!flow) return []
  return selection.value.filter((id) => !flow.edges.includes(id))
})

function addSelected() {
  const flow = current.value
  if (!flow || !addable.value.length) return
  act(() => addable.value.forEach((id) => toggleFlowEdge(flow.id, id)))
}

/* ---------------------------------------------------------------- order */

type Order = 'broadcast' | 'sequence' | 'custom'

const order = computed<Order>(() =>
  current.value?.steps?.length ? 'custom' : (current.value?.mode ?? 'broadcast'),
)

const start = computed(() => (plan.value?.from ? labelOf(plan.value.from) : null))

/**
 * The automatic orders are presets; "Custom" is what any rearranging becomes.
 * Choosing Custom by hand starts from the order on screen, so nothing moves
 * until something is moved.
 */
function setOrder(next: string) {
  const flow = current.value
  if (!flow || next === order.value) return
  act(() => {
    if (next === 'custom') setFlowSteps(flow.id, steps.value)
    else updateFlow(flow.id, { mode: next as MessageFlow['mode'], steps: undefined })
  })
}

function reorder(next: string[][]) {
  const flow = current.value
  if (!flow) return
  act(() => setFlowSteps(flow.id, next))
}

function removeHop(edge: string) {
  const flow = current.value
  if (!flow) return
  if (editingEdge.value === edge) editingEdge.value = null
  act(() => toggleFlowEdge(flow.id, edge))
}

/** Pointing at a row lights up just that connection on the canvas. */
function hoverHop(edge: string | null) {
  const flow = current.value
  if (!flow || !edge) {
    highlighted.value = null
    return
  }
  const colour = flow.style?.[edge]?.color ?? flow.color
  highlighted.value = { id: flow.id, color: colour, edges: new Set([edge]) }
}

/* ---------------------------------------------------------------- sizing */

/**
 * Below this width the three columns would leave the sequence — the part that
 * matters — too narrow to read, so "Look & timing" slides over it on demand
 * instead of taking a column of its own.
 */
const COMPACT_BELOW = 980

const panel = ref<HTMLElement | null>(null)
const width = ref(Infinity)
useResizeObserver(panel, (entries) => {
  width.value = entries[0]?.contentRect.width ?? Infinity
})
const compact = computed(() => width.value < COMPACT_BELOW)

/** Whether the slide-over is showing, while compact. */
const lookOpen = ref(false)

// Picking a row out is asking to style that connection, so the settings come to it.
watch(editingEdge, (edge) => {
  if (edge && compact.value) lookOpen.value = true
})

/**
 * How tall the panel is: a preference about the screen rather than the
 * diagram, so it is one value for every document and survives a reload.
 */
const HEIGHT_KEY = 'baugraph:flow-editor-height'
const MIN_HEIGHT = 240

function readHeight(): number {
  try {
    const stored = Number(localStorage.getItem(HEIGHT_KEY))
    return Number.isFinite(stored) && stored >= MIN_HEIGHT ? stored : 340
  } catch {
    return 340
  }
}

const height = ref(readHeight())
const maxHeight = () => Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.75))

let grab: { y: number; height: number } | null = null

function startResize(event: PointerEvent) {
  grab = { y: event.clientY, height: height.value }
  window.addEventListener('pointermove', onResize)
  window.addEventListener('pointerup', stopResize)
  event.preventDefault()
}

function onResize(event: PointerEvent) {
  if (!grab) return
  height.value = Math.round(
    Math.min(maxHeight(), Math.max(MIN_HEIGHT, grab.height + grab.y - event.clientY)),
  )
}

function stopResize() {
  grab = null
  window.removeEventListener('pointermove', onResize)
  window.removeEventListener('pointerup', stopResize)
  try {
    localStorage.setItem(HEIGHT_KEY, String(height.value))
  } catch {
    // Storage refused: the height just won't survive a reload.
  }
}

onBeforeUnmount(() => {
  stopResize()
  highlighted.value = null
})
</script>

<template>
  <section
    ref="panel"
    class="bg-background relative flex shrink-0 flex-col border-t"
    :style="{ height: `${height}px` }"
    aria-label="Message flows"
  >
    <!-- The top edge is the handle: drag it to give the panel more or less room. -->
    <div
      class="hover:bg-ring/40 absolute inset-x-0 -top-1 z-20 h-2 cursor-row-resize transition-colors"
      title="Drag to resize"
      @pointerdown="startResize"
    />

    <div class="flex min-h-0 flex-1">
      <!-- ---------------------------------------------------------- flows -->
      <aside
        class="bg-sidebar flex shrink-0 flex-col border-r"
        :class="compact ? 'w-48' : 'w-56'"
      >
        <header class="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
          <Waypoints class="text-muted-foreground size-3.5 shrink-0" />
          <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
            Message flows
          </span>
          <span v-if="flows.length" class="text-muted-foreground/70 ml-auto text-[10px]">
            {{ flows.length }}
          </span>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <ul class="space-y-0.5">
            <li v-for="flow in flows" :key="flow.id">
              <div
                class="hover:bg-accent/60 flex items-center gap-2 rounded-md px-2 py-1.5"
                :class="{ 'bg-accent': editing === flow.id }"
                @mouseenter="hoverFlow(flow)"
                @mouseleave="hoverFlow(null)"
              >
                <button type="button" class="min-w-0 flex-1 text-left" @click="editing = flow.id">
                  <span class="flex items-center gap-1.5">
                    <span
                      class="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
                      :style="{ background: COLOR_HEX[flow.color], opacity: flow.enabled ? 1 : 0.35 }"
                    />
                    <span
                      class="truncate text-xs font-medium"
                      :class="{ 'text-muted-foreground': !flow.enabled }"
                    >
                      {{ flow.label || flow.id }}
                    </span>
                  </span>
                  <span
                    class="text-muted-foreground mt-0.5 block truncate text-[10px]"
                    :title="detailOf(flow)"
                  >
                    {{ flow.enabled ? summaryOf(flow) : 'Paused — press ▶ to run' }}
                  </span>
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6 shrink-0"
                  :class="{ 'text-foreground': !flow.enabled }"
                  :title="flow.enabled ? 'Pause this flow' : 'Run this flow'"
                  @click="toggle(flow)"
                >
                  <component :is="flow.enabled ? Pause : Play" />
                </Button>
              </div>
            </li>
          </ul>
        </div>

        <div class="space-y-1 border-t p-2">
          <Button
            variant="outline"
            size="sm"
            class="w-full justify-start"
            :disabled="!selection.length"
            :title="
              selection.length
                ? `A new flow over the ${selection.length} selected connection${selection.length === 1 ? '' : 's'}`
                : 'Select the connections a message travels on the canvas first'
            "
            @click="create"
          >
            <Plus />
            <span class="truncate">
              {{
                selection.length
                  ? `New flow from ${selection.length} selected`
                  : 'New flow from selection'
              }}
            </span>
          </Button>

          <div v-if="flows.length" class="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground flex-1 justify-start px-2"
              :title="paused ? 'Resume every flow' : 'Freeze every flow where it is'"
              @click="paused = !paused"
            >
              <component :is="paused ? Play : Pause" />
              {{ paused ? 'Play all' : 'Pause all' }}
            </Button>
            <!--
              Distinct from Play all: that lifts the global freeze, this switches
              flows that were individually paused back on.
            -->
            <Button
              v-if="stopped.length"
              variant="ghost"
              size="sm"
              class="text-muted-foreground flex-1 justify-start px-2"
              :title="`Run all ${stopped.length} paused flow${stopped.length === 1 ? '' : 's'} again`"
              @click="resumeAll"
            >
              <Play />
              Run all ({{ stopped.length }})
            </Button>
          </div>
        </div>
      </aside>

      <!-- ------------------------------------------------- no flows yet -->
      <div
        v-if="!current"
        class="relative flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-6"
      >
        <div class="max-w-md space-y-3 text-sm">
          <p class="font-medium">Show a message moving through the diagram</p>
          <ol class="text-muted-foreground list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>
              Select the connections the message travels on the canvas — hold
              <kbd class="rounded border px-1 font-sans text-[11px]">Shift</kbd> to pick several.
            </li>
            <li>Press <em>New flow from selection</em> on the left.</li>
            <li>Put the steps in the order you want: drag them, or use the arrows.</li>
          </ol>
          <p class="text-muted-foreground text-xs leading-relaxed">
            Or right-click a node and choose <em>Animate message from here</em> to take everything
            downstream of it in one go.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground absolute top-1.5 right-1.5 size-7"
          title="Close the flow editor"
          @click="editorOpen = false"
        >
          <X />
        </Button>
      </div>

      <template v-else>
        <!-- ------------------------------------------- the flow, in order -->
        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <span
              class="size-3 shrink-0 rounded-full border border-black/20 dark:border-white/20"
              :style="{ background: COLOR_HEX[current.color] }"
            />
            <Input
              :model-value="current.label"
              placeholder="Name this flow"
              aria-label="Flow name"
              class="hover:border-input focus-visible:border-input h-7 max-w-64 min-w-24 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none dark:bg-transparent"
              @update:model-value="rename(String($event))"
              @blur="endCoalesce()"
            />
            <span class="text-muted-foreground hidden min-w-0 truncate text-[11px] lg:inline">
              {{ detailOf(current) }}
            </span>

            <div class="ml-auto flex shrink-0 items-center gap-1">
              <Button
                v-if="addable.length"
                variant="outline"
                size="sm"
                class="h-7"
                :title="`Add the ${addable.length} connection${addable.length === 1 ? '' : 's'} selected on the canvas, as the last step${addable.length === 1 ? '' : 's'}`"
                @click="addSelected"
              >
                <Plus />
                Add {{ addable.length }} selected
              </Button>
              <Button
                :variant="current.enabled ? 'ghost' : 'default'"
                size="sm"
                class="h-7"
                :title="current.enabled ? 'Pause this flow' : 'Run this flow'"
                @click="toggle(current)"
              >
                <component :is="current.enabled ? Pause : Play" />
                {{ current.enabled ? 'Pause' : 'Run' }}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground size-7"
                title="Delete this flow"
                @click="drop"
              >
                <Trash2 />
              </Button>
              <template v-if="compact">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7"
                  :class="{ 'bg-accent': lookOpen }"
                  :aria-pressed="lookOpen"
                  title="Colour, message shape, speed and timing"
                  @click="lookOpen = !lookOpen"
                >
                  <Palette />
                  Look
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-muted-foreground size-7"
                  title="Close the flow editor"
                  @click="editorOpen = false"
                >
                  <X />
                </Button>
              </template>
            </div>
          </header>

          <!--
            The order, first: the automatic ones are presets, and Custom is what
            any rearranging below turns into.
          -->
          <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2">
            <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
              Order
            </span>
            <div class="w-64 shrink-0">
              <SegmentedField
                :model-value="order"
                :options="[
                  {
                    value: 'broadcast',
                    label: 'Fan out',
                    title: 'Automatic: follow the arrows, copying the message onto every connection where a node feeds several',
                  },
                  {
                    value: 'sequence',
                    label: 'One by one',
                    title: 'Automatic: follow the arrows, one message taking the connections in turn',
                  },
                  {
                    value: 'custom',
                    label: 'Custom',
                    title: 'Your own order: drag the steps below',
                  },
                ]"
                @update:model-value="setOrder"
              />
            </div>
            <p class="text-muted-foreground line-clamp-2 min-w-0 flex-1 basis-40 text-[11px] leading-snug">
              <template v-if="order === 'custom'">
                Your order: each step leaves once the one before it has arrived.
              </template>
              <template v-else-if="order === 'broadcast'">
                Follows the arrows<template v-if="start"> from <em>{{ start }}</em></template>, copying the
                message wherever a node feeds several connections.
              </template>
              <template v-else>
                Follows the arrows<template v-if="start"> from <em>{{ start }}</em></template>, one message
                taking the connections in turn.
              </template>
            </p>
            <Button
              v-if="order === 'custom'"
              variant="ghost"
              size="sm"
              class="text-muted-foreground h-7 shrink-0"
              title="Forget the custom order and follow the arrows again"
              @click="setOrder(current.mode)"
            >
              <RotateCcw />
              Automatic again
            </Button>
          </div>

          <!-- Why nothing is moving, when nothing is — with the way out beside it. -->
          <div
            v-if="!current.enabled"
            class="bg-muted/60 flex shrink-0 items-center gap-2 border-b px-3 py-1.5"
          >
            <Pause class="text-muted-foreground size-3.5 shrink-0" />
            <span class="text-muted-foreground flex-1 text-[11px] leading-snug">
              This flow is paused, so its connections show a <em>Flow paused</em> tag on the
              canvas. Run it to start the messages again and remove the tag.
            </span>
            <Button size="sm" class="h-6 px-2 text-xs" @click="toggle(current)">
              <Play />
              Run
            </Button>
          </div>
          <div
            v-else-if="paused"
            class="bg-muted/60 flex shrink-0 items-center gap-2 border-b px-3 py-1.5"
          >
            <Pause class="text-muted-foreground size-3.5 shrink-0" />
            <span class="text-muted-foreground flex-1 text-[11px] leading-snug">
              All message flows are frozen where they are.
            </span>
            <Button variant="outline" size="sm" class="h-6 px-2 text-xs" @click="paused = false">
              <Play />
              Play all
            </Button>
          </div>
          <p
            v-else-if="reduced"
            class="text-muted-foreground bg-muted/60 shrink-0 border-b px-3 py-1.5 text-[11px]"
          >
            Your system asks for reduced motion, so messages are shown parked rather than moving.
          </p>

          <FlowSequence
            :flow="current"
            :steps="steps"
            :selected="editingEdge"
            @reorder="reorder"
            @select="editingEdge = $event"
            @remove="removeHop"
            @hover="hoverHop"
          />

          <footer
            class="text-muted-foreground flex shrink-0 items-center gap-1.5 border-t px-3 py-1.5 text-[11px]"
          >
            <MousePointerClick class="size-3.5 shrink-0" />
            <span class="truncate">
              Drag a row by its grip to reorder — between steps for a step of its own, onto a step to
              send at the same time. Click a row to style that connection.
            </span>
          </footer>
        </div>

        <!-- ------------------------------------------------- how it looks -->
        <aside
          v-if="!compact || lookOpen"
          class="bg-sidebar flex w-72 shrink-0 flex-col border-l"
          :class="{ 'absolute inset-y-0 right-0 z-30 shadow-xl': compact }"
        >
          <header class="flex h-10 shrink-0 items-center border-b pr-1.5 pl-3">
            <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
              Look &amp; timing
            </span>
            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground ml-auto size-7"
              :title="compact ? 'Hide look & timing' : 'Close the flow editor'"
              @click="compact ? (lookOpen = false) : (editorOpen = false)"
            >
              <X />
            </Button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <FlowLook :flow="current" :edge="editingEdge" @close-edge="editingEdge = null" />
          </div>
        </aside>
      </template>
    </div>
  </section>
</template>
