<script lang="ts">
import type { Vec2 } from '@/model'

/**
 * What the pointer was over when the menu opened. `pane` carries the canvas
 * coordinate under the cursor so "add node here" lands where the user clicked.
 */
export type MenuTarget =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'selection' }
  | { kind: 'pane'; at: Vec2 }
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeftRight,
  Braces,
  BringToFront,
  Copy,
  Download,
  Frame,
  Grid3x3,
  Group,
  Hash,
  Lock,
  LockOpen,
  Magnet,
  Maximize,
  Moon,
  MousePointerClick,
  Palette,
  PenLine,
  Plus,
  Redo2,
  SendToBack,
  Shapes,
  Spline,
  StretchHorizontal,
  StretchVertical,
  Terminal,
  Trash2,
  Undo2,
  Ungroup,
} from '@lucide/vue'
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import type { AlignAction } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { PALETTE, type PaletteItem } from '@/features/diagram/data/palette'
import { COLOR_HEX, COLOR_SWATCHES, diagramTheme } from '@/features/diagram/lib/theme'
import { exportJson } from '@/features/diagram/lib/export'
import { ARROW_MODES, LINE_STYLES, ROUTES, SHAPE_KEYS, stringify } from '@/model'

const props = defineProps<{ target: MenuTarget | null }>()

const emit = defineEmits<{
  (e: 'rename', target: { kind: 'node' | 'edge'; id: string }): void
  (e: 'add', payload: { item: PaletteItem; at: Vec2 }): void
  (e: 'export'): void
}>()

const {
  nodes,
  edges,
  canvas,
  selectedNodes,
  selectedEdges,
  canUndo,
  canRedo,
  lockedCount,
  commit,
  endCoalesce,
  undo,
  redo,
  removeSelection,
  duplicateSelection,
  groupSelection,
  ungroupSelection,
  lockSelection,
  unlockAll,
  updateNodeData,
  updateEdgeData,
  reverseEdge,
  reorderNode,
  alignSelection,
  toDocument,
} = useDiagram()

const { fitView, addSelectedNodes, addSelectedEdges, getNodes, getEdges } = useCanvas()

/* ------------------------------------------------------------------ target */

const node = computed(() => {
  const target = props.target
  if (target?.kind !== 'node') return null
  return nodes.value.find((n) => n.id === target.id) ?? null
})
const edge = computed(() => {
  const target = props.target
  if (target?.kind !== 'edge') return null
  return edges.value.find((e) => e.id === target.id) ?? null
})

const selectionCount = computed(() => selectedNodes.value.length + selectedEdges.value.length)

/**
 * Which menu to show. Right-clicking one member of a multi-selection acts on the
 * whole selection — the same rule every drawing tool follows.
 */
const mode = computed<'node' | 'edge' | 'selection' | 'pane'>(() => {
  if (!props.target || props.target.kind === 'pane') return 'pane'
  if (props.target.kind === 'selection') return selectionCount.value ? 'selection' : 'pane'
  if (selectionCount.value > 1) return 'selection'
  return props.target.kind === 'node' && node.value ? 'node' : edge.value ? 'edge' : 'pane'
})

const isZone = computed(() => node.value?.type === 'zone')

/* ----------------------------------------------------------------- actions */

/** Every mutation records an undo step first, exactly as the inspector does. */
function act(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}

const SHAPE_LABELS: Record<string, string> = {
  rect: 'Rectangle',
  round: 'Rounded',
  pill: 'Pill',
  cylinder: 'Cylinder',
  queue: 'Queue',
  hexagon: 'Hexagon',
  diamond: 'Diamond',
  circle: 'Circle',
  note: 'Note',
}

const ROUTE_LABELS: Record<string, string> = {
  orthogonal: 'Orthogonal',
  curved: 'Curved',
  straight: 'Straight',
}

const LINE_LABELS: Record<string, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
}

const ARROW_LABELS: Record<string, string> = {
  target: 'End only',
  both: 'Both ends',
  none: 'None',
}

const ALIGNMENTS: { action: AlignAction; icon: unknown; label: string }[] = [
  { action: 'left', icon: AlignStartVertical, label: 'Align left' },
  { action: 'center-x', icon: AlignCenterVertical, label: 'Align centre' },
  { action: 'right', icon: AlignEndVertical, label: 'Align right' },
  { action: 'top', icon: AlignStartHorizontal, label: 'Align top' },
  { action: 'center-y', icon: AlignCenterHorizontal, label: 'Align middle' },
  { action: 'bottom', icon: AlignEndHorizontal, label: 'Align bottom' },
  { action: 'distribute-x', icon: AlignHorizontalDistributeCenter, label: 'Distribute across' },
  { action: 'distribute-y', icon: AlignVerticalDistributeCenter, label: 'Distribute down' },
  { action: 'match-width', icon: StretchHorizontal, label: 'Match width' },
  { action: 'match-height', icon: StretchVertical, label: 'Match height' },
]

const defaultEdgeHex = computed(() => diagramTheme(canvas.theme).edge)

/** Colour applied to every selected node, so the swatch works on a selection too. */
function paintNodes(color: string) {
  act(() => {
    const targets = mode.value === 'node' && node.value ? [node.value] : selectedNodes.value
    targets.forEach((n) => updateNodeData(n.id, { color: color as never }))
  })
}

/**
 * Renaming hands focus to the inline editor on the canvas, so the menu must not
 * pull it back to the trigger as it unmounts.
 */
const keepFocus = ref(false)

function requestRename(target: { kind: 'node' | 'edge'; id: string }) {
  keepFocus.value = true
  emit('rename', target)
}

function onCloseAutoFocus(event: Event) {
  if (!keepFocus.value) return
  keepFocus.value = false
  event.preventDefault()
}

function selectAll() {
  addSelectedNodes(getNodes.value.filter((n) => n.selectable !== false))
  addSelectedEdges(getEdges.value)
}

function addHere(item: PaletteItem) {
  if (props.target?.kind !== 'pane') return
  emit('add', { item, at: props.target.at })
}

/* --------------------------------------------------------- developer tools */

function copy(text: string) {
  // Clipboard access can be refused (insecure context, denied permission); a
  // failed copy is not worth an error dialog in a drawing tool.
  navigator.clipboard?.writeText(text).catch(() => {})
}

/** The selected element as it will be written to the file — handy in a diff. */
function copyNodeJson(id: string) {
  const model = toDocument().nodes.find((n) => n.id === id)
  if (model) copy(JSON.stringify(model, null, 2))
}

function copyEdgeJson(id: string) {
  const model = toDocument().edges.find((e) => e.id === id)
  if (model) copy(JSON.stringify(model, null, 2))
}

function copyDocument() {
  copy(stringify(toDocument()))
}

function copySelectionIds() {
  copy(
    [...selectedNodes.value.map((n) => n.id), ...selectedEdges.value.map((e) => e.id)].join('\n'),
  )
}
</script>

<template>
  <ContextMenuContent class="w-60" @close-auto-focus="onCloseAutoFocus">
    <!-- ------------------------------------------------------------- node -->
    <template v-if="mode === 'node' && node">
      <ContextMenuLabel class="flex items-center gap-1.5">
        <component :is="isZone ? Frame : Shapes" class="size-3.5" />
        <span class="truncate">{{ node.data?.label || node.id }}</span>
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem @select="requestRename({ kind: 'node', id: node!.id })">
        <PenLine />
        Rename
        <ContextMenuShortcut>⏎</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette />
          Colour
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="node.data?.color">
            <ContextMenuRadioItem
              v-for="swatch in COLOR_SWATCHES"
              :key="swatch.key"
              :value="swatch.key"
              @select="paintNodes(swatch.key)"
            >
              <span
                class="size-3 rounded-full border border-black/20 dark:border-white/20"
                :style="{ background: swatch.hex }"
              />
              <span class="capitalize">{{ swatch.key }}</span>
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub v-if="!isZone">
        <ContextMenuSubTrigger>
          <Shapes />
          Shape
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="node.data?.shape">
            <ContextMenuRadioItem
              v-for="shape in SHAPE_KEYS"
              :key="shape"
              :value="shape"
              @select="act(() => updateNodeData(node!.id, { shape }))"
            >
              {{ SHAPE_LABELS[shape] }}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem @select="act(duplicateSelection)">
        <Copy />
        Duplicate
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem @select="act(groupSelection)">
        <Group />
        Wrap in zone
        <ContextMenuShortcut>⌘G</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem v-if="isZone" @select="act(ungroupSelection)">
        <Ungroup />
        Release contents
      </ContextMenuItem>
      <ContextMenuItem @select="act(() => reorderNode(node!.id, 'front'))">
        <BringToFront />
        Bring to front
      </ContextMenuItem>
      <ContextMenuItem @select="act(() => reorderNode(node!.id, 'back'))">
        <SendToBack />
        Send to back
      </ContextMenuItem>
      <ContextMenuItem @select="act(lockSelection)">
        <Lock />
        Lock
        <ContextMenuShortcut>⇧⌘L</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Terminal />
          Developer
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="copy(node!.id)">
            <Hash />
            Copy node id
          </ContextMenuItem>
          <ContextMenuItem @select="copyNodeJson(node!.id)">
            <Braces />
            Copy node JSON
          </ContextMenuItem>
          <ContextMenuItem @select="copyDocument()">
            <Braces />
            Copy diagram JSON
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem variant="destructive" @select="act(removeSelection)">
        <Trash2 />
        Delete
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </template>

    <!-- ------------------------------------------------------------- edge -->
    <template v-else-if="mode === 'edge' && edge">
      <ContextMenuLabel class="flex items-center gap-1.5">
        <Spline class="size-3.5" />
        <span class="truncate font-mono">{{ edge.source }} → {{ edge.target }}</span>
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem @select="requestRename({ kind: 'edge', id: edge!.id })">
        <PenLine />
        Edit label
        <ContextMenuShortcut>⏎</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem @select="act(() => reverseEdge(edge!.id))">
        <ArrowLeftRight />
        Reverse direction
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Spline />
          Route
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="edge.data?.route">
            <ContextMenuRadioItem
              v-for="route in ROUTES"
              :key="route"
              :value="route"
              @select="act(() => updateEdgeData(edge!.id, { route }))"
            >
              {{ ROUTE_LABELS[route] }}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <StretchHorizontal />
          Line
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="edge.data?.line">
            <ContextMenuRadioItem
              v-for="line in LINE_STYLES"
              :key="line"
              :value="line"
              @select="act(() => updateEdgeData(edge!.id, { line }))"
            >
              {{ LINE_LABELS[line] }}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ArrowLeftRight />
          Arrows
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="edge.data?.arrows">
            <ContextMenuRadioItem
              v-for="arrows in ARROW_MODES"
              :key="arrows"
              :value="arrows"
              @select="act(() => updateEdgeData(edge!.id, { arrows }))"
            >
              {{ ARROW_LABELS[arrows] }}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette />
          Colour
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuRadioGroup :model-value="edge.data?.color ?? 'default'">
            <ContextMenuRadioItem
              value="default"
              @select="act(() => updateEdgeData(edge!.id, { color: null }))"
            >
              <span
                class="size-3 rounded-full border border-black/20 dark:border-white/20"
                :style="{ background: defaultEdgeHex }"
              />
              Theme default
            </ContextMenuRadioItem>
            <ContextMenuRadioItem
              v-for="swatch in COLOR_SWATCHES"
              :key="swatch.key"
              :value="swatch.key"
              @select="act(() => updateEdgeData(edge!.id, { color: swatch.key }))"
            >
              <span
                class="size-3 rounded-full border border-black/20 dark:border-white/20"
                :style="{ background: swatch.hex }"
              />
              <span class="capitalize">{{ swatch.key }}</span>
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Terminal />
          Developer
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="copy(edge!.id)">
            <Hash />
            Copy edge id
          </ContextMenuItem>
          <ContextMenuItem @select="copyEdgeJson(edge!.id)">
            <Braces />
            Copy edge JSON
          </ContextMenuItem>
          <ContextMenuItem @select="copyDocument()">
            <Braces />
            Copy diagram JSON
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem variant="destructive" @select="act(removeSelection)">
        <Trash2 />
        Delete connection
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </template>

    <!-- -------------------------------------------------------- selection -->
    <template v-else-if="mode === 'selection'">
      <ContextMenuLabel>
        {{ selectedNodes.length }} node{{ selectedNodes.length === 1 ? '' : 's' }} ·
        {{ selectedEdges.length }} connection{{ selectedEdges.length === 1 ? '' : 's' }}
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuSub v-if="selectedNodes.length">
        <ContextMenuSubTrigger>
          <Palette />
          Colour
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            v-for="swatch in COLOR_SWATCHES"
            :key="swatch.key"
            @select="paintNodes(swatch.key)"
          >
            <span
              class="size-3 rounded-full border border-black/20 dark:border-white/20"
              :style="{ background: swatch.hex }"
            />
            <span class="capitalize">{{ swatch.key }}</span>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSub v-if="selectedNodes.length > 1">
        <ContextMenuSubTrigger>
          <AlignCenterVertical />
          Align &amp; distribute
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            v-for="entry in ALIGNMENTS"
            :key="entry.action"
            @select="act(() => alignSelection(entry.action))"
          >
            <component :is="entry.icon" />
            {{ entry.label }}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem @select="act(duplicateSelection)">
        <Copy />
        Duplicate
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem @select="act(groupSelection)">
        <Group />
        Wrap in zone
        <ContextMenuShortcut>⌘G</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem @select="act(ungroupSelection)">
        <Ungroup />
        Release zone contents
      </ContextMenuItem>
      <ContextMenuItem @select="act(lockSelection)">
        <Lock />
        Lock selection
        <ContextMenuShortcut>⇧⌘L</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Terminal />
          Developer
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="copySelectionIds()">
            <Hash />
            Copy ids
          </ContextMenuItem>
          <ContextMenuItem @select="copyDocument()">
            <Braces />
            Copy diagram JSON
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem variant="destructive" @select="act(removeSelection)">
        <Trash2 />
        Delete selection
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </template>

    <!-- ------------------------------------------------------------- pane -->
    <template v-else>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Plus />
          Add node here
        </ContextMenuSubTrigger>
        <ContextMenuSubContent class="max-h-80">
          <ContextMenuSub v-for="group in PALETTE" :key="group.id">
            <ContextMenuSubTrigger>{{ group.label }}</ContextMenuSubTrigger>
            <ContextMenuSubContent class="max-h-80">
              <ContextMenuItem
                v-for="item in group.items"
                :key="item.label"
                @select="addHere(item)"
              >
                <span
                  class="size-3 rounded-full border border-black/20 dark:border-white/20"
                  :style="{ background: COLOR_HEX[item.color] }"
                />
                {{ item.label }}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem @select="selectAll()">
        <MousePointerClick />
        Select all
        <ContextMenuShortcut>⌘A</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem @select="fitView({ padding: 0.2 })">
        <Maximize />
        Fit to content
        <ContextMenuShortcut>F</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem :disabled="!canUndo" @select="undo()">
        <Undo2 />
        Undo
        <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem :disabled="!canRedo" @select="redo()">
        <Redo2 />
        Redo
        <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuCheckboxItem
        :model-value="canvas.grid"
        @update:model-value="canvas.grid = $event === true"
      >
        <Grid3x3 />
        Show grid
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        :model-value="canvas.snap"
        @update:model-value="canvas.snap = $event === true"
      >
        <Magnet />
        Snap to grid
      </ContextMenuCheckboxItem>
      <ContextMenuCheckboxItem
        :model-value="canvas.theme === 'dark'"
        @update:model-value="canvas.theme = $event === true ? 'dark' : 'light'"
      >
        <Moon />
        Dark canvas
      </ContextMenuCheckboxItem>

      <ContextMenuItem v-if="lockedCount" @select="act(unlockAll)">
        <LockOpen />
        Unlock all ({{ lockedCount }})
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Terminal />
          Developer
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="copyDocument()">
            <Braces />
            Copy diagram JSON
          </ContextMenuItem>
          <ContextMenuItem @select="exportJson(toDocument())">
            <Download />
            Download .baugraph.json
            <ContextMenuShortcut>⌘S</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuItem @select="emit('export')">
        <Download />
        Export diagram…
      </ContextMenuItem>
    </template>
  </ContextMenuContent>
</template>
