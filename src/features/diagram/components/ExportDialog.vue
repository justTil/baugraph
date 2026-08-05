<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { exportJson, exportPng, exportSvg } from '@/features/diagram/lib/export'

const open = defineModel<boolean>('open', { required: true })

const { toDocument } = useDiagram()
const error = ref<string | null>(null)

async function run(action: () => void | Promise<void>) {
  error.value = null
  try {
    await action()
    open.value = false
  } catch (cause) {
    error.value = (cause as Error).message
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Export diagram</DialogTitle>
        <DialogDescription>
          Everything is generated in the browser — nothing is uploaded.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="space-y-2">
          <p class="text-sm font-medium">Source</p>
          <Button variant="outline" class="w-full justify-start" @click="run(() => exportJson(toDocument()))">
            <span class="font-mono text-xs">.baugraph.json</span>
            <span class="text-muted-foreground ml-2 text-xs">
              editable, diff-friendly — commit this one
            </span>
          </Button>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium">Images</p>
          <div class="grid grid-cols-2 gap-2">
            <Button variant="outline" @click="run(() => exportSvg(toDocument()))">
              SVG
            </Button>
            <Button variant="outline" @click="run(() => exportSvg(toDocument(), { transparent: true }))">
              SVG (transparent)
            </Button>
            <Button variant="outline" @click="run(() => exportPng(toDocument(), 2))">
              PNG @2×
            </Button>
            <Button variant="outline" @click="run(() => exportPng(toDocument(), 4))">
              PNG @4×
            </Button>
          </div>
        </div>

        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
