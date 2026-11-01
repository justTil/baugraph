<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { GraphNode } from '@vue-flow/core'
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerLeftUp,
  Ellipsis,
  Group,
  Layers,
  LocateFixed,
  Lock,
  LockOpen,
  MousePointerClick,
  PanelLeftClose,
  PenLine,
  Plus,
  Search,
  Square,
  SquareDashed,
  Trash2,
  Type,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppTheme } from '@/composables/useAppTheme'
import type { NodeData } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useLayersPanel } from '@/features/diagram/composables/useLayersPanel'
import { iconComponent } from '@/features/diagram/data/icons'
import { nodeTypeLabel } from '@/features/diagram/data/node-types'
import { techLabel } from '@/features/diagram/data/tech'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import type { LayerItem, LayerRow } from '@/features/diagram/lib/layers'
import { canMoveInto, layerParents, layerRows, planeGroups } from '@/features/diagram/lib/layers'
import { COLOR_HEX, diagramTheme } from '@/features/diagram/lib/theme'
import type { ColorKey, DiagramPlane } from '@/model'
import { MAX_PLANES } from '@/model'

/**
 * Every node in the diagram, listed two ways: by zone, the way the canvas
 * nests them, and by plane, the way the 3D view stacks them. The planes tab is
 * where a stack is built without leaving the canvas — planes are added,
 * named, reordered here, and nodes are dragged onto them.
 */

const emit = defineEmits<{
  /** The nodes of the plane being pointed at, for the canvas to pick out; `null` when none is. */
  peek: [ids: string[] | null]
}>()

const {
  nodes,
  selectedNodes,
  planes,
  canAddPlane,
  commit,
  endCoalesce,
  setNodesLocked,
  moveToGroup,
  groupSelection,
  planeOfNode,
  addPlane,
  updatePlane,
  removePlane,
  movePlane,
  moveNodesToPlane,
} = useDiagram()
const { findNode, addSelectedNodes, removeSelectedNodes, setViewport, viewport, dimensions } =
  useCanvas()
const { open, tab } = useLayersPanel()

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

/* ----------------------------------------------------------------- planes */

/** A plane as its header draws it. */
interface PlaneInfo extends DiagramPlane {
  name: string
  hex: string
  level: number
  ground: boolean
  top: boolean
}

const planeInfo = computed(
  () =>
    new Map<string, PlaneInfo>(
      planes.value.map((plane, level) => [
        plane.id,
        {
          ...plane,
          name: plane.label || plane.id,
          hex: COLOR_HEX[plane.color ?? 'slate'],
          level,
          ground: level === 0,
          top: level === planes.value.length - 1,
        },
      ]),
    ),
)

/** Planes folded shut in the planes tab. Not saved, the same as `collapsed`. */
const foldedPlanes = reactive(new Set<string>())

function toggleFolded(id: string) {
  if (foldedPlanes.has(id)) foldedPlanes.delete(id)
  else foldedPlanes.add(id)
}

const groups = computed(() =>
  planeGroups(layers.value, planes.value, planeOfNode, { collapsed, query: query.value }),
)

/**
 * What the list draws, top to bottom. Both tabs share one row, so a node reads
 * and behaves the same in either; the planes tab puts a header above each
 * plane's rows. Keys start with `#`, which no id may contain.
 */
type Entry =
  | { kind: 'row'; key: string; row: LayerRow<Layer>; plane: string | null }
  | { kind: 'plane'; key: string; plane: PlaneInfo; count: number; folded: boolean }
  | { kind: 'empty'; key: string; plane: string }

const entries = computed<Entry[]>(() => {
  if (tab.value === 'layers') {
    return rows.value.map((row) => ({ kind: 'row', key: row.item.id, row, plane: null }))
  }
  const searching = !!query.value.trim()
  const out: Entry[] = []
  for (const group of groups.value) {
    if (searching && !group.rows.length) continue
    const plane = planeInfo.value.get(group.plane)!
    const folded = !searching && foldedPlanes.has(group.plane)
    out.push({ kind: 'plane', key: `#plane/${plane.id}`, plane, count: group.members.length, folded })
    if (folded) continue
    if (!group.rows.length) out.push({ kind: 'empty', key: `#empty/${plane.id}`, plane: plane.id })
    for (const row of group.rows) out.push({ kind: 'row', key: row.item.id, row, plane: plane.id })
  }
  return out
})

/** The plane under the pointer, while the canvas is showing which nodes stand on it. */
const peeking = ref<string | null>(null)

watch(
  () =>
    open.value && tab.value === 'planes' && peeking.value
      ? (groups.value.find((group) => group.plane === peeking.value)?.members ?? null)
      : null,
  (ids) => emit('peek', ids),
)
onBeforeUnmount(() => emit('peek', null))

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
    if (tab.value === 'planes') foldedPlanes.delete(planeOfNode(id) ?? '')
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

function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

/** Focuses a name field as it appears, ready to type over. */
const vFocus = {
  mounted: (el: HTMLInputElement) => {
    el.focus()
    el.select()
  },
}

/**
 * A new plane is named before it exists: its id is taken from the name and
 * never changes after. It goes on top of the stack, so it is named at the top
 * of the list, where it will appear.
 */
const addingPlane = ref(false)
const planeDraft = ref('')
/** What to put on the new plane once it is named — set when the canvas's menu asked for it. */
const newPlaneFor = ref<string[]>([])

function startNewPlane(ids: string[] = []) {
  if (!canAddPlane.value) return
  tab.value = 'planes'
  newPlaneFor.value = ids
  planeDraft.value = ''
  addingPlane.value = true
}

function finishNewPlane(save: boolean) {
  if (!addingPlane.value) return
  const label = planeDraft.value.trim()
  const ids = newPlaneFor.value
  addingPlane.value = false
  newPlaneFor.value = []
  if (!save || !label) return
  act(() => {
    const created = addPlane(label)
    if (created && ids.length) moveNodesToPlane(ids, created.id)
  })
}

const renaming = ref<string | null>(null)
const renameDraft = ref('')

function startRenaming(plane: PlaneInfo) {
  renaming.value = plane.id
  renameDraft.value = plane.label
}

/**
 * Renaming from a plane's menu hands focus to the name field, so the menu must
 * not take it back to its button as it closes.
 */
function onMenuCloseAutoFocus(event: Event) {
  if (!renaming.value) return
  event.preventDefault()
  const field = list.value?.querySelector<HTMLInputElement>('[data-plane-rename]')
  field?.focus()
  field?.select()
}

/** Renaming keeps the id, so nothing that names the plane changes. A blank name changes nothing. */
function finishRenaming(save: boolean) {
  const id = renaming.value
  renaming.value = null
  const label = renameDraft.value.trim()
  if (!save || !id || !label || label === planeInfo.value.get(id)?.label) return
  act(() => updatePlane(id, { label }))
}

/** Whether putting the selection on `plane` would move any of it. */
function selectionLeaves(plane: string) {
  return selectedNodes.value.some((n) => planeOfNode(n.id) !== plane)
}

function putSelectionOn(plane: string) {
  act(() => moveNodesToPlane(selectedNodes.value.map((n) => n.id), plane))
  foldedPlanes.delete(plane)
}

/** Selects what stands on a plane, so it can be moved, recoloured or deleted together. */
function selectPlane(plane: string) {
  const ids = groups.value.find((group) => group.plane === plane)?.members ?? []
  const picked = ids
    .map((id) => findNode(id))
    .filter((n): n is GraphNode => !!n && n.selectable !== false)
  if (picked.length) addSelectedNodes(picked)
}

defineExpose({ startNewPlane })

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

/** In the planes tab, the plane a drop would put the dragged nodes on. */
const planeDrop = ref<string | null>(null)

/** Anywhere in a plane's part of the list — its header, its rows — is that plane. */
function onPlaneDragOver(event: DragEvent, plane: string) {
  if (!dragging.value) return
  if (!dragging.value.some((id) => planeOfNode(id) !== plane)) {
    planeDrop.value = null
    return
  }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  planeDrop.value = plane
}

function onPlaneDrop(event: DragEvent) {
  const ids = dragging.value
  const plane = planeDrop.value
  endDrag()
  if (!ids || !plane) return
  event.preventDefault()
  act(() => moveNodesToPlane(ids, plane))
  foldedPlanes.delete(plane)
}

function onRowDragOver(event: DragEvent, entry: Entry & { kind: 'row' }) {
  if (entry.plane) onPlaneDragOver(event, entry.plane)
  else onDragOver(event, entry.row.item)
}

function onRowDrop(event: DragEvent, entry: Entry & { kind: 'row' }) {
  if (entry.plane) onPlaneDrop(event)
  else onDrop(event)
}

function endDrag() {
  dragging.value = null
  dropTarget.value = undefined
  planeDrop.value = null
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
    <header class="flex h-10 shrink-0 items-center gap-1 border-b pr-1.5 pl-1.5" :style="{ borderColor: theme.line }">
      <div role="tablist" aria-label="List nodes by" class="flex items-center gap-0.5">
        <button
          v-for="option in (['layers', 'planes'] as const)"
          :key="option"
          type="button"
          role="tab"
          :aria-selected="tab === option"
          class="flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold tracking-[0.09em] uppercase"
          :class="tab === option ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :title="option === 'layers' ? 'Every node, nested by zone' : 'Every node, by the 3D plane it stands on'"
          @click="tab = option"
        >
          {{ option === 'layers' ? 'Layers' : 'Planes' }}
          <span class="font-mono font-normal tracking-normal">
            {{ option === 'layers' ? nodes.length : planes.length }}
          </span>
        </button>
      </div>
      <Tooltip v-if="tab === 'layers'">
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
      <Tooltip v-else>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="ml-auto size-6"
            :disabled="!canAddPlane || addingPlane"
            aria-label="Add a plane"
            @click="startNewPlane()"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {{ canAddPlane ? 'Add a plane on top of the stack' : `A diagram holds at most ${MAX_PLANES} planes` }}
        </TooltipContent>
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
      :aria-label="tab === 'layers' ? 'Layers' : 'Planes'"
      class="min-h-0 flex-1 overflow-y-auto py-1"
      @dragover.stop="tab === 'layers' && onDragOver($event, null)"
      @drop.stop="tab === 'layers' && onDrop($event)"
    >
      <form v-if="addingPlane" class="px-2 pt-1 pb-2" @submit.prevent="finishNewPlane(true)">
        <Input
          v-model="planeDraft"
          v-focus
          class="h-8 text-xs"
          :placeholder="
            newPlaneFor.length
              ? `Name the plane for ${newPlaneFor.length === 1 ? 'this node' : `${newPlaneFor.length} nodes`}…`
              : 'DMZ, Data tier, Production…'
          "
          aria-label="Name of the new plane"
          @keydown.esc.prevent="finishNewPlane(false)"
          @keydown.stop
          @blur="finishNewPlane(true)"
        />
      </form>

      <template v-for="entry in entries" :key="entry.key">
        <!-- A plane: the head of its part of the list, and a drop target for all of it. -->
        <div
          v-if="entry.kind === 'plane'"
          role="treeitem"
          :aria-level="1"
          :aria-expanded="!entry.folded"
          class="group/plane mx-1 mt-1 flex h-8 cursor-default items-center gap-1.5 rounded-md pr-1 pl-1 text-xs select-none first:mt-0"
          :style="{
            background: planeDrop === entry.plane.id ? dropTint : undefined,
            boxShadow: planeDrop === entry.plane.id ? `inset 0 0 0 1.5px ${theme.selection}` : undefined,
          }"
          @mouseenter="peeking = entry.plane.id"
          @mouseleave="peeking = null"
          @dragover.stop="onPlaneDragOver($event, entry.plane.id)"
          @drop.stop="onPlaneDrop"
        >
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded"
            :aria-label="entry.folded ? `Expand ${entry.plane.name}` : `Collapse ${entry.plane.name}`"
            :disabled="!!query.trim()"
            @click="toggleFolded(entry.plane.id)"
          >
            <ChevronRight class="size-3 transition-transform" :class="{ 'rotate-90': !entry.folded }" />
          </button>
          <Popover>
            <PopoverTrigger as-child>
              <button
                type="button"
                class="size-3.5 shrink-0 rounded-sm border border-black/20 dark:border-white/20"
                :style="{ background: entry.plane.hex }"
                :aria-label="`Colour of ${entry.plane.name}`"
                :title="`Colour of ${entry.plane.name}`"
              />
            </PopoverTrigger>
            <PopoverContent class="w-auto p-2" align="start">
              <ColorSwatches
                :model-value="entry.plane.color ?? 'slate'"
                @update:model-value="act(() => updatePlane(entry.plane.id, { color: ($event ?? 'slate') as ColorKey }))"
              />
            </PopoverContent>
          </Popover>
          <form
            v-if="renaming === entry.plane.id"
            class="min-w-0 flex-1"
            @submit.prevent="finishRenaming(true)"
          >
            <Input
              v-model="renameDraft"
              v-focus
              data-plane-rename
              class="h-6 px-1.5 text-xs"
              :aria-label="`Rename ${entry.plane.name}`"
              @keydown.esc.prevent="finishRenaming(false)"
              @keydown.stop
              @blur="finishRenaming(true)"
            />
          </form>
          <template v-else>
            <span
              class="min-w-0 truncate font-semibold"
              :title="`${entry.plane.name} — double-click to rename`"
              @dblclick="startRenaming(entry.plane)"
            >
              {{ entry.plane.name }}
            </span>
            <span
              v-if="entry.plane.ground"
              class="text-muted-foreground shrink-0 text-[10px]"
              title="The ground: whatever names no plane, and is in no zone that does, stands here"
            >
              ground
            </span>
          </template>
          <span
            v-if="renaming !== entry.plane.id"
            class="text-muted-foreground ml-auto shrink-0 font-mono text-[10px]"
            :class="{ 'group-hover/plane:hidden': selectedNodes.length }"
            :title="`${entry.count} node${entry.count === 1 ? '' : 's'} on this plane`"
          >
            {{ entry.count }}
          </span>

          <button
            v-if="selectedNodes.length && renaming !== entry.plane.id"
            type="button"
            class="text-muted-foreground hover:text-foreground ml-auto hidden size-5 shrink-0 items-center justify-center rounded group-hover/plane:flex disabled:opacity-40"
            :disabled="!selectionLeaves(entry.plane.id)"
            :aria-label="`Put the selection on ${entry.plane.name}`"
            :title="`Put the selection on ${entry.plane.name}`"
            @click="putSelectionOn(entry.plane.id)"
          >
            <ArrowDownToLine class="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground flex size-5 shrink-0 items-center justify-center rounded opacity-0 group-hover/plane:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                :aria-label="`More for ${entry.plane.name}`"
              >
                <Ellipsis class="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48" @close-auto-focus="onMenuCloseAutoFocus">
              <DropdownMenuItem @select="startRenaming(entry.plane)">
                <PenLine />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="!entry.count" @select="selectPlane(entry.plane.id)">
                <MousePointerClick />
                Select its nodes
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem :disabled="entry.plane.top" @select="act(() => movePlane(entry.plane.id, 1))">
                <ChevronUp />
                Raise
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="entry.plane.ground"
                @select="act(() => movePlane(entry.plane.id, -1))"
              >
                <ChevronDown />
                Lower
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @select="act(() => removePlane(entry.plane.id))">
                <Trash2 />
                Delete plane
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p
          v-else-if="entry.kind === 'empty'"
          class="text-muted-foreground mx-1 rounded-md py-1 pr-2 pl-[30px] text-[11px]"
          @dragover.stop="onPlaneDragOver($event, entry.plane)"
          @drop.stop="onPlaneDrop"
        >
          Nothing on it yet — drag nodes here.
        </p>

        <div
          v-else
          role="treeitem"
          :data-layer-id="entry.row.item.id"
          :aria-level="entry.row.depth + (entry.plane ? 2 : 1)"
          :aria-selected="selectedIds.has(entry.row.item.id)"
          :aria-expanded="entry.row.childCount ? entry.row.expanded : undefined"
          :draggable="!entry.row.item.locked"
          :title="entry.row.item.locked ? `${entry.row.item.name} — locked; unlock to select or move it` : entry.row.item.name"
          class="group/layer hover:bg-accent mx-1 flex h-7 cursor-default items-center gap-1 rounded-md pr-1 text-xs select-none"
          :style="{
            paddingLeft: `${(entry.plane ? 18 : 4) + entry.row.depth * 14}px`,
            background:
              dropTarget === entry.row.item.id
                ? dropTint
                : selectedIds.has(entry.row.item.id)
                  ? selectionTint
                  : undefined,
            boxShadow: dropTarget === entry.row.item.id ? `inset 0 0 0 1.5px ${theme.selection}` : undefined,
          }"
          @click="onRowClick($event, entry.row.item)"
          @dblclick="jumpTo(entry.row.item.id)"
          @dragstart="onDragStart($event, entry.row.item)"
          @dragend="endDrag"
          @dragover.stop="onRowDragOver($event, entry)"
          @drop.stop="onRowDrop($event, entry)"
        >
          <button
            v-if="entry.row.childCount"
            type="button"
            class="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded"
            :aria-label="entry.row.expanded ? `Collapse ${entry.row.item.name}` : `Expand ${entry.row.item.name}`"
            :disabled="!!query.trim()"
            @click.stop="toggleCollapsed(entry.row.item.id)"
          >
            <ChevronRight class="size-3 transition-transform" :class="{ 'rotate-90': entry.row.expanded }" />
          </button>
          <span v-else class="size-4 shrink-0" />

          <component
            :is="iconComponent(entry.row.item.icon) ?? FALLBACK_ICON[entry.row.item.kind]"
            class="size-3.5 shrink-0"
            :style="{ color: COLOR_HEX[entry.row.item.color] }"
          />
          <span
            class="min-w-0 flex-1 truncate"
            :class="{
              'font-medium': entry.row.item.kind === 'zone',
              'text-muted-foreground': entry.row.item.locked || !entry.row.match,
            }"
          >
            {{ entry.row.item.name }}
          </span>
          <span
            v-if="entry.row.childCount && !entry.row.expanded"
            class="text-muted-foreground shrink-0 font-mono text-[10px] group-hover/layer:hidden"
          >
            {{ entry.row.childCount }}
          </span>

          <button
            type="button"
            class="text-muted-foreground hover:text-foreground hidden size-5 shrink-0 items-center justify-center rounded group-hover/layer:flex"
            :aria-label="`Show ${entry.row.item.name} on the canvas`"
            title="Show on canvas"
            @click.stop="jumpTo(entry.row.item.id)"
          >
            <LocateFixed class="size-3.5" />
          </button>
          <button
            type="button"
            class="hover:text-foreground size-5 shrink-0 items-center justify-center rounded"
            :class="entry.row.item.locked ? 'text-foreground flex' : 'text-muted-foreground hidden group-hover/layer:flex'"
            :aria-label="entry.row.item.locked ? `Unlock ${entry.row.item.name}` : `Lock ${entry.row.item.name}`"
            :title="entry.row.item.locked ? 'Unlock' : 'Lock'"
            @click.stop="toggleLock(entry.row.item)"
          >
            <Lock v-if="entry.row.item.locked" class="size-3.5" />
            <LockOpen v-else class="size-3.5" />
          </button>
        </div>
      </template>

      <!-- No planes yet: what they are for, and the way to start a stack. -->
      <div v-if="tab === 'planes' && !planes.length && !addingPlane" class="space-y-3 px-3 py-2 text-xs leading-relaxed">
        <p class="text-muted-foreground">
          Planes stack the diagram in the 3D view — one per trust zone, tier or environment. Nodes
          keep their place on this canvas and are lifted onto their plane.
        </p>
        <p class="text-muted-foreground">
          The first plane is the ground: everything stands on it until you put it elsewhere.
        </p>
        <Button variant="outline" size="sm" class="w-full" :disabled="!canAddPlane" @click="startNewPlane()">
          <Plus />
          Add the first plane
        </Button>
      </div>

      <p v-else-if="!entries.length && !addingPlane" class="text-muted-foreground px-3 py-2 text-xs">
        <template v-if="query.trim()">No node matches “{{ query.trim() }}”.</template>
        <template v-else>Nothing on the canvas yet.</template>
      </p>
    </div>

    <!--
      Up for as long as a drag lasts: the top level has no row of its own to be
      dropped on, and empty space under a long list may be scrolled out of sight.
    -->
    <div
      v-if="dragging && tab === 'layers'"
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
    <p
      v-else
      class="text-muted-foreground shrink-0 border-t px-3 py-2 text-[11px] leading-snug"
      :style="{ borderColor: theme.line }"
    >
      <template v-if="tab === 'layers'">Drag onto a zone to move into it. Double-click to find on the canvas.</template>
      <template v-else-if="planes.length">
        Drag nodes onto a plane — a zone takes what is in it along. Point at a plane to see it on the
        canvas; press 3 to see the stack.
      </template>
      <template v-else>Planes are optional: without any, the diagram is flat.</template>
    </p>
  </aside>
</template>
