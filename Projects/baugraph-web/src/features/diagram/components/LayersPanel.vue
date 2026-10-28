<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { GraphNode } from '@vue-flow/core'
import {
  ChevronRight,
  CornerLeftUp,
  Group,
  Layers,
  LocateFixed,
  Lock,
  LockOpen,
  PanelLeftClose,
  Search,
  Square,
  SquareDashed,
  Type,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppTheme } from '@/composables/useAppTheme'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useLayersPanel } from '@/features/diagram/composables/useLayersPanel'
import { iconComponent } from '@/features/diagram/data/icons'
import { nodeTypeLabel } from '@/features/diagram/data/node-types'
import { techLabel } from '@/features/diagram/data/tech'
import type { LayerItem } from '@/features/diagram/lib/layers'
import { canMoveInto, layerParents, layerRows } from '@/features/diagram/lib/layers'
import { COLOR_HEX, diagramTheme } from '@/features/diagram/lib/theme'
import type { ColorKey } from '@/model'

const { nodes, selectedNodes, commit, endCoalesce, setNodesLocked, moveToGroup, groupSelection } =
  useDiagram()
const { findNode, addSelectedNodes, removeSelectedNodes, setViewport, viewport, dimensions } =
  useCanvas()
const { open } = useLayersPanel()

const { mode: appThemeMode } = useAppTheme()
const theme = computed(() => diagramTheme(appThemeMode.value))

/** A row's node, with what the row draws besides its name. */
interface Layer extends LayerItem {
  icon: string
  color: ColorKey
  locked: boolean
}

const FALLBACK_NAME = { zone: 'Zone', shape: 'Node', annotation: 'Text' } as const
const FALLBACK_ICON = { zone: SquareDashed, shape: Square, annotation: Type } as const

const layers = computed<Layer[]>(() =>
  nodes.value.map((node) => {
    const data = node.data as NodeData
    const kind = node.type === 'zone' || node.type === 'annotation' ? node.type : 'shape'
    const type = nodeTypeLabel(data.type)
    // A text annotation can run to several lines; its first one names it.
    const label = data.label.split('\n')[0]!.trim()
    return {
      id: node.id,
      kind,
      name: label || type || FALLBACK_NAME[kind],
      parent: node.parentNode ?? null,
      terms: [type, data.tech ? techLabel(data.tech) : '', node.id],
      icon: data.icon,
      color: data.color,
      locked: data.locked,
    }
  }),
)

const query = ref('')
/** Zones folded shut in this panel. Not saved: it is how the list is being read, not the diagram. */
const collapsed = reactive(new Set<string>())
const rows = computed(() => layerRows(layers.value, { collapsed, query: query.value }))
const selectedIds = computed(() => new Set(selectedNodes.value.map((n) => n.id)))

function toggleCollapsed(id: string) {
  if (collapsed.has(id)) collapsed.delete(id)
  else collapsed.add(id)
}

/* -------------------------------------------------------------- selection */

/**
 * A click selects, the same as on the canvas: on its own it replaces the
 * selection, with ⌘ or ⇧ it adds the row to it or takes it back out. A locked
 * node cannot be selected at all, so clicking one brings it into view instead —
 * which is usually why it was being looked for.
 */
function onRowClick(event: MouseEvent, layer: Layer) {
  if (layer.locked) {
    jumpTo(layer.id)
    return
  }
  const node = findNode(layer.id)
  if (!node) return
  if (!(event.metaKey || event.ctrlKey || event.shiftKey)) {
    addSelectedNodes([node])
    return
  }
  if (selectedIds.value.has(layer.id)) {
    removeSelectedNodes([node])
    return
  }
  const others = selectedNodes.value
    .map((n) => findNode(n.id))
    .filter((n): n is GraphNode => !!n)
  addSelectedNodes([...others, node])
}

const panel = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)

/** Gap between the panel and the canvas edge, matching its `left-3`. */
const PANEL_MARGIN = 12

/**
 * Brings a node into view, centred in the part of the canvas the panel leaves
 * uncovered. Zoomed in to at least 100% so a node found from far out can be
 * read, and out as far as it takes to show the whole of a big zone.
 */
function jumpTo(id: string) {
  const node = findNode(id)
  const { width, height } = dimensions.value
  if (!node || !width || !height) return

  const covered = (panel.value?.offsetWidth ?? 0) + PANEL_MARGIN
  const room = { width: Math.max(width - covered, width / 2), height }
  const box = {
    x: node.computedPosition.x,
    y: node.computedPosition.y,
    width: node.dimensions.width || 1,
    height: node.dimensions.height || 1,
  }
  const fits = Math.min((room.width * 0.7) / box.width, (room.height * 0.7) / box.height)
  // The canvas's own zoom limits (see `DiagramCanvas`).
  const zoom = Math.min(4, Math.max(0.15, Math.min(fits, Math.max(viewport.value.zoom, 1))))
  void setViewport(
    {
      x: width - room.width / 2 - (box.x + box.width / 2) * zoom,
      y: room.height / 2 - (box.y + box.height / 2) * zoom,
      zoom,
    },
    { duration: 350 },
  )
}

/**
 * Selecting something on the canvas opens the zones around it here and scrolls
 * it into view, so the panel always shows where the selection lives.
 */
watch(
  () => (selectedNodes.value.length === 1 ? selectedNodes.value[0]!.id : null),
  (id) => {
    if (!id || !open.value) return
    const parents = layerParents(layers.value)
    for (let up = parents.get(id) ?? null; up; up = parents.get(up) ?? null) collapsed.delete(up)
    void nextTick(() =>
      list.value
        ?.querySelector(`[data-layer-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    )
  },
)

/* ---------------------------------------------------------------- editing */

function toggleLock(layer: Layer) {
  commit()
  endCoalesce()
  setNodesLocked([layer.id], !layer.locked)
}

function groupSelected() {
  commit()
  endCoalesce()
  groupSelection()
}

/* -------------------------------------------------------------- drag & drop */

const LAYER_DRAG_TYPE = 'application/x-baugraph-layers'

/** The nodes being dragged, while a drag that started in this panel lasts. */
const dragging = ref<string[] | null>(null)
/** Where they would land: a zone's id, `null` for the top level, `undefined` for nowhere. */
const dropTarget = ref<string | null | undefined>(undefined)

/** Dragging a selected row takes the whole selection with it, the same as on the canvas. */
function onDragStart(event: DragEvent, layer: Layer) {
  if (layer.locked || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  const locked = new Set(layers.value.filter((l) => l.locked).map((l) => l.id))
  const ids = selectedIds.value.has(layer.id)
    ? [...selectedIds.value].filter((id) => !locked.has(id))
    : [layer.id]
  dragging.value = ids
  event.dataTransfer.setData(LAYER_DRAG_TYPE, ids.join('\n'))
  event.dataTransfer.effectAllowed = 'move'
}

/**
 * Over a zone, a drop goes into it; over anything else, into the zone that
 * thing is in, beside it; over empty space, out to the top level.
 */
function onDragOver(event: DragEvent, layer: Layer | null) {
  if (!dragging.value) return
  const target = !layer ? null : layer.kind === 'zone' ? layer.id : layer.parent
  if (!canMoveInto(layers.value, dragging.value, target)) {
    dropTarget.value = undefined
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTarget.value = target
}

function onDrop(event: DragEvent) {
  const ids = dragging.value
  const target = dropTarget.value
  endDrag()
  if (!ids || target === undefined) return
  event.preventDefault()
  commit()
  endCoalesce()
  if (moveToGroup(ids, target) && target) collapsed.delete(target)
}

function endDrag() {
  dragging.value = null
  dropTarget.value = undefined
}

const selectionTint = computed(() => `color-mix(in srgb, ${theme.value.selection} 16%, transparent)`)
const dropTint = computed(() => `color-mix(in srgb, ${theme.value.selection} 10%, transparent)`)
</script>

<template>
  <!--
    Folded away: a tab on the canvas's left edge, labelled down its length. It
    sits in the upper part of that edge, but never so high that it runs into
    the notice in the top-left corner on a short canvas.
  -->
  <button
    v-if="!open"
    type="button"
    class="absolute top-[max(25%,6rem)] left-0 z-30 flex flex-col items-center gap-2 rounded-r-lg border border-l-0 px-1.5 py-3 text-xs font-medium shadow-sm"
    :style="{ background: theme.surface, borderColor: theme.line, color: theme.ink }"
    aria-label="Open layers"
    @click="open = true"
  >
    <Layers :size="14" />
    <span class="rotate-180 [writing-mode:vertical-rl]">Layers</span>
  </button>

  <!--
    Keys pressed in here stay in here: Enter on one of these buttons must not
    also reach the canvas, which reads it as "rename the selected node". Drops
    stop here too, so a palette item let go over the panel is not placed on
    the canvas underneath it.
  -->
  <aside
    v-else
    ref="panel"
    class="absolute top-3 bottom-3 left-3 z-30 flex w-64 flex-col overflow-hidden rounded-lg border shadow-lg"
    :style="{ background: theme.surface, borderColor: theme.line, color: theme.ink }"
    aria-label="Layers"
    @keydown.enter.stop
    @keydown.space.stop
    @dragover.stop
    @drop.stop
  >
    <header class="flex h-10 shrink-0 items-center gap-1.5 border-b pr-1.5 pl-3" :style="{ borderColor: theme.line }">
      <Layers class="text-muted-foreground size-3.5" />
      <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">Layers</span>
      <span class="text-muted-foreground font-mono text-[10px]">{{ nodes.length }}</span>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="ml-auto size-6"
            :disabled="!selectedNodes.length"
            aria-label="Wrap selection in a zone"
            @click="groupSelected"
          >
            <Group />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Wrap selection in a zone (⌘G)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-6" aria-label="Close layers" @click="open = false">
            <PanelLeftClose />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close layers</TooltipContent>
      </Tooltip>
    </header>

    <div class="relative shrink-0 border-b p-2" :style="{ borderColor: theme.line }">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2"
      />
      <Input v-model="query" placeholder="Find a node…" spellcheck="false" class="h-8 pl-8 text-xs" />
    </div>

    <!-- Empty space below the rows is the top level: dropping there takes a node out of every zone. -->
    <div
      ref="list"
      role="tree"
      aria-label="Layers"
      class="min-h-0 flex-1 overflow-y-auto py-1"
      @dragover.stop="onDragOver($event, null)"
      @drop.stop="onDrop"
    >
      <div
        v-for="row in rows"
        :key="row.item.id"
        role="treeitem"
        :data-layer-id="row.item.id"
        :aria-level="row.depth + 1"
        :aria-selected="selectedIds.has(row.item.id)"
        :aria-expanded="row.childCount ? row.expanded : undefined"
        :draggable="!row.item.locked"
        :title="row.item.locked ? `${row.item.name} — locked; unlock to select or move it` : row.item.name"
        class="group/layer hover:bg-accent mx-1 flex h-7 cursor-default items-center gap-1 rounded-md pr-1 text-xs select-none"
        :style="{
          paddingLeft: `${4 + row.depth * 14}px`,
          background:
            dropTarget === row.item.id
              ? dropTint
              : selectedIds.has(row.item.id)
                ? selectionTint
                : undefined,
          boxShadow: dropTarget === row.item.id ? `inset 0 0 0 1.5px ${theme.selection}` : undefined,
        }"
        @click="onRowClick($event, row.item)"
        @dblclick="jumpTo(row.item.id)"
        @dragstart="onDragStart($event, row.item)"
        @dragend="endDrag"
        @dragover.stop="onDragOver($event, row.item)"
        @drop.stop="onDrop"
      >
        <button
          v-if="row.childCount"
          type="button"
          class="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded"
          :aria-label="row.expanded ? `Collapse ${row.item.name}` : `Expand ${row.item.name}`"
          :disabled="!!query.trim()"
          @click.stop="toggleCollapsed(row.item.id)"
        >
          <ChevronRight class="size-3 transition-transform" :class="{ 'rotate-90': row.expanded }" />
        </button>
        <span v-else class="size-4 shrink-0" />

        <component
          :is="iconComponent(row.item.icon) ?? FALLBACK_ICON[row.item.kind]"
          class="size-3.5 shrink-0"
          :style="{ color: COLOR_HEX[row.item.color] }"
        />
        <span
          class="min-w-0 flex-1 truncate"
          :class="{
            'font-medium': row.item.kind === 'zone',
            'text-muted-foreground': row.item.locked || !row.match,
          }"
        >
          {{ row.item.name }}
        </span>
        <span
          v-if="row.childCount && !row.expanded"
          class="text-muted-foreground shrink-0 font-mono text-[10px] group-hover/layer:hidden"
        >
          {{ row.childCount }}
        </span>

        <button
          type="button"
          class="text-muted-foreground hover:text-foreground hidden size-5 shrink-0 items-center justify-center rounded group-hover/layer:flex"
          :aria-label="`Show ${row.item.name} on the canvas`"
          title="Show on canvas"
          @click.stop="jumpTo(row.item.id)"
        >
          <LocateFixed class="size-3.5" />
        </button>
        <button
          type="button"
          class="hover:text-foreground size-5 shrink-0 items-center justify-center rounded"
          :class="row.item.locked ? 'text-foreground flex' : 'text-muted-foreground hidden group-hover/layer:flex'"
          :aria-label="row.item.locked ? `Unlock ${row.item.name}` : `Lock ${row.item.name}`"
          :title="row.item.locked ? 'Unlock' : 'Lock'"
          @click.stop="toggleLock(row.item)"
        >
          <Lock v-if="row.item.locked" class="size-3.5" />
          <LockOpen v-else class="size-3.5" />
        </button>
      </div>

      <p v-if="!rows.length" class="text-muted-foreground px-3 py-2 text-xs">
        <template v-if="query.trim()">No node matches “{{ query.trim() }}”.</template>
        <template v-else>Nothing on the canvas yet.</template>
      </p>
    </div>

    <!--
      Up for as long as a drag lasts: the top level has no row of its own to be
      dropped on, and empty space under a long list may be scrolled out of sight.
    -->
    <div
      v-if="dragging"
      class="mx-2 mb-2 flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed text-xs"
      :style="{
        borderColor: dropTarget === null ? theme.selection : theme.line,
        background: dropTarget === null ? dropTint : undefined,
        color: dropTarget === null ? theme.selection : undefined,
      }"
      :class="{ 'text-muted-foreground': dropTarget !== null }"
      @dragover.stop="onDragOver($event, null)"
      @drop.stop="onDrop"
    >
      <CornerLeftUp class="size-3.5" />
      Move out of every zone
    </div>
    <p v-else class="text-muted-foreground shrink-0 border-t px-3 py-2 text-[11px] leading-snug" :style="{ borderColor: theme.line }">
      Drag onto a zone to move into it. Double-click to find on the canvas.
    </p>
  </aside>
</template>
