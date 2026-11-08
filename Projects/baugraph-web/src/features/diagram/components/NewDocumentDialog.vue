<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  (e: 'create', title: string): void
}>()

const title = ref('')
const field = ref<InstanceType<typeof Input> | null>(null)

// Each new diagram starts from a clean field, focused and selected so the
// suggestion can be typed straight over.
watch(open, async (isOpen) => {
  if (!isOpen) return
  title.value = 'Untitled diagram'
  await nextTick()
  const el = field.value?.$el as HTMLInputElement | undefined
  el?.focus()
  el?.select()
})

function submit() {
  const name = title.value.trim()
  if (!name) return
  emit('create', name)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>New diagram</DialogTitle>
        <DialogDescription>
          Opens in its own tab. The name labels the tab and travels with the file.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-2" @submit.prevent="submit">
        <Label for="new-diagram-title">Name</Label>
        <Input id="new-diagram-title" ref="field" v-model="title" autocomplete="off" />
      </form>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button :disabled="!title.trim()" @click="submit">Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
