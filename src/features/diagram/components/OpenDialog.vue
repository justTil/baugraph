<script setup lang="ts">
import { ref } from 'vue'
import { FileText, Trash2, Upload } from '@lucide/vue'
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
import { ensureDocument, useDocuments } from '@/features/diagram/composables/useDocuments'
import {
  discardDocument,
  openDocumentTab,
  openDocumentTabFrom,
} from '@/features/diagram/composables/useEditorTabs'
import { readFile } from '@/features/diagram/lib/export'

const open = defineModel<boolean>('open', { required: true })

// Closing a tab keeps the diagram; without this list there would be no way
// back to it.
const { documents } = useDocuments()

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
  // Its own tab, so opening a file never puts the diagram you were working on
  // out of reach.
  openDocumentTabFrom(result.document)
  open.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void ingest(event.dataTransfer?.files?.[0])
}

function openStored(id: string) {
  if (!ensureDocument(id)) {
    discardDocument(id)
    return
  }
  openDocumentTab(id)
  open.value = false
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
          Loads a <code class="font-mono text-xs">.baugraph.json</code> file into a new tab.
          Exports from the original single-file tool are converted automatically.
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

      <div v-if="documents.length" class="space-y-2">
        <p class="text-muted-foreground text-xs font-medium">Stored in this browser</p>
        <ul class="max-h-48 space-y-1 overflow-y-auto">
          <li v-for="entry in documents" :key="entry.id" class="flex items-center gap-1">
            <button
              type="button"
              class="hover:bg-accent flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
              @click="openStored(entry.id)"
            >
              <FileText class="text-muted-foreground size-3.5 shrink-0" />
              <span class="truncate">{{ entry.title }}</span>
            </button>
            <button
              type="button"
              class="text-muted-foreground hover:bg-accent hover:text-destructive grid size-7 shrink-0 place-items-center rounded"
              :aria-label="`Delete ${entry.title}`"
              @click="discardDocument(entry.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </li>
        </ul>
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
