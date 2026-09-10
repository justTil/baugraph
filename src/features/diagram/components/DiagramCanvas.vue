<script setup lang="ts">
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'
import { computed, defineAsyncComponent, h, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  Connection,
  EdgeMouseEvent,
  GraphNode,
  NodeDragEvent,
  NodeMouseEvent,
} from '@vue-flow/core'
import { ConnectionMode, PanOnScrollMode, VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  Brush,
  Check,
  Eraser,
  Eye,
  EyeOff,
  Pencil,
  Scaling,
  Trash2,
  Waypoints,
} from '@lucide/vue'
import type { ColorKey, DiagramParseError } from '@/model'
import { safeParse, stringify } from '@/model'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { useLaserPointer } from '@/features/diagram/composables/useLaserPointer'
import { SKETCH_WIDTHS, useSketchMode } from '@/features/diagram/composables/useSketch'
import { canvasId, useCanvas } from '@/features/diagram/composables/useCanvas'
import { usePanel } from '@/features/workspace/composables/usePanel'
import type { SavedNotice } from '@/features/diagram/composables/useDocumentFile'
import { useSavedNotice } from '@/features/diagram/composables/useDocumentFile'
import { usePlacement } from '@/features/diagram/composables/usePlacement'
import { useConnectionTarget } from '@/features/diagram/composables/useConnectionTarget'
import ShapeNode from '@/features/diagram/components/ShapeNode.vue'
import ZoneNode from '@/features/diagram/components/ZoneNode.vue'
import DiagramEdge from '@/features/diagram/components/DiagramEdge.vue'
import type { MenuTarget } from '@/features/diagram/components/CanvasContextMenu.vue'
import CanvasContextMenu from '@/features/diagram/components/CanvasContextMenu.vue'
import LaserPointer from '@/features/diagram/components/LaserPointer.vue'
import { PALETTE_DRAG_TYPE } from '@/features/diagram/lib/drag'
import type { AlignGuide } from '@/features/diagram/lib/align-snap'
import { alignSnap } from '@/features/diagram/lib/align-snap'
import type { Box } from '@/features/diagram/lib/edge-path'
import { endpointOf } from '@/features/diagram/lib/edge-path'
import { DEFAULT_PALETTE_ITEM, type PaletteItem } from '@/features/diagram/data/palette'
import { COLOR_SWATCHES, diagramTheme, nodePaint } from '@/features/diagram/lib/theme'

const emit = defineEmits<{
  (e: 'export'): void
}>()

const {
  documentId,
  nodes,
  edges,
  canvas,
  dirty,
  reconnectingEdge,
  resizingNodeId,
  selectedWaypoints,
  alignWaypoints,
  clearWaypointSelection,
  removeSelectedWaypoints,
  selectedNodes,
  selectedEdges,
  sketchStrokes,
  sketchVisible,
  setSketchVisible,
  clearSketch,
  commit,
  endCoalesce,
  undo,
  redo,
  addEdge,
  removeSelection,
  duplicateSelection,
  copySelection,
  pasteClipboard,
  groupSelection,
  regroup,
  lockSelection,
  autoSizeSelection,
  updateNodeData,
  updateEdgeData,
  nudgeSelection,
  fitRequest,
  toDocument,
  replaceDocument,
} = useDiagram()

const {
  fitView,
  screenToFlowCoordinate,
  findNode,
  viewport,
  vueFlowRef,
  addSelectedNodes,
  addSelectedEdges,
  removeSelectedElements,
  getNodes,
  getEdges,
} = useCanvas()
const { place, placeAtScreen } = usePlacement()
const { to: connectTo } = useConnectionTarget()
const { installFlowRuntime, stopFlowRuntime } = useFlows()
const { active: laserActive } = useLaserPointer()
const {
  active: sketchActive,
  tool: sketchTool,
  color: sketchColor,
  width: sketchWidth,
} = useSketchMode()

/** Drawing on a hidden layer makes no sense, so entering Canvas mode reveals it. */
watch(sketchActive, (on) => {
  if (on) setSketchVisible(true)
})

function wipeSketch() {
  commit()
  endCoalesce()
  clearSketch()
}

/** The wrapper the laser pointer tracks the cursor against. */
const canvasHost = ref<HTMLElement | null>(null)
// Other views can share the screen with the canvas, so the window-level
// shortcuts below only belong to it while it is the dock's focused panel.
const { isActive, isVisible } = usePanel()

const nodeTypes = { shape: markRaw(ShapeNode), zone: markRaw(ZoneNode) }
const edgeTypes = { diagram: markRaw(DiagramEdge) }

const theme = computed(() => diagramTheme(canvas.theme))

/** Live label/size of whichever node is being resized, for the canvas's own indicator. */
const resizingNode = computed(() => {
  if (!resizingNodeId.value) return null
  const node = getNodes.value.find((n) => n.id === resizingNodeId.value)
  if (!node) return null
  const label = (node.data as { label?: string } | undefined)?.label
  return {
    label: label || (node.type === 'zone' ? 'Zone' : 'Node'),
    width: Math.round(node.dimensions?.width ?? 0),
    height: Math.round(node.dimensions?.height ?? 0),
  }
})

/** Aligning needs two points to have something to line up against. */
const canAlignWaypoints = computed(() => selectedWaypoints.value.length >= 2)

/**
 * Shown while a single manually-routed connection is selected: adding a bend
 * point is a shift-click, and nothing on the canvas says so on its own. Held
 * back while an end is being dragged loose — that gesture has its own indicator
 * and the hint would only crowd it.
 */
const showWaypointHint = computed(
  () =>
    !reconnectingEdge.value &&
    selectedEdges.value.length === 1 &&
    !!(selectedEdges.value[0]!.data as { waypoints?: unknown[] } | undefined)?.waypoints?.length,
)

/** The last palette item used, repeated by a double-click on empty canvas. */
const lastItem = ref<PaletteItem>(DEFAULT_PALETTE_ITEM)

/* ---------------------------------------------------------------- JSON view */

/** Monaco is a couple of megabytes; nothing pulls it in until the tab is opened. */
const JsonEditor = defineAsyncComponent({
  loader: () => import('@/features/diagram/components/JsonEditor.vue'),
  loadingComponent: {
    render: () =>
      h(
        'div',
        { class: 'text-muted-foreground flex size-full items-center justify-center font-mono text-xs' },
        'Loading editor…',
      ),
  },
  delay: 150,
})

/** Konva is ~150 kB; nothing loads it until the Canvas layer is first needed. */
const SketchLayer = defineAsyncComponent(
  () => import('@/features/diagram/components/SketchLayer.vue'),
)

const viewMode = ref<'diagram' | 'json'>('diagram')
const jsonDraft = ref('')
const jsonError = ref<DiagramParseError | null>(null)

/**
 * Switching to JSON snapshots the current document as text; switching back
 * applies whatever was typed there. Invalid JSON keeps the tab open with the
 * error shown rather than silently discarding the edit or the diagram.
 */
function setViewMode(next: string | undefined) {
  if (!next || next === viewMode.value) return
  if (next === 'diagram') {
    const result = safeParse(jsonDraft.value)
    if (!result.ok) {
      jsonError.value = result.error
      return
    }
    if (stringify(result.document) !== stringify(toDocument())) replaceDocument(result.document)
  } else {
    jsonDraft.value = stringify(toDocument())
    jsonError.value = null
  }
  viewMode.value = next as 'diagram' | 'json'
}

/** Minimap swatches echo each node's own colour instead of a flat grey. */
function minimapNodeColor(node: { data?: { color?: ColorKey }; type?: string }) {
  const paint = nodePaint(
    { color: node.data?.color ?? 'slate', kind: node.type === 'zone' ? 'zone' : 'shape' },
    theme.value,
  )
  return node.type === 'zone' ? paint.stroke : paint.accent
}

/* ------------------------------------------------------------ connections */

/**
 * How far from a connection dot a drag may be released and still land on it.
 * Well past the dot's own hit area, so most of a node is within reach of one of
 * its connection points and connecting takes no aiming — Vue Flow picks the
 * nearest. A node with several points down one side has them closer together
 * than this, and the nearest is still the one under the cursor.
 */
const CONNECTION_RADIUS = 40

/**
 * The line trailing the cursor while a connection is drawn.
 *
 * Dashed and neutral while it is still looking for somewhere to go; solid and
 * green the moment releasing would actually connect something. It is the same
 * answer the dot on the node lights up on, so the line and the node can never
 * tell the user two different things.
 */
const connectionLineStyle = computed(() =>
  connectTo.value
    ? { stroke: theme.value.connect, strokeWidth: 2.2 }
    : { stroke: theme.value.selection, strokeWidth: 1.8, strokeDasharray: '5 4' },
)

/**
 * Records a connection the user has just drawn, in the direction they drew it.
 *
 * Every handle on a node is a *source* handle (see `ShapeNode`), which is what
 * keeps that promise: Vue Flow reads a connection's direction from the handle
 * the drag *started* on, and a drag started on a target handle arrives here
 * with its two ends swapped — the arrow then points back out of the node the
 * user was connecting *to*. With no target handles there is nothing to start
 * such a drag on.
 *
 * A drag released anywhere else is simply abandoned; it used to leave a new node
 * behind, which made every mis-aimed connection something to undo.
 */
function onConnect(connection: Connection) {
  commit()
  endCoalesce()
  const from = endpointOf(connection.sourceHandle)
  const to = endpointOf(connection.targetHandle)
  addEdge(connection.source, connection.target, {
    sourceSide: from.side,
    sourcePort: from.port,
    targetSide: to.side,
    targetPort: to.port,
  })
}

/* ------------------------------------------------------- palette drag/drop */

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes(PALETTE_DRAG_TYPE)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function onDrop(event: DragEvent) {
  const payload = event.dataTransfer?.getData(PALETTE_DRAG_TYPE)
  if (!payload) return
  event.preventDefault()
  const item = JSON.parse(payload) as PaletteItem
  lastItem.value = item
  placeAtScreen(item, { x: event.clientX, y: event.clientY })
}

/* ------------------------------------------------------------ context menu */

/**
 * What the pointer was over when the menu was opened. Vue Flow's own
 * `*-context-menu` events fire while the native event bubbles up to the menu
 * trigger, so the target is always known by the time the menu renders — the
 * capture-phase reset below makes sure a click on chrome that Vue Flow does not
 * report (the minimap, say) falls back to the canvas menu rather than reusing
 * the previous target.
 */
const menuTarget = ref<MenuTarget | null>(null)
const menuOpen = ref(false)
/** Screen point of the last right-click; anchors the edge label editor. */
const menuPoint = ref({ x: 0, y: 0 })

function onContextMenuCapture(event: MouseEvent) {
  menuTarget.value = null
  menuPoint.value = { x: event.clientX, y: event.clientY }
}

function onNodeContextMenu({ node }: NodeMouseEvent) {
  menuTarget.value = { kind: 'node', id: node.id }
  // Right-clicking outside the current selection moves the selection there, so
  // the menu always acts on what the user is pointing at.
  if (!node.selected) {
    removeSelectedElements()
    addSelectedNodes([node])
  }
}

function onEdgeContextMenu({ edge }: EdgeMouseEvent) {
  menuTarget.value = { kind: 'edge', id: edge.id }
  if (!edge.selected) {
    removeSelectedElements()
    addSelectedEdges([edge])
  }
}

function onSelectionContextMenu() {
  menuTarget.value = { kind: 'selection' }
}

function onPaneContextMenu(event: MouseEvent) {
  menuTarget.value = {
    kind: 'pane',
    at: screenToFlowCoordinate({ x: event.clientX, y: event.clientY }),
  }
}

function onMenuAdd({ item, at }: { item: PaletteItem; at: { x: number; y: number } }) {
  lastItem.value = item
  place(item, at)
}

function selectAll() {
  addSelectedNodes(getNodes.value.filter((n) => n.selectable !== false))
  addSelectedEdges(getEdges.value)
}

/* --------------------------------------------------------- inline renaming */

const editing = ref<{
  kind: 'node' | 'edge'
  id: string
  value: string
  left: number
  top: number
  width: number
} | null>(null)
const editorInput = ref<HTMLInputElement | null>(null)

function focusEditor() {
  nextTick(() => {
    editorInput.value?.focus()
    editorInput.value?.select()
  })
}

function openEditor(id: string) {
  const node = findNode(id)
  if (!node) return
  const rect = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`)
  if (!rect) return
  const box = rect.getBoundingClientRect()
  const host = rect.closest('.vue-flow')?.getBoundingClientRect()
  if (!host) return

  editing.value = {
    kind: 'node',
    id,
    value: node.data.label ?? '',
    left: box.left - host.left,
    top: box.top - host.top + (node.type === 'zone' ? 4 : box.height / 2 - 14),
    width: box.width,
  }
  focusEditor()
}

/**
 * An edge label has no box of its own to sit in, so the editor opens where the
 * user right-clicked — which is on the connection itself.
 */
function openEdgeEditor(id: string) {
  const edge = edges.value.find((e) => e.id === id)
  const host = vueFlowRef.value?.getBoundingClientRect()
  if (!edge || !host) return

  const width = 180
  editing.value = {
    kind: 'edge',
    id,
    value: edge.data?.label ?? '',
    left: menuPoint.value.x - host.left - width / 2,
    top: menuPoint.value.y - host.top - 14,
    width,
  }
  focusEditor()
}

function openEditorFor(target: { kind: 'node' | 'edge'; id: string }) {
  if (target.kind === 'node') openEditor(target.id)
  else openEdgeEditor(target.id)
}

function commitEditor(save: boolean) {
  const current = editing.value
  editing.value = null
  if (!current || !save) return

  if (current.kind === 'edge') {
    const edge = edges.value.find((e) => e.id === current.id)
    if (!edge || edge.data?.label === current.value) return
    commit()
    endCoalesce()
    updateEdgeData(current.id, { label: current.value })
    return
  }

  const node = findNode(current.id)
  if (!node || node.data.label === current.value) return
  commit()
  endCoalesce()
  updateNodeData(current.id, { label: current.value })
}

function onNodeDoubleClick({ node }: NodeMouseEvent) {
  openEditor(node.id)
}

function onPaneDoubleClick(event: MouseEvent) {
  place(lastItem.value, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
}

/* ---------------------------------------------------------------- dragging */

function onNodeDragStart() {
  commit()
  endCoalesce()
}

/**
 * Lines the drag is currently held against. Drawn over the canvas while a drag
 * lasts and cleared when it ends.
 */
const guides = ref<AlignGuide[]>([])

/**
 * Whether ⌥ is down. Held, it suspends both the grid and the alignment guides
 * for the length of a drag — the way out for the one placement that is meant to
 * sit where nothing else does, without having to turn snapping off and back on.
 */
const altHeld = ref(false)

/**
 * A node's absolute box.
 *
 * Deliberately built from `position` and the parent's offset rather than from
 * `computedPosition`: the latter is refreshed after the render tick, so during a
 * drag it is a frame behind the position Vue Flow has just written. The parent
 * is not the node being dragged — Vue Flow drags a zone's contents through the
 * zone — so its own computed position is current.
 */
function boxOf(node: GraphNode): Box {
  const parent = node.parentNode ? findNode(node.parentNode) : undefined
  return {
    x: node.position.x + (parent?.computedPosition.x ?? 0),
    y: node.position.y + (parent?.computedPosition.y ?? 0),
    width: node.dimensions.width,
    height: node.dimensions.height,
  }
}

/** True while `node` sits inside one of the nodes being dragged. */
function insideDrag(node: GraphNode, dragged: Set<string>): boolean {
  let parent = node.parentNode
  while (parent) {
    if (dragged.has(parent)) return true
    parent = findNode(parent)?.parentNode
  }
  return false
}

/**
 * Pulls a drag onto the alignments it is nearly holding.
 *
 * The grid can only quantise corners, so two nodes of unequal height can never
 * share a centre line on it — which is why a connector between them came out
 * with a kink however carefully they were placed, and why switching the grid off
 * was no answer either. Alignment with the nodes already on the canvas takes
 * precedence over the grid whenever it is within reach; ⌥ suspends it for a
 * placement that is meant to sit off.
 */
function alignDrag({ event, node, nodes: dragged }: NodeDragEvent) {
  // A selection drag reports its members in `nodes`; a single drag in `node`.
  const moving = dragged?.length ? dragged : node ? [node] : []
  const free = altHeld.value || (event as MouseEvent | undefined)?.altKey === true
  if (!moving.length || !canvas.snap || free) {
    guides.value = []
    return
  }

  const ids = new Set(moving.map((n) => n.id))
  const others = getNodes.value.filter(
    (n) => !ids.has(n.id) && n.dimensions.width > 0 && !insideDrag(n, ids),
  )
  // Held constant on screen rather than in canvas units, so the pull starts
  // where it looks like it should at any zoom — but never inside a grid step,
  // or the grid would win back every alignment it just gave up.
  const tolerance = Math.max(canvas.snapSize * 0.8, 7 / viewport.value.zoom)
  const snap = alignSnap(moving.map(boxOf), others.map(boxOf), tolerance)

  guides.value = snap.guides
  if (!snap.dx && !snap.dy) return
  for (const n of moving) {
    n.position = { x: n.position.x + snap.dx, y: n.position.y + snap.dy }
  }
}

/**
 * Dropping a node onto a zone puts it in that zone; dragging it clear of one
 * takes it out again. Both are decided by where the node's centre landed, and
 * both are written straight into the document as `parent`.
 */
function onNodeDragStop(event: NodeDragEvent) {
  // The last alignment is re-applied here rather than trusted to survive: the
  // drag's closing update is what the pointer said, not what the guides showed.
  alignDrag(event)
  guides.value = []
  const { node, nodes: dragged } = event
  const moved = dragged?.length ? dragged : node ? [node] : []
  if (moved.length) regroup(moved.map((n) => n.id))
}

/* ---------------------------------------------------------------- keyboard */

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.isContentEditable ||
    ['input', 'textarea', 'select'].includes(el.tagName?.toLowerCase() ?? '') ||
    // Monaco's newer input strategy focuses a plain, non-editable
    // `.native-edit-context` div rather than a textarea, so without this a
    // shortcut like ⌘V or ⌘A reaches this handler instead of the editor -
    // pasting into (or selecting) the diagram behind it instead of the text.
    !!el.closest?.('.monaco-editor')
  )
}

function onKeyDown(event: KeyboardEvent) {
  // The context menu handles its own keys; ⌫ while it is open must not delete.
  if (!isActive.value || menuOpen.value || isTyping(event.target)) return

  // Canvas mode owns the keyboard while it is on: Esc leaves it, and the editing
  // shortcuts below (delete, nudge, group…) act on a diagram that is frozen
  // anyway. ⌘-combos still pass through, so Undo keeps working while drawing.
  if (sketchActive.value && !(event.metaKey || event.ctrlKey)) {
    if (event.key === 'Escape') {
      event.preventDefault()
      sketchActive.value = false
    }
    return
  }

  const meta = event.metaKey || event.ctrlKey

  if (meta) {
    const key = event.key.toLowerCase()
    if (key === 'a') {
      event.preventDefault()
      selectAll()
    } else if (key === 'z') {
      event.preventDefault()
      event.shiftKey ? redo() : undo()
    } else if (key === 'y') {
      event.preventDefault()
      redo()
    } else if (key === 'd') {
      event.preventDefault()
      commit()
      endCoalesce()
      duplicateSelection()
    } else if (key === 'c') {
      event.preventDefault()
      copySelection()
    } else if (key === 'v') {
      event.preventDefault()
      commit()
      endCoalesce()
      pasteClipboard()
    } else if (key === 'g') {
      event.preventDefault()
      commit()
      endCoalesce()
      groupSelection()
    } else if (key === 'f' && event.shiftKey) {
      // Sizes the selection to its own text — the whole diagram if nothing is
      // selected. ⇧ keeps it off ⌘F, which the browser claims for find.
      event.preventDefault()
      commit()
      endCoalesce()
      autoSizeSelection()
    } else if (key === 'l' && event.shiftKey) {
      // ⇧ keeps this off ⌘L, which the browser claims for the address bar.
      event.preventDefault()
      commit()
      endCoalesce()
      lockSelection()
    }
    return
  }

  switch (event.key) {
    case 'Backspace':
    case 'Delete':
      event.preventDefault()
      // Bend points are their own selection, separate from the node/edge one
      // — Delete clears whichever the user was actually just pointing at.
      if (selectedWaypoints.value.length) {
        removeSelectedWaypoints()
        break
      }
      commit()
      endCoalesce()
      removeSelection()
      break
    case 'f':
    case 'F':
      fitView({ padding: 0.2 })
      break
    case 'l':
    case 'L':
      // The presentation laser pointer — no modifier, since it is reached for
      // mid-talk rather than mid-edit.
      laserActive.value = !laserActive.value
      break
    case 'Escape':
      if (laserActive.value) {
        event.preventDefault()
        laserActive.value = false
      }
      break
    case 'Enter': {
      const node = selectedNodes.value[0]
      if (node) {
        event.preventDefault()
        openEditor(node.id)
      }
      break
    }
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (!selectedNodes.value.length) return
      event.preventDefault()
      const step = (event.shiftKey ? 5 : 1) * canvas.snapSize
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      commit('nudge')
      nudgeSelection(dx, dy)
      break
    }
  }
}

/** ⌥ can go down and up mid-drag, so its state is tracked rather than sampled. */
function onModifier(event: KeyboardEvent) {
  altHeld.value = event.altKey
}

function onBlur() {
  altHeld.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keydown', onModifier)
  window.addEventListener('keyup', onModifier)
  window.addEventListener('blur', onBlur)
  // The flow tweens belong to the canvas: nothing outside it can see a message
  // move, and the watchers they hang off are scoped to this component so they
  // go away with it.
  installFlowRuntime()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keydown', onModifier)
  window.removeEventListener('keyup', onModifier)
  window.removeEventListener('blur', onBlur)
  stopFlowRuntime()
})

/* ------------------------------------------------------------ save status */

/** Long enough to be read without turning into something to be dismissed. */
const SAVED_NOTICE_MS = 2600

/**
 * The confirmation for a save that has just happened.
 *
 * Held here rather than read straight off the document so it can be taken down
 * again: the save itself is a moment, and the canvas is where the user is
 * looking when they press ⌘S. What stays up instead is the unsaved marker in
 * the same corner, which is the state rather than the event.
 */
const savedNotice = useSavedNotice(documentId)
const saved = ref<SavedNotice | null>(null)
let savedTimer: ReturnType<typeof setTimeout> | undefined

watch(savedNotice, (notice) => {
  clearTimeout(savedTimer)
  saved.value = notice
  if (notice) savedTimer = setTimeout(() => (saved.value = null), SAVED_NOTICE_MS)
})

onBeforeUnmount(() => clearTimeout(savedTimer))

/**
 * Re-fit whenever a document is loaded from disk or storage — but only once Vue
 * Flow has measured the nodes it was just handed, because fitting around boxes
 * of no known size lands on nothing. The timer is the way out for a document
 * that never reports back: an empty one has no nodes to initialise.
 */
const fitPending = ref(false)

function fitLoaded() {
  if (!fitPending.value) return
  // A panel hidden behind another tab has no size to fit against; the watcher
  // below settles the debt the moment it is shown.
  if (!isVisible.value) return
  fitPending.value = false
  fitView({ padding: 0.2 })
}

watch(fitRequest, () => {
  fitPending.value = true
  setTimeout(fitLoaded, 300)
})

watch(isVisible, (visible) => {
  if (visible) nextTick(fitLoaded)
})
</script>

<template>
  <ContextMenu @update:open="menuOpen = $event">
    <div
      ref="canvasHost"
      class="relative min-h-0 flex-1"
      :class="{ 'laser-active': laserActive }"
      :style="{
        '--bg-canvas': theme.bg,
        '--bg-selection': theme.selection,
        '--bg-connect': theme.connect,
        '--bg-waypoint': theme.waypoint,
        background: theme.bg,
      }"
      @dragover="onDragOver"
      @drop="onDrop"
    >
    <ContextMenuTrigger as-child>
      <div v-show="viewMode === 'diagram'" class="absolute inset-0" @contextmenu.capture="onContextMenuCapture">
        <!--
          `elevate-nodes-on-select` is off on purpose: Vue Flow would otherwise lift
          a selected node 1000 layers up, so selecting a zone made it jump in front
          of its own contents and drop back again on deselect. Layering is fixed by
          the z bands in `useDiagram`.
        -->
        <VueFlow
          :id="canvasId(documentId)"
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :edge-types="edgeTypes"
          :connection-mode="ConnectionMode.Loose"
          :connection-radius="CONNECTION_RADIUS"
          :snap-to-grid="canvas.snap && !altHeld"
          :snap-grid="[canvas.snapSize, canvas.snapSize]"
          :min-zoom="0.15"
          :max-zoom="4"
          :delete-key-code="null"
          :zoom-on-scroll="false"
          :pan-on-scroll="true"
          :pan-on-scroll-mode="PanOnScrollMode.Free"
          :zoom-on-pinch="true"
          :selection-key-code="'Shift'"
          :elevate-edges-on-select="true"
          :elevate-nodes-on-select="false"
          :nodes-draggable="!sketchActive"
          :nodes-connectable="!sketchActive"
          :elements-selectable="!sketchActive"
          :connection-line-style="connectionLineStyle"
          :default-edge-options="{ type: 'diagram' }"
          @connect="onConnect"
          @node-drag-start="onNodeDragStart"
          @node-drag="alignDrag"
          @node-drag-stop="onNodeDragStop"
          @selection-drag-start="onNodeDragStart"
          @selection-drag-stop="onNodeDragStop"
          @node-double-click="onNodeDoubleClick"
          @node-context-menu="onNodeContextMenu"
          @edge-context-menu="onEdgeContextMenu"
          @selection-context-menu="onSelectionContextMenu"
          @pane-context-menu="onPaneContextMenu"
          @pane-click="clearWaypointSelection"
          @pane-ready="fitView({ padding: 0.2 })"
          @nodes-initialized="fitLoaded"
          @dblclick.self="onPaneDoubleClick"
        >
          <Background v-if="canvas.grid" :gap="20" :size="1.4" :pattern-color="theme.grid" />
          <MiniMap
            pannable
            zoomable
            :node-color="minimapNodeColor"
            :node-stroke-color="minimapNodeColor"
            :mask-color="theme.dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.6)'"
            :style="{ backgroundColor: theme.surface, borderColor: theme.line }"
            class="!right-3 !bottom-3 !rounded-md !border"
          />
        </VueFlow>

        <!-- Top-centre indicator, up for as long as a connection's own end is being dragged loose. -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="-translate-y-1 opacity-0"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="-translate-y-1 opacity-0"
        >
          <div
            v-if="reconnectingEdge"
            class="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2"
          >
            <div
              class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
              :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
            >
              <Waypoints :size="14" :style="{ color: theme.selection }" />
              Moving connection — drop it on a node to reconnect
            </div>
          </div>
        </Transition>

        <!-- Top-centre indicator, up for as long as a node's own resize handles are held. -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="-translate-y-1 opacity-0"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="-translate-y-1 opacity-0"
        >
          <div
            v-if="resizingNode"
            class="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2"
          >
            <div
              class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
              :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
            >
              <Scaling :size="14" :style="{ color: theme.selection }" />
              Resizing {{ resizingNode.label }} — {{ resizingNode.width }} × {{ resizingNode.height }}
            </div>
          </div>
        </Transition>

        <!-- Bottom-centre hint while a manually-routed connection is selected. -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="translate-y-1 opacity-0"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="translate-y-1 opacity-0"
        >
          <div
            v-if="showWaypointHint"
            class="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"
          >
            <div
              class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
              :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
            >
              <Waypoints :size="14" :style="{ color: theme.selection }" />
              Hold <kbd class="rounded border px-1 font-sans text-[11px]">Shift</kbd> and click the line to
              add a bend point
            </div>
          </div>
        </Transition>

        <!-- Alignment guides; only up while a drag is held against something. -->
        <svg
          v-if="guides.length"
          class="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
        >
          <g :transform="`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`">
            <line
              v-for="guide in guides"
              :key="`${guide.axis}:${guide.position}`"
              :x1="guide.axis === 'x' ? guide.position : guide.from"
              :y1="guide.axis === 'x' ? guide.from : guide.position"
              :x2="guide.axis === 'x' ? guide.position : guide.to"
              :y2="guide.axis === 'x' ? guide.to : guide.position"
              :stroke="theme.selection"
              stroke-width="1"
              stroke-dasharray="5 4"
              vector-effect="non-scaling-stroke"
            />
          </g>
        </svg>

        <!-- Inline label editor, positioned over the node or connection being renamed. -->
        <input
          v-if="editing"
          ref="editorInput"
          v-model="editing.value"
          class="absolute z-30 rounded border px-1.5 py-0.5 text-center text-[13px] font-semibold outline-none"
          :style="{
            left: `${editing.left}px`,
            top: `${editing.top}px`,
            width: `${editing.width}px`,
            borderColor: theme.selection,
            background: theme.bg,
            color: theme.ink,
          }"
          spellcheck="false"
          @keydown.enter.prevent="commitEditor(true)"
          @keydown.esc.prevent="commitEditor(false)"
          @keydown.stop
          @blur="commitEditor(true)"
        />

        <!--
          The corner the editor answers for the file in: whether the diagram is
          ahead of it, and — for a moment after ⌘S — that it no longer is. The
          two never show together, because saving is what ends the first.
        -->
        <div
          class="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[min(22rem,calc(100%-2rem))] flex-col gap-2"
        >
          <Transition
            mode="out-in"
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="translate-y-1 opacity-0"
            leave-active-class="transition duration-200 ease-in"
            leave-to-class="translate-y-1 opacity-0"
          >
            <!-- An edit made while the confirmation is still up retires it early. -->
            <Alert v-if="saved && !dirty" variant="success" class="w-auto shadow-lg">
              <Check />
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>
                {{ saved.fileName ?? 'Downloaded the source file' }}
              </AlertDescription>
            </Alert>

            <p
              v-else-if="dirty"
              class="text-destructive flex items-center gap-1.5 font-mono text-xs"
            >
              <span class="bg-destructive size-1.5 shrink-0 rounded-full" aria-hidden="true" />
              Unsaved changes
            </p>
          </Transition>

          <p v-if="!nodes.length" class="text-muted-foreground font-mono text-xs">
            drag a node from the palette · drag a node's dot onto another to connect ·
            right-click for actions
          </p>
        </div>
      </div>
    </ContextMenuTrigger>

    <!-- The diagram's document as editable text — the way in for JSON pasted from an AI assistant. -->
    <div
      v-if="viewMode === 'json'"
      class="absolute inset-0 z-10 flex flex-col gap-3 p-4"
    >
      <div class="min-h-0 flex-1 overflow-hidden rounded-md border" :style="{ borderColor: theme.line }">
        <JsonEditor v-model="jsonDraft" :dark="theme.dark" />
      </div>
      <div
        v-if="jsonError"
        class="space-y-1 rounded-md border p-2"
        :style="{ borderColor: theme.selection, background: theme.surface }"
      >
        <p class="text-destructive text-xs font-medium">{{ jsonError.message }}</p>
        <ul
          v-if="jsonError.issues.length"
          class="text-muted-foreground max-h-24 space-y-0.5 overflow-y-auto font-mono text-[11px]"
        >
          <li v-for="issue in jsonError.issues" :key="`${issue.path}:${issue.message}`">
            <span class="text-foreground">{{ issue.path }}</span> — {{ issue.message }}
          </li>
        </ul>
      </div>
    </div>

    <!--
      The Canvas layer: a Konva overlay for freehand annotation. It keeps
      painting while Canvas mode is off; `enabled` only decides whether a press
      draws or reaches the diagram.
    -->
    <SketchLayer
      v-if="viewMode === 'diagram'"
      :enabled="sketchActive"
      :shown="sketchVisible || sketchActive"
    />

    <!-- Always on top, so there is a way back from JSON however it was reached. -->
    <div class="absolute top-4 right-4 z-40 flex items-center gap-2">
      <!--
        Only up while two or more bend points are selected — aligning one
        point against itself means nothing. Sits beside the JSON switch
        rather than in a menu, since it only matters for as long as that
        selection lasts.
      -->
      <div
        v-if="canAlignWaypoints"
        class="flex items-center gap-0.5 rounded-lg border p-1 shadow-sm"
        :style="{ background: theme.surface, borderColor: theme.line }"
      >
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="size-7" @click="alignWaypoints('y')">
              <AlignCenterHorizontal :size="15" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Align bend points horizontally</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="size-7" @click="alignWaypoints('x')">
              <AlignCenterVertical :size="15" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Align bend points vertically</TooltipContent>
        </Tooltip>
      </div>

      <!--
        Canvas layer controls: a toggle to draw on top of the diagram, and —
        once there is something drawn — a switch to hide it without erasing it.
      -->
      <div
        class="flex items-center gap-0.5 rounded-lg border p-1 shadow-sm"
        :style="{ background: theme.surface, borderColor: theme.line }"
      >
        <Tooltip>
          <TooltipTrigger as-child>
            <Toggle
              size="sm"
              class="size-7 p-0"
              :model-value="sketchActive"
              aria-label="Canvas layer"
              @update:model-value="sketchActive = Boolean($event)"
            >
              <Brush :size="15" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Canvas — draw on top of the diagram</TooltipContent>
        </Tooltip>
        <Tooltip v-if="sketchStrokes.length">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              @click="setSketchVisible(!sketchVisible)"
            >
              <Eye v-if="sketchVisible" :size="15" />
              <EyeOff v-else :size="15" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ sketchVisible ? 'Hide the drawing' : 'Show the drawing' }}</TooltipContent>
        </Tooltip>
      </div>

      <label
        class="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm select-none"
        :style="{ background: theme.surface, borderColor: theme.line }"
      >
        <span :style="{ color: viewMode === 'diagram' ? theme.ink : undefined }" class="text-muted-foreground">
          Diagram
        </span>
        <Switch
          :model-value="viewMode === 'json'"
          @update:model-value="setViewMode($event ? 'json' : 'diagram')"
        />
        <span :style="{ color: viewMode === 'json' ? theme.ink : undefined }" class="text-muted-foreground">
          JSON
        </span>
      </label>
    </div>

    <!--
      Canvas tools, up only while Canvas mode is on: pen or eraser, a colour, a
      weight, and a way to wipe the layer. Sits under the toggle that opened it.
    -->
    <div
      v-if="sketchActive && viewMode === 'diagram'"
      class="absolute top-16 right-4 z-40 flex items-center gap-1 rounded-lg border p-1 shadow-sm"
      :style="{ background: theme.surface, borderColor: theme.line }"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <Toggle
            size="sm"
            class="size-7 p-0"
            :model-value="sketchTool === 'pen'"
            aria-label="Pen"
            @update:model-value="sketchTool = 'pen'"
          >
            <Pencil :size="15" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Pen</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Toggle
            size="sm"
            class="size-7 p-0"
            :model-value="sketchTool === 'eraser'"
            aria-label="Eraser"
            @update:model-value="sketchTool = 'eraser'"
          >
            <Eraser :size="15" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>Eraser — removes a whole stroke</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" class="mx-0.5 h-5" />

      <button
        v-for="swatch in COLOR_SWATCHES"
        :key="swatch.key"
        type="button"
        class="size-5 rounded-full border transition-transform hover:scale-110"
        :class="sketchColor === swatch.key ? 'ring-2 ring-offset-1' : ''"
        :style="{
          background: swatch.hex,
          borderColor: theme.line,
          '--tw-ring-color': swatch.hex,
          '--tw-ring-offset-color': theme.surface,
        }"
        :aria-label="`Pen colour ${swatch.key}`"
        :aria-pressed="sketchColor === swatch.key"
        @click="sketchColor = swatch.key"
      />

      <Separator orientation="vertical" class="mx-0.5 h-5" />

      <button
        v-for="w in SKETCH_WIDTHS"
        :key="w"
        type="button"
        class="flex size-6 items-center justify-center rounded transition-colors"
        :class="sketchWidth === w ? 'bg-accent' : 'hover:bg-accent/50'"
        :style="{ color: theme.ink }"
        :aria-label="`Pen weight ${w}`"
        :aria-pressed="sketchWidth === w"
        @click="sketchWidth = w"
      >
        <span class="rounded-full" :style="{ width: `${w + 2}px`, height: `${w + 2}px`, background: 'currentColor' }" />
      </button>

      <Separator orientation="vertical" class="mx-0.5 h-5" />

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            :disabled="!sketchStrokes.length"
            @click="wipeSketch()"
          >
            <Trash2 :size="15" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Clear the Canvas layer</TooltipContent>
      </Tooltip>
    </div>

    <!-- The presentation laser pointer: a cursor-following glow, on top of everything. -->
    <LaserPointer :host="canvasHost" />

    <!-- Top-centre hint while the laser pointer is on. -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="laserActive"
        class="pointer-events-none absolute top-4 left-1/2 z-40 -translate-x-1/2"
      >
        <div
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
          :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
        >
          <span class="size-2 rounded-full bg-[#ff2d2d] shadow-[0_0_6px_#ff2d2d]" />
          Laser pointer on — hold to draw, press
          <kbd class="rounded border px-1 font-sans text-[11px]">L</kbd> or
          <kbd class="rounded border px-1 font-sans text-[11px]">Esc</kbd> to exit
        </div>
      </div>
    </Transition>

    <!-- Top-centre hint while Canvas mode is on — the diagram is frozen under it. -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="sketchActive && viewMode === 'diagram'"
        class="pointer-events-none absolute top-4 left-1/2 z-40 -translate-x-1/2"
      >
        <div
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg"
          :style="{ background: theme.bg, borderColor: theme.selection, color: theme.ink }"
        >
          <Brush :size="14" :style="{ color: theme.selection }" />
          Canvas mode — the diagram is locked while you draw. Press
          <kbd class="rounded border px-1 font-sans text-[11px]">Esc</kbd> to exit
        </div>
      </div>
    </Transition>
    </div>

    <CanvasContextMenu
      :target="menuTarget"
      @rename="openEditorFor"
      @add="onMenuAdd"
      @export="emit('export')"
    />
  </ContextMenu>
</template>

<style>
/*
 * The laser pointer draws its own dot, so nothing under it should show a cursor
 * of its own — not the pane's grab hand, not a node's move cursor. Blunt on
 * purpose: while the pointer is on, the canvas is a presentation surface.
 */
.laser-active,
.laser-active * {
  cursor: none !important;
}

/* Vue Flow's default node chrome would double up on the shapes we draw. */
.vue-flow__node-shape,
.vue-flow__node-zone {
  background: transparent;
  border: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
  text-align: left;
  width: auto;
}

.vue-flow__node-zone {
  cursor: default;
}

/*
 * Locked nodes are the ones Vue Flow leaves without its `selectable` class, and
 * they let the pointer straight through: a locked zone is one you are working
 * inside, so its frame must not swallow the clicks meant for its contents or for
 * the canvas. The lock badge opts back in, so there is always a way to unlock.
 *
 * `!important` is unavoidable here — Vue Flow writes `pointer-events: all` as an
 * inline style on that wrapper for as long as any node listener is registered.
 */
.vue-flow__node-shape:not(.selectable),
.vue-flow__node-zone:not(.selectable) {
  pointer-events: none !important;
}

.vue-flow__handle {
  min-width: 0;
  min-height: 0;
}

/*
 * Resizing is the gesture a diagram gets dragged into shape with, and Vue Flow's
 * 1px line is a poor target for it. Each side becomes a 12px strip lying just
 * outside the node, with its hairline border on the node's own edge — so the
 * line looks exactly as before while a side can be grabbed anywhere along its
 * length without aiming. The strip sits outside rather than inside because the
 * node body is painted over it and would swallow anything within the box.
 *
 * The extra `.vue-flow__node` wins the specificity fight with the library's own
 * rules whichever order the stylesheets land in.
 */
.vue-flow__node .vue-flow__resize-control.line {
  border-width: 0;
}

.vue-flow__node .vue-flow__resize-control.line.left,
.vue-flow__node .vue-flow__resize-control.line.right {
  width: 12px;
  transform: none;
}

.vue-flow__node .vue-flow__resize-control.line.top,
.vue-flow__node .vue-flow__resize-control.line.bottom {
  height: 12px;
  transform: none;
}

.vue-flow__node .vue-flow__resize-control.line.left {
  margin-left: -12px;
  border-right-width: 1px;
}

.vue-flow__node .vue-flow__resize-control.line.right {
  border-left-width: 1px;
}

.vue-flow__node .vue-flow__resize-control.line.top {
  margin-top: -12px;
  border-bottom-width: 1px;
}

.vue-flow__node .vue-flow__resize-control.line.bottom {
  border-top-width: 1px;
}

/* The corner handles read as knobs on the canvas, not dots on the node. */
.vue-flow__resize-control.handle {
  border-color: var(--bg-canvas);
}
</style>
