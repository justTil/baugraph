<script setup lang="ts">
import { computed } from 'vue'
import {
  Grid3x3,
  Magnet,
  Maximize,
  Moon,
  Redo2,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { useCanvas } from '@/features/diagram/composables/useCanvas'

const emit = defineEmits<{
  (e: 'new' | 'open' | 'export' | 'help'): void
}>()

const { meta, canvas, canUndo, canRedo, undo, redo, commit, endCoalesce } = useDiagram()
const { zoomIn, zoomOut, fitView, viewport } = useCanvas()

const zoomLabel = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

function onTitleInput() {
  commit('meta.title')
}
</script>

<template>
  <Input
    :model-value="meta.title"
    class="h-8 w-56 shrink-0 border-transparent text-sm font-medium shadow-none hover:border-input focus-visible:border-input"
    placeholder="Untitled diagram"
    spellcheck="false"
    @update:model-value="meta.title = String($event)"
    @input="onTitleInput"
    @blur="endCoalesce()"
  />

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
    <Button variant="outline" size="sm" class="h-8" @click="emit('export')">Export</Button>
    <Button variant="ghost" size="icon" class="size-8" title="Help (?)" @click="emit('help')">
      ?
    </Button>
  </div>
</template>
