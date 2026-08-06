<script setup lang="ts">
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Connection, EdgeMouseEvent, NodeDragEvent, NodeMouseEvent } from '@vue-flow/core'
import { ConnectionMode, PanOnScrollMode, VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import type { ColorKey, Side } from '@/model'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas, CANVAS_ID } from '@/features/diagram/composables/useCanvas'
import { usePlacement } from '@/features/diagram/composables/usePlacement'
import ShapeNode from '@/features/diagram/components/ShapeNode.vue'
import ZoneNode from '@/features/diagram/components/ZoneNode.vue'
import DiagramEdge from '@/features/diagram/components/DiagramEdge.vue'
import type { MenuTarget } from '@/features/diagram/components/CanvasContextMenu.vue'
import CanvasContextMenu from '@/features/diagram/components/CanvasContextMenu.vue'
import { PALETTE_DRAG_TYPE } from '@/features/diagram/lib/drag'
import { DEFAULT_PALETTE_ITEM, type PaletteItem } from '@/features/diagram/data/palette'
import { diagramTheme, nodePaint } from '@/features/diagram/lib/theme'

const emit = defineEmits<{
  (e: 'export'): void
}>()

const {
  nodes,
  edges,
  canvas,
  selectedNodes,
  commit,
  endCoalesce,
  undo,
  redo,
  addEdge,
  removeSelection,
  duplicateSelection,
  groupSelection,
  regroup,
  lockSelection,
  updateNodeData,
  updateEdgeData,
  nudgeSelection,
  fitRequest,
} = useDiagram()

const {
  fitView,
  screenToFlowCoordinate,
  findNode,
  vueFlowRef,
  addSelectedNodes,
  addSelectedEdges,
  removeSelectedElements,
  getNodes,
  getEdges,
} = useCanvas()
const { place, placeAtScreen } = usePlacement()

const nodeTypes = { shape: markRaw(ShapeNode), zone: markRaw(ZoneNode) }
const edgeTypes = { diagram: markRaw(DiagramEdge) }

const theme = computed(() => diagramTheme(canvas.theme))

/** The last palette item used, repeated by double-click and drag-to-empty. */
const lastItem = ref<PaletteItem>(DEFAULT_PALETTE_ITEM)

/** Minimap swatches echo each node's own colour instead of a flat grey. */
function minimapNodeColor(node: { data?: { color?: ColorKey }; type?: string }) {
  const paint = nodePaint(
    { color: node.data?.color ?? 'slate', kind: node.type === 'zone' ? 'zone' : 'shape' },
    theme.value,
  )
  return node.type === 'zone' ? paint.stroke : paint.accent
}

/* ------------------------------------------------------------ connections */

const HANDLE_SIDES: Record<string, Side> = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
}

/** Set by `onConnect` so `onConnectEnd` knows the drag landed on a node. */
let connectionMade = false
let pendingSource: { node: string; side: Side } | null = null

function onConnectStart({ nodeId, handleId }: { nodeId?: string | null; handleId?: string | null }) {
  connectionMade = false
  pendingSource = nodeId
    ? { node: nodeId, side: HANDLE_SIDES[handleId ?? ''] ?? 'auto' }
    : null
}

function onConnect(connection: Connection) {
  connectionMade = true
  commit()
  endCoalesce()
  addEdge(connection.source, connection.target, {
    sourceSide: HANDLE_SIDES[connection.sourceHandle ?? ''] ?? 'auto',
    targetSide: HANDLE_SIDES[connection.targetHandle ?? ''] ?? 'auto',
  })
}

/**
 * Dropping a connection on empty canvas creates the next node and wires it up in
 * one gesture — the fastest way to sketch a chain of services.
 */
function onConnectEnd(event?: MouseEvent | TouchEvent) {
  const source = pendingSource
  pendingSource = null
  if (connectionMade || !source || !event) return

  const point = 'changedTouches' in event ? event.changedTouches[0] : event
  if (!point) return

  const node = placeAtScreen(lastItem.value, { x: point.clientX, y: point.clientY })
  addEdge(source.node, node.id, { sourceSide: source.side })
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
 * Dropping a node onto a zone puts it in that zone; dragging it clear of one
 * takes it out again. Both are decided by where the node's centre landed, and
 * both are written straight into the document as `parent`.
 */
function onNodeDragStop({ node, nodes: dragged }: NodeDragEvent) {
  // A selection drag reports its members in `nodes`; a single drag in `node`.
  const moved = dragged?.length ? dragged : node ? [node] : []
  if (moved.length) regroup(moved.map((n) => n.id))
}

/* ---------------------------------------------------------------- keyboard */

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.isContentEditable ||
    ['input', 'textarea', 'select'].includes(el.tagName?.toLowerCase() ?? '')
  )
}

function onKeyDown(event: KeyboardEvent) {
  // The context menu handles its own keys; ⌫ while it is open must not delete.
  if (menuOpen.value || isTyping(event.target)) return
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
    } else if (key === 'g') {
      event.preventDefault()
      commit()
      endCoalesce()
      groupSelection()
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
      commit()
      endCoalesce()
      removeSelection()
      break
    case 'f':
    case 'F':
      fitView({ padding: 0.2 })
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

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

/** Re-fit whenever a document is loaded from disk or storage. */
watch(fitRequest, () => nextTick(() => fitView({ padding: 0.2 })))
</script>

<template>
  <ContextMenu @update:open="menuOpen = $event">
    <ContextMenuTrigger as-child>
      <div
        class="relative min-h-0 flex-1"
        :style="{
          '--bg-canvas': theme.bg,
          '--bg-selection': theme.selection,
          background: theme.bg,
        }"
        @dragover="onDragOver"
        @drop="onDrop"
        @contextmenu.capture="onContextMenuCapture"
      >
        <!--
          `elevate-nodes-on-select` is off on purpose: Vue Flow would otherwise lift
          a selected node 1000 layers up, so selecting a zone made it jump in front
          of its own contents and drop back again on deselect. Layering is fixed by
          the z bands in `useDiagram`.
        -->
        <VueFlow
          :id="CANVAS_ID"
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :edge-types="edgeTypes"
          :connection-mode="ConnectionMode.Loose"
          :snap-to-grid="canvas.snap"
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
          :connection-line-style="{
            stroke: theme.selection,
            strokeWidth: 1.8,
            strokeDasharray: '5 4',
          }"
          :default-edge-options="{ type: 'diagram' }"
          @connect-start="onConnectStart"
          @connect="onConnect"
          @connect-end="onConnectEnd"
          @node-drag-start="onNodeDragStart"
          @node-drag-stop="onNodeDragStop"
          @selection-drag-start="onNodeDragStart"
          @selection-drag-stop="onNodeDragStop"
          @node-double-click="onNodeDoubleClick"
          @node-context-menu="onNodeContextMenu"
          @edge-context-menu="onEdgeContextMenu"
          @selection-context-menu="onSelectionContextMenu"
          @pane-context-menu="onPaneContextMenu"
          @pane-ready="fitView({ padding: 0.2 })"
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

        <p
          v-if="!nodes.length"
          class="text-muted-foreground pointer-events-none absolute bottom-4 left-4 font-mono text-xs"
        >
          drag a node from the palette · drag a node's dot to connect · right-click for actions
        </p>
      </div>
    </ContextMenuTrigger>

    <CanvasContextMenu
      :target="menuTarget"
      @rename="openEditorFor"
      @add="onMenuAdd"
      @export="emit('export')"
    />
  </ContextMenu>
</template>

<style>
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
</style>
