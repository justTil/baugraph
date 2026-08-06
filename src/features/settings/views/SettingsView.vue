<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { SCHEMA_URL } from '@/model'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'

const { canvas, clearPersisted } = useDiagram()

function forgetLocalCopy() {
  if (!window.confirm('Remove the autosaved diagram from this browser?')) return
  clearPersisted()
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <CardTitle>Canvas</CardTitle>
        <CardDescription>Stored with the diagram, not with the browser.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label>Theme</Label>
          <SegmentedField
            :model-value="canvas.theme"
            :options="[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]"
            @update:model-value="canvas.theme = $event as 'light' | 'dark'"
          />
        </div>
        <div class="space-y-2">
          <Label>Grid pitch</Label>
          <SegmentedField
            :model-value="String(canvas.snapSize)"
            :options="[
              { value: '5', label: '5' },
              { value: '10', label: '10' },
              { value: '20', label: '20' },
            ]"
            @update:model-value="canvas.snapSize = Number($event)"
          />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>File format</CardTitle>
        <CardDescription>
          Diagrams are plain JSON, meant to be committed alongside the code they describe.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <p class="text-muted-foreground">
          Every export validates against the bundled JSON Schema. Point your editor at it to get
          completion and inline validation while hand-editing a diagram.
        </p>
        <Button as="a" variant="outline" size="sm" :href="SCHEMA_URL" target="_blank">
          View JSON Schema
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Local autosave</CardTitle>
        <CardDescription>
          The current diagram is kept in this browser so a reload does not lose work.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" @click="forgetLocalCopy">
          Clear autosaved copy
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
