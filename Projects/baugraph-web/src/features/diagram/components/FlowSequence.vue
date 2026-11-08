<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { ArrowDown, ArrowUp, GripVertical, Link2, Unlink2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { MessageFlow } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { edgeStyle, tokenAt } from '@/features/diagram/lib/flow-graph'
import type { StepTarget } from '@/features/diagram/lib/flow-steps'
import {
  canMoveEarlier,
  canMoveLater,
  moveEarlier,
  moveLater,
  moveToStep,
  sameSteps,
  splitStep,
} from '@/features/diagram/lib/flow-steps'
import { COLOR_HEX } from '@/features/diagram/lib/theme'

/**
 * A flow drawn as a sequence diagram, and edited as one.
 *
 * Every node the flow touches is a column with a lifeline down it; every
 * connection is a row with an arrow from the node it leaves to the node it
 * reaches. Rows are grouped into numbered steps, top to bottom, which is the
 * order the message travels in — so the order *is* the picture, and changing
 * it is moving a row. Drag a row by its grip between two steps to give it a
 * step of its own, or onto a step to send it at the same time; the arrows
 * beside each row do the same one place at a time.
 *
 * The messages travel the arrows on the canvas's own clock: this reads where
 * the runtime has got to every frame instead of keeping time itself, so a row
 * lights up exactly while its connection on the canvas is carrying something.
 * As in the runtime, the markers are written straight to the DOM.
 */

const props = defineProps<{
  flow: MessageFlow
  /** The order to draw: the flow's own, or the one read off the graph. */
  steps: string[][]
  /** The connection picked out for editing, if any. */
  selected: string | null
}>()

const emit = defineEmits<{
  (e: 'reorder', steps: string[][]): void
  (e: 'select', edge: string | null): void
  (e: 'remove', edge: string): void
  (e: 'hover', edge: string | null): void
}>()

const { nodes, edges } = useDiagram()
const { liveOf, planOf, reduced } = useFlows()

/* ------------------------------------------------------------------ layout */

/** Width of the step-number column. */
const GUTTER = 44
/** Width of the drag grip at the start of every row. */
const GRIP = 22
/** Width of the row actions at the end. */
const ACTIONS = 108
/** Height of one connection's row. */
const ROW = 38
/** Height of the column headings. */
const HEAD = 40
const MIN_COLUMN = 100
const MAX_COLUMN = 200

const host = ref<HTMLElement | null>(null)
const hostWidth = ref(0)
useResizeObserver(host, (entries) => {
  hostWidth.value = entries[0]?.contentRect.width ?? 0
})

const labelOf = (id: string) => nodes.value.find((n) => n.id === id)?.data?.label || id

const edgeById = computed(() => new Map(edges.value.map((e) => [e.id, e])))

/**
 * The nodes the flow touches, in the order the story meets them: each row's
 * sender, then its receiver. The column a message starts in is therefore
 * always the first, and a reply reads right to left.
 */
const participants = computed(() => {
  const order: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    order.push(id)
  }
  for (const step of props.steps) {
    for (const id of step) {
      const edge = edgeById.value.get(id)
      if (!edge) continue
      add(edge.source)
      add(edge.target)
    }
  }
  return order.map((id) => ({ id, label: labelOf(id) }))
})

/** Columns share whatever room there is, within reason; past that the view scrolls. */
const column = computed(() => {
  const count = Math.max(1, participants.value.length)
  const room = hostWidth.value - GUTTER - GRIP - ACTIONS - 8
  return Math.round(Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, room / count)))
})

const lanesWidth = computed(() => column.value * Math.max(1, participants.value.length))
const contentWidth = computed(() => GUTTER + GRIP + lanesWidth.value + ACTIONS)

const columnIndex = computed(
  () => new Map(participants.value.map((p, index) => [p.id, index])),
)
const laneX = (node: string) => ((columnIndex.value.get(node) ?? 0) + 0.5) * column.value

interface Row {
  id: string
  step: number
  from: string
  to: string
  label: string
  x1: number
  x2: number
  colour: string
  /** Drawn its own way on this connection. */
  own: boolean
}

const rows = computed<Row[][]>(() =>
  props.steps.map((step, index) =>
    step.flatMap((id) => {
      const edge = edgeById.value.get(id)
      if (!edge) return []
      const look = edgeStyle(props.flow, id)
      return [
        {
          id,
          step: index,
          from: labelOf(edge.source),
          to: labelOf(edge.target),
          label: (edge.data as { label?: string } | undefined)?.label?.trim() ?? '',
          x1: laneX(edge.source),
          x2: laneX(edge.target),
          colour: COLOR_HEX[look.color],
          own: Object.keys(props.flow.style?.[id] ?? {}).length > 0,
        },
      ]
    }),
  ),
)

const colour = computed(() => COLOR_HEX[props.flow.color])

/** The arrow a row draws, from sender to receiver, stopping short of the lifeline. */
function arrowOf(row: Row) {
  const y = ROW / 2 + 4
  if (row.x1 === row.x2) {
    // A connection back into the node it left: a small loop out to the right.
    const x = row.x1
    return {
      line: `M${x + 3},${y - 6} H${x + 22} V${y + 4} H${x + 9}`,
      head: `M${x + 9},${y + 0.5} L${x + 3},${y + 4} L${x + 9},${y + 7.5} Z`,
      y,
    }
  }
  const dir = row.x2 > row.x1 ? 1 : -1
  const tip = row.x2 - dir * 2
  return {
    line: `M${row.x1 + dir * 4},${y} H${tip - dir * 7}`,
    head: `M${tip},${y} L${tip - dir * 8},${y - 4} L${tip - dir * 8},${y + 4} Z`,
    y,
  }
}

/** Where along a row's arrow a message `progress` of the way across sits. */
function pointOn(row: Row, progress: number): { x: number; y: number } {
  const y = ROW / 2 + 4
  if (row.x1 === row.x2) {
    // Out along the top of the loop and back along the bottom.
    const x = row.x1 + 3 + 19 * (progress < 0.5 ? progress * 2 : (1 - progress) * 2)
    return { x, y: progress < 0.5 ? y - 6 : y + 4 }
  }
  const from = row.x1 + Math.sign(row.x2 - row.x1) * 4
  const to = row.x2 - Math.sign(row.x2 - row.x1) * 10
  return { x: from + (to - from) * progress, y }
}

/* ------------------------------------------------------------- live tokens */

/**
 * One marker per message that can be on a row at once: every route through
 * the connection, times the messages per route. Worked out from the plan, so
 * the elements exist before the first frame asks for them.
 */
const plan = computed(() => planOf(props.flow))

interface Slot {
  key: string
  branch: number
  token: number
}

const slots = computed(() => {
  const out = new Map<string, Slot[]>()
  plan.value.branches.forEach((branch, b) => {
    for (const hop of branch.hops) {
      const list = out.get(hop.edge) ?? []
      for (let token = 0; token < plan.value.tokens; token++) {
        list.push({ key: `${b}|${token}|${hop.edge}`, branch: b, token })
      }
      out.set(hop.edge, list)
    }
  })
  return out
})

const tokenEls = new Map<string, SVGGElement>()
const rowEls = new Map<string, HTMLElement>()
const badgeEls = new Map<number, HTMLElement>()

type TemplateRef = Element | ComponentPublicInstance | null
const binders = new Map<string, (el: TemplateRef) => void>()

/**
 * A stable ref callback per key, so Vue does not re-bind an element that never
 * moved. Only ever *sets*: a row dragged into an earlier step is mounted there
 * before its old copy is unmounted, and a delete on the way out would throw
 * the new element away. Elements that left the page are skipped by {@link live}.
 */
function bind<T extends Element, K>(registry: Map<K, T>, key: K, tag: string) {
  const id = `${tag}:${String(key)}`
  let fn = binders.get(id)
  if (!fn) {
    fn = (el: TemplateRef) => {
      if (el) registry.set(key, el as T)
    }
    binders.set(id, fn)
  }
  return fn
}

/** The element registered under `key`, if it is still on the page. */
function live<T extends Element, K>(registry: Map<K, T>, key: K): T | undefined {
  const el = registry.get(key)
  if (el && !el.isConnected) {
    registry.delete(key)
    return undefined
  }
  return el
}

const rowById = computed(() => new Map(rows.value.flat().map((row) => [row.id, row])))

function setLive(el: HTMLElement | undefined, live: boolean) {
  if (!el) return
  const value = live ? 'true' : 'false'
  if (el.dataset.live !== value) el.dataset.live = value
}

/**
 * Puts every marker where the canvas has its message right now, and lights the
 * rows (and steps) that are carrying one.
 */
function paint() {
  const now = reduced.value ? null : liveOf(props.flow.id)
  const carrying = new Set<string>()

  for (const [edge, list] of slots.value) {
    const row = rowById.value.get(edge)
    list.forEach((slot, index) => {
      const el = live(tokenEls, slot.key)
      if (!el || !row) return
      let progress: number | null = null
      let opacity = 1
      if (now) {
        const branch = now.plan.branches[slot.branch]
        const at = branch ? tokenAt(branch, now.time + slot.token * now.plan.offset) : null
        if (at && at.edge === edge) {
          progress = at.progress
          opacity = at.opacity
        }
      } else if (reduced.value && index === 0 && props.flow.enabled) {
        // Nothing moves under reduced motion; one message parked mid-way still
        // says which way the row carries.
        progress = 0.5
      }
      if (progress === null) {
        if (el.style.display !== 'none') el.style.display = 'none'
        return
      }
      const { x, y } = pointOn(row, progress)
      el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`)
      el.style.opacity = opacity.toFixed(3)
      if (el.style.display === 'none') el.style.display = ''
      if (now && opacity > 0.05) carrying.add(edge)
    })
  }

  for (const edge of [...rowEls.keys()]) setLive(live(rowEls, edge), carrying.has(edge))
  props.steps.forEach((step, index) =>
    setLive(live(badgeEls, index), step.some((edge) => carrying.has(edge))),
  )
}

let frame = 0
function loop() {
  paint()
  frame = requestAnimationFrame(loop)
}

onMounted(() => {
  frame = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  binders.clear()
})

// A marker created mid-pass would sit at the origin until the next frame.
watch(slots, () => requestAnimationFrame(paint), { flush: 'post' })

/* ----------------------------------------------------------------- editing */

function apply(next: string[][]) {
  if (!sameSteps(next, props.steps)) emit('reorder', next)
}

const earlier = (edge: string) => apply(moveEarlier(props.steps, edge))
const later = (edge: string) => apply(moveLater(props.steps, edge))
const withPrevious = (edge: string, step: number) =>
  apply(moveToStep(props.steps, edge, { join: step - 1 }))
const split = (step: number) => apply(splitStep(props.steps, step))

/* ------------------------------------------------------------ drag and drop */

/** Ours alone, so the canvas's own drop handling never mistakes a row for a palette item. */
const DRAG_TYPE = 'application/x-baugraph-flow-step'

const dragging = ref<string | null>(null)
const target = ref<StepTarget | null>(null)

function onDragStart(event: DragEvent, edge: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(DRAG_TYPE, edge)
  const row = live(rowEls, edge)
  if (row) event.dataTransfer.setDragImage(row, GRIP / 2, ROW / 2)
  // Opening up the drop gaps reshapes the list under the pointer, which
  // Chromium answers by cancelling the drag if it happens inside dragstart.
  setTimeout(() => {
    dragging.value = edge
  })
}

function onDragEnd() {
  dragging.value = null
  target.value = null
}

function over(event: DragEvent, next: StepTarget) {
  if (!dragging.value || !event.dataTransfer?.types.includes(DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const current = target.value
  if (
    !current ||
    ('join' in current) !== ('join' in next) ||
    ('join' in current ? current.join !== (next as { join: number }).join : current.gap !== (next as { gap: number }).gap)
  ) {
    target.value = next
  }
}

function drop(event: DragEvent) {
  const edge = dragging.value
  const at = target.value
  onDragEnd()
  if (!edge || !at) return
  event.preventDefault()
  apply(moveToStep(props.steps, edge, at))
}

/** Leaving the list altogether drops the highlight, so nothing looks armed. */
function onLeave(event: DragEvent) {
  const next = event.relatedTarget as Node | null
  if (next && host.value?.contains(next)) return
  target.value = null
}

const isJoinTarget = (step: number) =>
  !!target.value && 'join' in target.value && target.value.join === step
const isGapTarget = (gap: number) =>
  !!target.value && 'gap' in target.value && target.value.gap === gap

/** A short description of a row for screen readers and the hover title. */
const describe = (row: Row) =>
  `Step ${row.step + 1}: ${row.from} → ${row.to}${row.label ? ` (${row.label})` : ''}`
</script>

<template>
  <div
    ref="host"
    class="relative min-h-0 flex-1 overflow-auto"
    @dragleave="onLeave"
    @drop="drop"
  >
    <div
      class="relative pb-3"
      :style="{ width: `${contentWidth}px`, minHeight: '100%', '--flow': colour }"
    >
      <!-- Lifelines: one down from each node, under everything else. -->
      <div
        v-for="(node, index) in participants"
        :key="`life-${node.id}`"
        class="border-border pointer-events-none absolute bottom-0 border-l border-dashed"
        :style="{ left: `${GUTTER + GRIP + (index + 0.5) * column}px`, top: `${HEAD}px` }"
      />

      <!-- The nodes, as column headings that stay put while the rows scroll. -->
      <div
        class="bg-background/95 sticky top-0 z-10 flex items-center border-b backdrop-blur-sm"
        :style="{ height: `${HEAD}px` }"
      >
        <div
          class="text-muted-foreground shrink-0 text-center text-[10px] font-semibold tracking-wide uppercase"
          :style="{ width: `${GUTTER}px` }"
        >
          Step
        </div>
        <div class="shrink-0" :style="{ width: `${GRIP}px` }" />
        <div
          v-for="node in participants"
          :key="node.id"
          class="flex shrink-0 justify-center px-1.5"
          :style="{ width: `${column}px` }"
        >
          <span
            class="bg-card max-w-full truncate rounded-md border px-2 py-1 text-[11px] font-medium shadow-xs"
            :title="node.label"
          >
            {{ node.label }}
          </span>
        </div>
      </div>

      <!-- The drop gap in front of the first step only exists while dragging. -->
      <div
        v-if="dragging"
        class="bg-seq-gap is-open"
        :class="{ 'is-target': isGapTarget(0) }"
        :style="{ marginLeft: `${GUTTER}px` }"
        @dragover="over($event, { gap: 0 })"
      >
        <span>Own step, first</span>
      </div>

      <template v-for="(step, index) in rows" :key="step.map((r) => r.id).join('|')">
        <!-- Between two steps: "then". While dragging, a place to drop a step of its own. -->
        <div
          v-if="index > 0"
          class="bg-seq-gap"
          :class="{ 'is-open': dragging, 'is-target': isGapTarget(index) }"
          :style="{ marginLeft: `${GUTTER}px` }"
          @dragover="over($event, { gap: index })"
        >
          <span v-if="dragging">Own step here</span>
        </div>

        <div
          class="bg-seq-step relative flex"
          :class="{ 'is-target': isJoinTarget(index), 'is-group': step.length > 1 }"
          @dragover="over($event, { join: index })"
        >
          <!-- The step's number, and what holds a step of several together. -->
          <div
            class="relative flex shrink-0 flex-col items-center pt-[9px]"
            :style="{ width: `${GUTTER}px` }"
          >
            <span
              :ref="bind(badgeEls, index, 'badge')"
              class="bg-seq-badge"
              :title="
                step.length > 1
                  ? `Step ${index + 1}: these ${step.length} connections travel at the same time`
                  : `Step ${index + 1}`
              "
            >
              {{ index + 1 }}
            </span>
            <template v-if="step.length > 1">
              <span class="bg-seq-bracket" aria-hidden="true" />
              <Button
                variant="ghost"
                size="icon"
                class="text-muted-foreground relative z-[1] mt-auto mb-1 size-6"
                :title="`Send these ${step.length} one after another instead`"
                @click="split(index)"
              >
                <Unlink2 />
              </Button>
            </template>
          </div>

          <div class="min-w-0 flex-1">
            <div
              v-for="row in step"
              :key="row.id"
              :ref="bind(rowEls, row.id, 'row')"
              class="bg-seq-row group/row flex cursor-pointer items-center outline-none"
              :class="{ 'is-selected': selected === row.id, 'is-dragged': dragging === row.id }"
              :style="{ height: `${ROW}px` }"
              tabindex="0"
              :title="describe(row)"
              :aria-label="describe(row)"
              @click="emit('select', selected === row.id ? null : row.id)"
              @keydown.enter.prevent="emit('select', selected === row.id ? null : row.id)"
              @keydown.alt.up.prevent="earlier(row.id)"
              @keydown.alt.down.prevent="later(row.id)"
              @mouseenter="emit('hover', row.id)"
              @mouseleave="emit('hover', null)"
            >
              <span
                class="text-muted-foreground/60 hover:text-foreground flex h-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
                :style="{ width: `${GRIP}px` }"
                draggable="true"
                title="Drag to change the order"
                @dragstart="onDragStart($event, row.id)"
                @dragend="onDragEnd"
                @click.stop
              >
                <GripVertical class="size-3.5" />
              </span>

              <div class="relative h-full shrink-0" :style="{ width: `${lanesWidth}px` }">
                <span
                  v-if="row.label"
                  class="text-muted-foreground pointer-events-none absolute top-0.5 truncate px-1 text-center text-[10px] leading-4"
                  :style="{
                    left: `${Math.min(row.x1, row.x2)}px`,
                    width: `${Math.max(48, Math.abs(row.x2 - row.x1))}px`,
                  }"
                >
                  {{ row.label }}
                </span>
                <svg
                  class="pointer-events-none absolute inset-0 overflow-visible"
                  :width="lanesWidth"
                  :height="ROW"
                  aria-hidden="true"
                >
                  <circle :cx="row.x1" :cy="arrowOf(row).y" r="3" :fill="row.colour" />
                  <path
                    :d="arrowOf(row).line"
                    fill="none"
                    :stroke="row.colour"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path :d="arrowOf(row).head" :fill="row.colour" />

                  <!-- The messages on this connection right now. -->
                  <g
                    v-for="slot in slots.get(row.id) ?? []"
                    :key="slot.key"
                    :ref="bind(tokenEls, slot.key, 'token')"
                    style="display: none"
                  >
                    <template v-if="flow.motion === 'dash'">
                      <circle r="3.4" :fill="row.colour" />
                    </template>
                    <template v-else-if="(flow.style?.[row.id]?.token ?? flow.token) === 'dot'">
                      <circle r="7" :fill="row.colour" opacity="0.18" />
                      <circle r="3.8" :fill="row.colour" stroke="var(--background)" stroke-width="1.2" />
                    </template>
                    <template v-else-if="(flow.style?.[row.id]?.token ?? flow.token) === 'packet'">
                      <rect
                        x="-6.5"
                        y="-4.5"
                        width="13"
                        height="9"
                        rx="2.5"
                        :fill="row.colour"
                        stroke="var(--background)"
                        stroke-width="1.2"
                      />
                    </template>
                    <template v-else>
                      <rect
                        x="-7.5"
                        y="-5.5"
                        width="15"
                        height="11"
                        rx="1.8"
                        :fill="row.colour"
                        stroke="var(--background)"
                        stroke-width="1.2"
                      />
                      <path
                        d="M-7.5,-5.5 L0,0.6 L7.5,-5.5"
                        fill="none"
                        stroke="var(--background)"
                        stroke-width="1.3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </template>
                  </g>
                </svg>
              </div>

              <!-- One place at a time, for when dragging is not the easier way. -->
              <div
                class="bg-seq-actions flex shrink-0 items-center justify-end gap-0.5 pr-1.5"
                :style="{ width: `${ACTIONS}px` }"
              >
                <span
                  v-if="row.own"
                  class="mr-1 size-1.5 shrink-0 rounded-full"
                  :style="{ background: row.colour }"
                  title="Drawn its own way on this connection"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  :disabled="!canMoveEarlier(steps, row.id)"
                  title="Earlier (Alt + ↑)"
                  @click.stop="earlier(row.id)"
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  :disabled="!canMoveLater(steps, row.id)"
                  title="Later (Alt + ↓)"
                  @click.stop="later(row.id)"
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  :disabled="index === 0"
                  :title="index === 0 ? 'Already in the first step' : `Send at the same time as step ${index}`"
                  @click.stop="withPrevious(row.id, index)"
                >
                  <Link2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  title="Take this connection out of the flow"
                  @click.stop="emit('remove', row.id)"
                >
                  <X />
                </Button>
              </div>
            </div>
          </div>

          <!-- Said out loud while dragging over it, so dropping here is never a guess. -->
          <span v-if="isJoinTarget(index)" class="bg-seq-hint">
            Same time as step {{ index + 1 }}
          </span>
        </div>
      </template>

      <div
        v-if="dragging"
        class="bg-seq-gap is-open"
        :class="{ 'is-target': isGapTarget(rows.length) }"
        :style="{ marginLeft: `${GUTTER}px` }"
        @dragover="over($event, { gap: rows.length })"
      >
        <span>Own step, last</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * The flow's colour reaches every row as `--flow`, so a row carrying a message
 * right now can glow in the colour of what it carries. `data-live` is written
 * by the paint loop rather than bound, so Vue never fights it over the class.
 */
.bg-seq-row {
  border-radius: 6px;
  transition: background-color 160ms ease;
}

.bg-seq-row:hover {
  background: color-mix(in oklab, var(--accent) 70%, transparent);
}

.bg-seq-row[data-live='true'] {
  background: color-mix(in oklab, var(--flow) 11%, transparent);
}

.bg-seq-row.is-selected {
  background: var(--accent);
  box-shadow: inset 0 0 0 1px var(--border);
}

.bg-seq-row.is-dragged {
  opacity: 0.4;
}

.bg-seq-row:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ring);
}

/* Row actions are there when wanted and quiet otherwise. */
.bg-seq-actions {
  opacity: 0;
  transition: opacity 120ms ease;
}

.bg-seq-row:hover .bg-seq-actions,
.bg-seq-row:focus-within .bg-seq-actions,
.bg-seq-row.is-selected .bg-seq-actions {
  opacity: 1;
}

@media (hover: none) {
  .bg-seq-actions {
    opacity: 1;
  }
}

.bg-seq-badge {
  position: relative;
  z-index: 1;
  display: inline-flex;
  height: 20px;
  min-width: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--background);
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}

.bg-seq-badge[data-live='true'] {
  border-color: var(--flow);
  background: var(--flow);
  color: #fff;
}

/* A step of several: one bracket down the side holds its rows together. */
.bg-seq-bracket {
  position: absolute;
  top: 24px;
  bottom: 30px;
  left: 50%;
  width: 7px;
  border: 1.5px solid var(--border);
  border-left: 0;
  border-radius: 0 6px 6px 0;
}

.bg-seq-step.is-group {
  border-radius: 8px;
  background: color-mix(in oklab, var(--muted) 55%, transparent);
}

/* Drop targets are what is current while dragging, so they take the brand colour. */
.bg-seq-step.is-target {
  border-radius: 8px;
  box-shadow: inset 0 0 0 2px var(--brand);
  background: color-mix(in oklab, var(--brand) 7%, transparent);
}

.bg-seq-hint {
  pointer-events: none;
  position: absolute;
  top: -9px;
  right: 8px;
  z-index: 2;
  border-radius: 999px;
  background: var(--brand);
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--brand-foreground);
}

.bg-seq-gap {
  position: relative;
  height: 6px;
  transition: height 120ms ease;
}

.bg-seq-gap.is-open {
  display: flex;
  height: 22px;
  align-items: center;
}

.bg-seq-gap.is-open::before {
  content: '';
  position: absolute;
  left: 0;
  right: 8px;
  top: 50%;
  border-top: 1.5px dashed var(--border);
}

.bg-seq-gap > span {
  pointer-events: none;
  position: relative;
  margin-left: 6px;
  background: var(--background);
  padding: 0 6px;
  font-size: 10px;
  color: var(--muted-foreground);
}

.bg-seq-gap.is-target::before {
  border-top: 2px solid var(--brand);
}

.bg-seq-gap.is-target > span {
  color: var(--brand-strong);
  font-weight: 600;
}
</style>
