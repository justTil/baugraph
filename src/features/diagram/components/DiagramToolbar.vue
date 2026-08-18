<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Grid3x3,
  Magnet,
  Maximize,
  Moon,
  Pause,
  Pencil,
  Play,
  Redo2,
  Sun,
  Undo2,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useFlows } from '@/features/diagram/composables/useFlows'
import { useCanvas } from '@/features/diagram/composables/useCanvas'
import { useDocumentFile } from '@/features/diagram/composables/useDocumentFile'

const emit = defineEmits<{
  (e: 'new' | 'open' | 'save' | 'export' | 'help'): void
}>()

const { documentId, meta, canvas, flows, canUndo, canRedo, dirty, undo, redo, commit, endCoalesce } =
  useDiagram()
const { canOverwriteFiles, fileName } = useDocumentFile(documentId)

/** What ⌘S will do, so the button can say it before it is pressed. */
const saveHint = computed(() => {
  const target = !canOverwriteFiles
    ? 'Download the source file'
    : fileName.value
      ? `Save to ${fileName.value}`
      : 'Save to a file…'
  return dirty.value ? `${target} — unsaved changes (⌘S)` : `${target} (⌘S)`
})
const { paused, openFlowEditor } = useFlows()
const { zoomIn, zoomOut, fitView, viewport } = useCanvas()

const zoomLabel = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

function onTitleInput() {
  commit('meta.title')
}

/**
 * Bound rather than left to `group-focus-within`: the pointer is still over the
 * field after a click, and Tailwind's variant order lets the hover rule win.
 */
const editingTitle = ref(false)
</script>

<template>
  <!--
    The title reads as a heading, so nothing about it says "type here". The
    pencil is the affordance: visible at rest, brighter under the pointer, and
    out of the way once the field has focus and the caret says it all.
  -->
  <Tooltip>
    <TooltipTrigger as-child>
      <div class="group/title relative shrink-0">
        <Input
          :model-value="meta.title"
          class="hover:border-input focus-visible:border-input h-8 w-56 border-transparent pr-8 text-sm font-medium shadow-none"
          placeholder="Untitled diagram"
          spellcheck="false"
          aria-label="Diagram name"
          @update:model-value="meta.title = String($event)"
          @input="onTitleInput"
          @focus="editingTitle = true"
          @blur="editingTitle = false, endCoalesce()"
        />
        <Pencil
          v-show="!editingTitle"
          class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 opacity-50 transition-opacity group-hover/title:opacity-100"
        />
      </div>
    </TooltipTrigger>
    <TooltipContent>Rename this diagram</TooltipContent>
  </Tooltip>

  <Separator orientation="vertical" class="mx-1 h-4" />

  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8" :disabled="!canUndo" @click="undo()">
        <Undo2 />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Undo (⌘Z)</TooltipContent>
  </Tooltip>

  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8" :disabled="!canRedo" @click="redo()">
        <Redo2 />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
  </Tooltip>

  <Separator orientation="vertical" class="mx-1 h-4" />

  <Button variant="ghost" size="icon" class="size-8" title="Zoom out" @click="zoomOut()">
    <ZoomOut />
  </Button>
  <span class="text-muted-foreground w-11 text-center font-mono text-xs tabular-nums">
    {{ zoomLabel }}
  </span>
  <Button variant="ghost" size="icon" class="size-8" title="Zoom in" @click="zoomIn()">
    <ZoomIn />
  </Button>

  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8" @click="fitView({ padding: 0.2 })">
        <Maximize />
      </Button>
    </TooltipTrigger>
    <TooltipContent>Fit to content (F)</TooltipContent>
  </Tooltip>

  <div class="ml-auto flex items-center gap-1">
    <!--
      Flows belong to the diagram, not to anything selected on it, so this is
      where they are edited — one door, in the same place whatever is selected.
    -->
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-8" @click="openFlowEditor()">
          <Waypoints />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Message flows</TooltipContent>
    </Tooltip>

    <!--
      Only offered once there is something to stop. Freezing the messages is the
      first thing wanted while working *on* a diagram that animates.
    -->
    <Tooltip v-if="flows.length">
      <TooltipTrigger as-child>
        <Button variant="ghost" size="icon" class="size-8" @click="paused = !paused">
          <Play v-if="paused" />
          <Pause v-else />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ paused ? 'Play message flows' : 'Pause message flows' }}</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <Toggle
          size="sm"
          :model-value="canvas.snap"
          aria-label="Snap to grid"
          @update:model-value="canvas.snap = Boolean($event)"
        >
          <Magnet />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>Snap to grid</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <Toggle
          size="sm"
          :model-value="canvas.grid"
          aria-label="Show grid"
          @update:model-value="canvas.grid = Boolean($event)"
        >
          <Grid3x3 />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>Show grid</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          @click="canvas.theme = canvas.theme === 'dark' ? 'light' : 'dark'"
        >
          <Sun v-if="canvas.theme === 'dark'" />
          <Moon v-else />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Diagram theme</TooltipContent>
    </Tooltip>

    <Separator orientation="vertical" class="mx-1 h-4" />

    <Button variant="ghost" size="sm" class="h-8" @click="emit('new')">New</Button>
    <Button variant="ghost" size="sm" class="h-8" @click="emit('open')">Open</Button>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="ghost" size="sm" class="h-8" @click="emit('save')">
          Save
          <!-- A dot rather than an asterisk in the title: the file is behind,
               the diagram itself is safe in the browser either way. Hidden from
               assistive tech, which reads the tooltip instead. -->
          <span
            v-if="dirty"
            class="bg-foreground/60 ml-1.5 size-1.5 rounded-full"
            aria-hidden="true"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ saveHint }}</TooltipContent>
    </Tooltip>
    <Button variant="outline" size="sm" class="h-8" @click="emit('export')">Export</Button>
    <Button variant="ghost" size="icon" class="size-8" title="Help (?)" @click="emit('help')">
      ?
    </Button>
  </div>
</template>
