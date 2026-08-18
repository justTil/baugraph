<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useActiveDiagram } from '@/features/diagram/composables/useDiagram'
import { useDocuments } from '@/features/diagram/composables/useDocuments'
import { discardAllDocuments } from '@/features/diagram/composables/useEditorTabs'
import { SCHEMA_URL } from '@/model'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'

// The settings sit in their own tab, so "the diagram" means whichever editor
// the user last worked in - and there may be none open at all.
const diagram = useActiveDiagram()
const { documents } = useDocuments()

function forgetLocalCopies() {
  if (!window.confirm(`Remove all ${documents.value.length} autosaved diagrams from this browser?`))
    return
  discardAllDocuments()
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <CardTitle>Canvas</CardTitle>
        <CardDescription>
          Stored with the diagram, not with the browser — these apply to
          <span class="text-foreground font-medium">{{ diagram?.meta.title ?? 'no open diagram' }}</span
          >.
        </CardDescription>
      </CardHeader>
      <CardContent v-if="diagram" class="space-y-4">
        <div class="space-y-2">
          <Label>Theme</Label>
          <SegmentedField
            :model-value="diagram.canvas.theme"
            :options="[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]"
            @update:model-value="diagram.canvas.theme = $event as 'light' | 'dark'"
          />
        </div>
        <div class="space-y-2">
          <Label>Grid pitch</Label>
          <SegmentedField
            :model-value="String(diagram.canvas.snapSize)"
            :options="[
              { value: '5', label: '5' },
              { value: '10', label: '10' },
              { value: '20', label: '20' },
            ]"
            @update:model-value="diagram.canvas.snapSize = Number($event)"
          />
        </div>
      </CardContent>
      <CardContent v-else class="text-muted-foreground text-sm">
        Open a diagram to change how its canvas is drawn.
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
          Every open diagram is kept in this browser, so a reload does not lose work.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <ul v-if="documents.length" class="text-muted-foreground space-y-1">
          <li v-for="entry in documents" :key="entry.id" class="font-mono text-xs">
            {{ entry.title }}
          </li>
        </ul>
        <p v-else class="text-muted-foreground">Nothing stored yet.</p>
        <Button
          variant="outline"
          size="sm"
          :disabled="!documents.length"
          @click="forgetLocalCopies"
        >
          Clear autosaved copies
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
