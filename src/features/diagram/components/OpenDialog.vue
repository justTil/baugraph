<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { DiagramParseError } from '@/model'
import { safeParse } from '@/model'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { readFile } from '@/features/diagram/lib/export'

const open = defineModel<boolean>('open', { required: true })

const { loadDocument } = useDiagram()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const error = ref<DiagramParseError | null>(null)

async function ingest(file: File | undefined) {
  if (!file) return
  error.value = null
  const result = safeParse(await readFile(file))
  if (!result.ok) {
    error.value = result.error
    return
  }
  loadDocument(result.document)
  open.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void ingest(event.dataTransfer?.files?.[0])
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  void ingest(input.files?.[0])
  input.value = ''
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Open a diagram</DialogTitle>
        <DialogDescription>
          Loads a <code class="font-mono text-xs">.baugraph.json</code> file. Exports from the
          original single-file tool are converted automatically.
        </DialogDescription>
      </DialogHeader>

      <div
        class="rounded-lg border-2 border-dashed p-8 text-center transition-colors"
        :class="dragging ? 'border-primary bg-accent' : 'border-muted'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <Upload class="text-muted-foreground mx-auto mb-3 size-6" />
        <p class="text-muted-foreground mb-3 text-sm">Drop a file here</p>
        <Button variant="outline" size="sm" @click="fileInput?.click()">Choose file…</Button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="onPick"
        />
      </div>

      <div v-if="error" class="space-y-2">
        <p class="text-destructive text-sm font-medium">{{ error.message }}</p>
        <ul
          v-if="error.issues.length"
          class="text-muted-foreground max-h-40 space-y-1 overflow-y-auto font-mono text-xs"
        >
          <li v-for="issue in error.issues" :key="`${issue.path}:${issue.message}`">
            <span class="text-foreground">{{ issue.path }}</span> — {{ issue.message }}
          </li>
        </ul>
      </div>
    </DialogContent>
  </Dialog>
</template>
