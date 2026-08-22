<script setup lang="ts">
import { ref } from 'vue'
import { ClipboardPaste, FileText, Trash2, Upload } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { DiagramParseError } from '@/model'
import { safeParse } from '@/model'
import { linkDocumentFile } from '@/features/diagram/composables/useDocumentFile'
import { ensureDocument, useDocuments } from '@/features/diagram/composables/useDocuments'
import {
  discardDocument,
  openDocumentTab,
  openDocumentTabFrom,
} from '@/features/diagram/composables/useEditorTabs'
import {
  canOverwriteFiles,
  droppedHandle,
  pickJson,
  readFile,
  slug,
} from '@/features/diagram/lib/export'

const open = defineModel<boolean>('open', { required: true })

// Closing a tab keeps the diagram; without this list there would be no way
// back to it.
const { documents } = useDocuments()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const error = ref<DiagramParseError | null>(null)
const source = ref<'upload' | 'paste'>('upload')
const pasted = ref('')

/**
 * Takes the parsed diagram into its own tab, so opening a file never puts the
 * one you were working on out of reach.
 *
 * `handle` is what makes the next save overwrite this file instead of
 * downloading a numbered copy beside it; browsers without the File System
 * Access API simply do not supply one.
 */
function adopt(text: string, handle: FileSystemFileHandle | null) {
  const result = safeParse(text)
  if (!result.ok) {
    error.value = result.error
    return
  }
  const panel = openDocumentTabFrom(result.document)
  const documentId = (panel?.params as { documentId?: string } | undefined)?.documentId
  if (handle && documentId) linkDocumentFile(documentId, handle, slug(result.document))
  open.value = false
}

async function ingest(file: File | undefined, handle: FileSystemFileHandle | null = null) {
  if (!file) return
  error.value = null
  adopt(await readFile(file), handle)
}

/** The picker hands back a handle; the file input cannot. */
async function choose() {
  error.value = null
  try {
    const picked = await pickJson()
    if (picked) adopt(picked.text, picked.handle)
  } catch {
    fileInput.value?.click()
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  // Read the handle before awaiting anything: the drag data is cleared as soon
  // as the event handler yields.
  const handle = droppedHandle(event.dataTransfer?.items?.[0])
  void handle.then((h) => ingest(file, h))
}

/** Deleting is the one thing here that cannot be undone, so it asks. */
function discard(entry: { id: string; title: string }) {
  if (!window.confirm(`Delete “${entry.title}” from this browser? This cannot be undone.`)) return
  discardDocument(entry.id)
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

/** Same pipeline as file ingestion, just fed from the textarea instead of a File. */
function loadPasted() {
  error.value = null
  adopt(pasted.value, null)
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

      <Tabs v-model="source">
        <TabsList class="w-full">
          <TabsTrigger value="upload" class="flex-1">
            <Upload class="size-3.5" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="paste" class="flex-1">
            <ClipboardPaste class="size-3.5" />
            Paste JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            class="rounded-lg border-2 border-dashed p-8 text-center transition-colors"
            :class="dragging ? 'border-primary bg-accent' : 'border-muted'"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <Upload class="text-muted-foreground mx-auto mb-3 size-6" />
            <p class="text-muted-foreground mb-3 text-sm">Drop a file here</p>
            <Button variant="outline" size="sm" @click="canOverwriteFiles ? choose() : fileInput?.click()">
              Choose file…
            </Button>
            <input
              ref="fileInput"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="onPick"
            />
          </div>
        </TabsContent>

        <TabsContent value="paste" class="space-y-2">
          <Textarea
            v-model="pasted"
            placeholder="Paste diagram JSON here…"
            class="min-h-40 font-mono text-xs"
            spellcheck="false"
          />
          <Button variant="outline" size="sm" :disabled="!pasted.trim()" @click="loadPasted">
            Load
          </Button>
        </TabsContent>
      </Tabs>

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
              @click="discard(entry)"
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
