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

const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  (e: 'save' | 'discard' | 'cancel'): void
}>()

/** Escape and the overlay mean "not now", not "throw the changes away". */
function onOpenChange(open: boolean) {
  if (!open) emit('cancel')
}
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Save “{{ props.title }}” before closing?</DialogTitle>
        <DialogDescription>
          It has changes that are not in a file yet. The diagram stays in this browser either
          way — you can reopen it from Open — but the JSON you commit will not have them.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter class="sm:justify-between">
        <Button variant="ghost" @click="emit('cancel')">Cancel</Button>
        <div class="flex gap-2">
          <Button variant="outline" @click="emit('discard')">Close without saving</Button>
          <Button @click="emit('save')">Download and close</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
