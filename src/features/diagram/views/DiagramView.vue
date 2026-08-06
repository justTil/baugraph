<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { HEADER_SLOT_SELECTOR } from '@/components/layout/header-slot'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import DiagramCanvas from '@/features/diagram/components/DiagramCanvas.vue'
import DiagramToolbar from '@/features/diagram/components/DiagramToolbar.vue'
import InspectorPanel from '@/features/diagram/components/InspectorPanel.vue'
import ExportDialog from '@/features/diagram/components/ExportDialog.vue'
import HelpDialog from '@/features/diagram/components/HelpDialog.vue'
import OpenDialog from '@/features/diagram/components/OpenDialog.vue'
import { sampleDocument } from '@/features/diagram/data/sample'
import { exportJson } from '@/features/diagram/lib/export'
import { safeParse } from '@/model'

const { nodes, loadDocument, newDocument, toDocument, restorePersisted } = useDiagram()

const exportOpen = ref(false)
const helpOpen = ref(false)
const openOpen = ref(false)
const mounted = ref(false)

onMounted(() => {
  mounted.value = true

  // A previous session wins over the sample, but a corrupt entry must not
  // leave the user staring at an empty canvas.
  const stored = restorePersisted()
  const parsed = stored ? safeParse(stored) : null
  loadDocument(parsed?.ok ? parsed.document : sampleDocument())

  window.addEventListener('keydown', onSave)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onSave))

/** ⌘S downloads the source file rather than letting the browser save the page. */
function onSave(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  exportJson(toDocument())
}

function onNew() {
  if (nodes.value.length && !window.confirm('Discard the current diagram and start over?')) return
  newDocument()
}
</script>

<template>
  <Teleport v-if="mounted" :to="HEADER_SLOT_SELECTOR">
    <DiagramToolbar
      @new="onNew"
      @open="openOpen = true"
      @export="exportOpen = true"
      @help="helpOpen = true"
    />
  </Teleport>

  <div class="flex min-h-0 flex-1">
    <DiagramCanvas @export="exportOpen = true" />
    <InspectorPanel @export="exportOpen = true" />
  </div>

  <ExportDialog v-model:open="exportOpen" />
  <OpenDialog v-model:open="openOpen" />
  <HelpDialog v-model:open="helpOpen" />
</template>
