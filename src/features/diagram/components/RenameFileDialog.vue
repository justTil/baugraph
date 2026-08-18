<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { RenamePrompt } from '@/features/diagram/composables/useDocumentFile'
import {
  cancelRename,
  keepFileName,
  saveUnderNewName,
} from '@/features/diagram/composables/useDocumentFile'

const props = defineProps<{
  prompt: RenamePrompt | null
}>()

function onOpenChange(open: boolean) {
  if (!open) cancelRename()
}
</script>

<template>
  <Dialog :open="!!props.prompt" @update:open="onOpenChange">
    <DialogContent v-if="props.prompt" class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>The file cannot be renamed</DialogTitle>
        <DialogDescription>
          You renamed the diagram, but the browser will not rename
          <span class="text-foreground font-mono text-xs">{{ props.prompt.currentName }}</span>
          on disk. Saving under the new name writes a second file —
          <span class="text-foreground font-mono text-xs">{{ props.prompt.suggestedName }}</span>
          — and leaves the old one where it is.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter class="sm:justify-between">
        <Button variant="ghost" @click="cancelRename()">Cancel</Button>
        <div class="flex gap-2">
          <!-- Answered once per file: renaming the diagram again will not ask. -->
          <Button variant="outline" @click="keepFileName()">Keep the old name</Button>
          <Button @click="saveUnderNewName()">Save as a new file…</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
