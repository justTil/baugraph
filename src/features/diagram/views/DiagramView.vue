<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { HEADER_SLOT_SELECTOR } from '@/components/layout/header-slot'
import { usePanel } from '@/features/workspace/composables/usePanel'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import DiagramCanvas from '@/features/diagram/components/DiagramCanvas.vue'
import DiagramToolbar from '@/features/diagram/components/DiagramToolbar.vue'
import InspectorPanel from '@/features/diagram/components/InspectorPanel.vue'
import ExportDialog from '@/features/diagram/components/ExportDialog.vue'
import FlowsDialog from '@/features/diagram/components/FlowsDialog.vue'
import HelpDialog from '@/features/diagram/components/HelpDialog.vue'
import OpenDialog from '@/features/diagram/components/OpenDialog.vue'
import { sampleDocument } from '@/features/diagram/data/sample'
import { exportJson } from '@/features/diagram/lib/export'
import { fontsReady } from '@/features/diagram/lib/text'
import { safeParse } from '@/model'

const { nodes, loadDocument, newDocument, toDocument, restorePersisted } = useDiagram()

// Docked views stay mounted behind their tab; the header is shared, so the
// toolbar may only claim it while this panel is actually on screen.
const { isVisible } = usePanel()

const exportOpen = ref(false)
const helpOpen = ref(false)
const openOpen = ref(false)
const mounted = ref(false)

onMounted(async () => {
  mounted.value = true
  window.addEventListener('keydown', onSave)

  // A previous session wins over the sample, but a corrupt entry must not
  // leave the user staring at an empty canvas.
  const stored = restorePersisted()
  const parsed = stored ? safeParse(stored) : null
  if (parsed?.ok) {
    loadDocument(parsed.document)
    return
  }

  // The example sizes its nodes from their own text, so it has to be built with
  // the font it will be drawn in.
  await fontsReady()
  loadDocument(sampleDocument())
})

onBeforeUnmount(() => window.removeEventListener('keydown', onSave))

/** ⌘S downloads the source file rather than letting the browser save the page. */
function onSave(event: KeyboardEvent) {
  if (!isVisible.value) return
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
  <Teleport v-if="mounted && isVisible" :to="HEADER_SLOT_SELECTOR">
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

  <!-- Opens itself: both the toolbar and a connection's inspector reach for it. -->
  <FlowsDialog />

  <ExportDialog v-model:open="exportOpen" />
  <OpenDialog v-model:open="openOpen" />
  <HelpDialog v-model:open="helpOpen" />
</template>
