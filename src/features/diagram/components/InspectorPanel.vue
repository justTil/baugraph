<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Lock,
  LockOpen,
  Scaling,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AlignAction } from '@/features/diagram/composables/useDiagram'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import ColorSwatches from '@/features/diagram/components/ColorSwatches.vue'
import IconPicker from '@/features/diagram/components/IconPicker.vue'
import CataloguePicker from '@/features/diagram/components/CataloguePicker.vue'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { SHAPE_KEYS } from '@/model'
import { NODE_TYPE_GROUPS, nodeType } from '@/features/diagram/data/node-types'
import { TECH_CATEGORIES, categoryFirst, techTerms } from '@/features/diagram/data/tech'
import { diagramTheme } from '@/features/diagram/lib/theme'
import { fitZoneMinSize } from '@/features/diagram/lib/auto-size'

const emit = defineEmits<{
  (e: 'export'): void
}>()

const {
  nodes,
  edges,
  canvas,
  selectedNodes,
  selectedEdges,
  lockedCount,
  commit,
  endCoalesce,
  updateNodeData,
  updateNodeSize,
  autoSizeNodes,
  fitSizeOf,
  setNodeType,
  setNodeTech,
  updateEdgeData,
  reverseEdge,
  reorderNode,
  removeSelection,
  duplicateSelection,
  groupSelection,
  ungroupSelection,
  lockSelection,
  unlockAll,
  alignSelection,
  sizeOf,
} = useDiagram()

const node = computed(() =>
  selectedNodes.value.length === 1 && selectedEdges.value.length === 0
    ? selectedNodes.value[0]
    : null,
)
const edge = computed(() =>
  selectedEdges.value.length === 1 && selectedNodes.value.length === 0
    ? selectedEdges.value[0]
    : null,
)
const multiple = computed(() => selectedNodes.value.length + selectedEdges.value.length > 1)

const title = computed(() => {
  if (node.value) return node.value.type === 'zone' ? 'Zone' : 'Node'
  if (edge.value) return 'Connection'
  if (multiple.value) return 'Selection'
  return 'Diagram'
})

const nodeSize = computed(() => (node.value ? sizeOf(node.value) : { width: 0, height: 0 }))

/** Typing a smaller number than this would clip the node's own text. */
const sizeFloor = computed(() => {
  if (!node.value) return { width: 40, height: 34 }
  return node.value.type === 'zone' ? fitZoneMinSize(node.value.data) : fitSizeOf(node.value)
})

/**
 * A zone can only be a zone kind of thing (VPC, cluster) and a box can only be a
 * box kind of thing, so each is offered its own half of the catalogue.
 */
const typeGroups = computed(() => {
  const zone = node.value?.type === 'zone'
  return NODE_TYPE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.types
      .filter((type) => (type.kind === 'zone') === zone)
      .map((type) => ({
        id: type.id,
        label: type.label,
        icon: type.icon ?? type.listIcon,
        terms: type.aliases,
      })),
  })).filter((group) => group.items.length > 0)
})

/** The technology a whole selection shares; `null` when they disagree. */
const sharedTech = computed(() => {
  const values = new Set(selectedNodes.value.map((n) => n.data.tech))
  return values.size === 1 ? [...values][0] : null
})

/** The technology catalogue, with the category this node's type suggests first. */
const techGroups = computed(() =>
  categoryFirst(
    TECH_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      items: category.items.map((item) => ({
        id: item.id,
        label: item.label,
        terms: techTerms(item),
      })),
    })),
    nodeType(node.value?.data.type)?.tech,
  ),
)

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

const SIDE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'top', label: '↑', title: 'Top' },
  { value: 'right', label: '→', title: 'Right' },
  { value: 'bottom', label: '↓', title: 'Bottom' },
  { value: 'left', label: '←', title: 'Left' },
]

const ALIGNMENTS: { action: AlignAction; icon: unknown; title: string }[] = [
  { action: 'left', icon: AlignStartVertical, title: 'Align left' },
  { action: 'center-x', icon: AlignCenterVertical, title: 'Align centre' },
  { action: 'right', icon: AlignEndVertical, title: 'Align right' },
  { action: 'top', icon: AlignStartHorizontal, title: 'Align top' },
  { action: 'center-y', icon: AlignCenterHorizontal, title: 'Align middle' },
  { action: 'bottom', icon: AlignEndHorizontal, title: 'Align bottom' },
  { action: 'distribute-x', icon: AlignHorizontalDistributeCenter, title: 'Distribute horizontally' },
  { action: 'distribute-y', icon: AlignVerticalDistributeCenter, title: 'Distribute vertically' },
]

const stats = computed(() => ({
  nodes: nodes.value.filter((n) => n.type !== 'zone').length,
  zones: nodes.value.filter((n) => n.type === 'zone').length,
  edges: edges.value.length,
}))

const defaultEdgeHex = computed(() => diagramTheme(canvas.theme).edge)

/** Text fields coalesce into one undo step per focus, not one per keystroke. */
function editText(id: string, field: 'label' | 'sublabel', value: string) {
  commit(`node:${id}:${field}`)
  updateNodeData(id, { [field]: value })
}

function editEdgeLabel(id: string, value: string) {
  commit(`edge:${id}:label`)
  updateEdgeData(id, { label: value })
}

function setSize(id: string, patch: { width?: number; height?: number }) {
  commit()
  updateNodeSize(id, { ...nodeSize.value, ...patch })
}

function withCommit(fn: () => void) {
  commit()
  endCoalesce()
  fn()
}
</script>

<template>
  <aside class="bg-sidebar flex w-72 shrink-0 flex-col border-l">
    <header class="flex h-10 shrink-0 items-center border-b px-3">
      <span class="text-muted-foreground text-[10px] font-bold tracking-[0.09em] uppercase">
        {{ title }}
      </span>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- ------------------------------------------------------------ node -->
      <template v-if="node">
        <section class="space-y-3 border-b p-3">
          <div class="space-y-1.5">
            <Label class="text-xs">Label</Label>
            <Input
              :model-value="node.data.label"
              class="h-8 text-sm"
              @update:model-value="editText(node.id, 'label', String($event))"
              @blur="endCoalesce()"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Subtitle</Label>
            <Input
              :model-value="node.data.sublabel"
              class="h-8 text-sm"
              placeholder="protocol, SLA, note…"
              @update:model-value="editText(node.id, 'sublabel', String($event))"
              @blur="endCoalesce()"
            />
          </div>
        </section>

        <!--
          Type and technology are drawn on the node itself and stay there through
          a rename, which is what keeps an icon from having to be remembered.
        -->
        <section class="space-y-3 border-b p-3">
          <div class="space-y-1.5">
            <Label class="text-xs">Type</Label>
            <CataloguePicker
              :model-value="node.data.type"
              :groups="typeGroups"
              placeholder="No type"
              clear-label="No type"
              search-placeholder="Search types…"
              @update:model-value="withCommit(() => setNodeType(node!.id, $event))"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Technology</Label>
            <CataloguePicker
              :model-value="node.data.tech"
              :groups="techGroups"
              placeholder="Not specified"
              clear-label="No technology"
              search-placeholder="PostgreSQL, Kafka, IBM MQ…"
              @update:model-value="withCommit(() => setNodeTech(node!.id, $event))"
            />
          </div>
        </section>

        <section class="space-y-2 border-b p-3">
          <Label class="text-xs">Colour</Label>
          <ColorSwatches
            :model-value="node.data.color"
            @update:model-value="withCommit(() => updateNodeData(node!.id, { color: $event! }))"
          />
        </section>

        <section v-if="node.type !== 'zone'" class="space-y-2 border-b p-3">
          <Label class="text-xs">Shape</Label>
          <Select
            :model-value="node.data.shape"
            @update:model-value="withCommit(() => updateNodeData(node!.id, { shape: $event as never }))"
          >
            <SelectTrigger class="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="shape in SHAPE_KEYS" :key="shape" :value="shape">
                {{ SHAPE_LABELS[shape] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section v-if="node.type !== 'zone'" class="space-y-2 border-b p-3">
          <Label class="text-xs">Icon</Label>
          <IconPicker
            :model-value="node.data.icon"
            @update:model-value="withCommit(() => updateNodeData(node!.id, { icon: $event }))"
          />
        </section>

        <section class="space-y-3 border-b p-3">
          <div class="flex items-center justify-between">
            <Label class="text-xs">Size</Label>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground -my-1 h-6 px-1.5 text-xs"
              :title="
                node.type === 'zone'
                  ? 'Fit the zone around its contents (⇧⌘F)'
                  : 'Fit the box to its text (⇧⌘F)'
              "
              @click="withCommit(() => autoSizeNodes([node!.id]))"
            >
              <Scaling />
              Fit
            </Button>
          </div>
          <!--
            Width is the dimension a diagram gets tidied with, so both are here
            as steppers: type a number, or hold the arrow. Neither can be pulled
            in over the node's own text — the floor is what the content needs.
          -->
          <div class="flex gap-2">
            <div class="relative flex-1">
              <span
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[10px] font-semibold"
              >W</span>
              <Input
                type="number"
                step="10"
                class="h-8 pl-7 text-sm"
                :model-value="Math.round(nodeSize.width)"
                @change="
                  setSize(node.id, {
                    width: Math.max(
                      sizeFloor.width,
                      Number(($event.target as HTMLInputElement).value),
                    ),
                  })
                "
              />
            </div>
            <div class="relative flex-1">
              <span
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[10px] font-semibold"
              >H</span>
              <Input
                type="number"
                step="10"
                class="h-8 pl-7 text-sm"
                :model-value="Math.round(nodeSize.height)"
                @change="
                  setSize(node.id, {
                    height: Math.max(
                      sizeFloor.height,
                      Number(($event.target as HTMLInputElement).value),
                    ),
                  })
                "
              />
            </div>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(() => reorderNode(node!.id, 'front'))"
            >
              Bring front
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(() => reorderNode(node!.id, 'back'))"
            >
              Send back
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(duplicateSelection)"
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(removeSelection)"
            >
              Delete
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(groupSelection)"
            >
              Wrap in zone
            </Button>
            <Button
              v-if="node.type === 'zone'"
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(ungroupSelection)"
            >
              Release
            </Button>
          </div>
          <Button variant="outline" size="sm" class="w-full" @click="withCommit(lockSelection)">
            <Lock />
            Lock {{ node.type === 'zone' ? 'zone' : 'node' }} (⇧⌘L)
          </Button>
        </section>
      </template>

      <!-- ------------------------------------------------------------ edge -->
      <template v-else-if="edge">
        <section class="border-b p-3">
          <p class="text-muted-foreground truncate font-mono text-xs">
            {{ edge.source }} → {{ edge.target }}
          </p>
        </section>

        <section class="space-y-1.5 border-b p-3">
          <Label class="text-xs">Label</Label>
          <Input
            :model-value="edge.data!.label"
            class="h-8 text-sm"
            placeholder="HTTP POST /orders"
            @update:model-value="editEdgeLabel(edge.id, String($event))"
            @blur="endCoalesce()"
          />
        </section>

        <section class="space-y-3 border-b p-3">
          <div class="space-y-1.5">
            <Label class="text-xs">Route</Label>
            <SegmentedField
              :model-value="edge.data!.route"
              :options="[
                { value: 'orthogonal', label: 'Ortho' },
                { value: 'curved', label: 'Curved' },
                { value: 'straight', label: 'Straight' },
              ]"
              @update:model-value="withCommit(() => updateEdgeData(edge!.id, { route: $event as never }))"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Line</Label>
            <SegmentedField
              :model-value="edge.data!.line"
              :options="[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]"
              @update:model-value="withCommit(() => updateEdgeData(edge!.id, { line: $event as never }))"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">Arrows</Label>
            <SegmentedField
              :model-value="edge.data!.arrows"
              :options="[
                { value: 'target', label: 'End' },
                { value: 'both', label: 'Both' },
                { value: 'none', label: 'None' },
              ]"
              @update:model-value="withCommit(() => updateEdgeData(edge!.id, { arrows: $event as never }))"
            />
          </div>
        </section>

        <section class="space-y-3 border-b p-3">
          <div class="space-y-1.5">
            <Label class="text-xs">From side</Label>
            <SegmentedField
              :model-value="edge.data!.sourceSide"
              :options="SIDE_OPTIONS"
              @update:model-value="withCommit(() => updateEdgeData(edge!.id, { sourceSide: $event as never }))"
            />
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">To side</Label>
            <SegmentedField
              :model-value="edge.data!.targetSide"
              :options="SIDE_OPTIONS"
              @update:model-value="withCommit(() => updateEdgeData(edge!.id, { targetSide: $event as never }))"
            />
          </div>
        </section>

        <section class="space-y-3 border-b p-3">
          <Label class="text-xs">Colour</Label>
          <ColorSwatches
            :model-value="edge.data!.color"
            allow-default
            :default-hex="defaultEdgeHex"
            @update:model-value="withCommit(() => updateEdgeData(edge!.id, { color: $event }))"
          />
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(() => reverseEdge(edge!.id))"
            >
              Reverse
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(removeSelection)"
            >
              Delete
            </Button>
          </div>
        </section>
      </template>

      <!-- ------------------------------------------------------- selection -->
      <template v-else-if="multiple">
        <section class="border-b p-3">
          <p class="text-muted-foreground font-mono text-xs">
            {{ selectedNodes.length }} node{{ selectedNodes.length === 1 ? '' : 's' }} ·
            {{ selectedEdges.length }} connection{{ selectedEdges.length === 1 ? '' : 's' }}
          </p>
        </section>

        <section v-if="selectedNodes.length > 1" class="space-y-3 border-b p-3">
          <Label class="text-xs">Align &amp; distribute</Label>
          <div class="grid grid-cols-4 gap-1">
            <Button
              v-for="entry in ALIGNMENTS"
              :key="entry.action"
              variant="outline"
              size="icon"
              class="size-8"
              :title="entry.title"
              @click="withCommit(() => alignSelection(entry.action))"
            >
              <component :is="entry.icon" />
            </Button>
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(() => alignSelection('match-width'))"
            >
              Match width
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(() => alignSelection('match-height'))"
            >
              Match height
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="w-full"
            @click="withCommit(() => autoSizeNodes(selectedNodes.map((n) => n.id)))"
          >
            <Scaling />
            Fit to content (⇧⌘F)
          </Button>
        </section>

        <section v-if="selectedNodes.length" class="space-y-2 border-b p-3">
          <Label class="text-xs">Colour</Label>
          <ColorSwatches
            :model-value="undefined"
            @update:model-value="
              withCommit(() =>
                selectedNodes.forEach((n) => updateNodeData(n.id, { color: $event! })),
              )
            "
          />
        </section>

        <section v-if="selectedNodes.length" class="space-y-2 border-b p-3">
          <Label class="text-xs">Technology</Label>
          <CataloguePicker
            :model-value="sharedTech ?? ''"
            :groups="techGroups"
            :placeholder="sharedTech === null ? 'Mixed' : 'Not specified'"
            clear-label="No technology"
            search-placeholder="PostgreSQL, Kafka, IBM MQ…"
            @update:model-value="
              withCommit(() => selectedNodes.forEach((n) => setNodeTech(n.id, $event)))
            "
          />
        </section>

        <section class="space-y-2 p-3">
          <div class="flex gap-2">
            <Button variant="outline" size="sm" class="flex-1" @click="withCommit(groupSelection)">
              Wrap in zone
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-1"
              @click="withCommit(duplicateSelection)"
            >
              Duplicate
            </Button>
          </div>
          <Button variant="outline" size="sm" class="w-full" @click="withCommit(lockSelection)">
            <Lock />
            Lock selection (⇧⌘L)
          </Button>
          <Button variant="outline" size="sm" class="w-full" @click="withCommit(removeSelection)">
            Delete selection
          </Button>
        </section>
      </template>

      <!-- --------------------------------------------------------- diagram -->
      <template v-else>
        <section class="border-b p-3">
          <p class="text-muted-foreground font-mono text-xs">
            {{ stats.nodes }} nodes · {{ stats.zones }} zones · {{ stats.edges }} connections
          </p>
        </section>

        <section v-if="lockedCount" class="space-y-2 border-b p-3">
          <Label class="text-xs">Locked</Label>
          <Button variant="outline" size="sm" class="w-full" @click="withCommit(unlockAll)">
            <LockOpen />
            Unlock all ({{ lockedCount }})
          </Button>
        </section>

        <section class="space-y-2 border-b p-3">
          <Label class="text-xs">Export</Label>
          <Button variant="outline" size="sm" class="w-full" @click="emit('export')">
            Export diagram…
          </Button>
        </section>

        <section class="text-muted-foreground space-y-2 border-b p-3 text-xs leading-relaxed">
          <Label class="text-xs">Getting started</Label>
          <p>Drag a node from the palette onto the canvas.</p>
          <p>
            Hover a node and drag one of its dots onto another node to connect them.
          </p>
          <p>Double-click a node to rename it inline.</p>
          <p>Right-click a node, connection or the canvas for the actions that apply to it.</p>
        </section>

        <section class="space-y-2 p-3">
          <Label class="text-xs">Shortcuts</Label>
          <dl class="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">Space</kbd>-drag</dt>
            <dd>pan canvas</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">F</kbd></dt>
            <dd>fit view to content</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⇧⌘F</kbd></dt>
            <dd>size nodes to their text</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⌘G</kbd></dt>
            <dd>wrap in zone</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⇧⌘L</kbd></dt>
            <dd>lock selection</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⌘D</kbd></dt>
            <dd>duplicate</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⌘S</kbd></dt>
            <dd>download JSON</dd>
            <dt><kbd class="bg-muted rounded px-1 py-0.5 font-mono">⌫</kbd></dt>
            <dd>delete</dd>
          </dl>
        </section>
      </template>
    </div>
  </aside>
</template>
