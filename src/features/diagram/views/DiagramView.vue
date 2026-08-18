<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { HEADER_SLOT_SELECTOR } from '@/components/layout/header-slot'
import { usePanel } from '@/features/workspace/composables/usePanel'
import {
  DOCUMENT_ID,
  claimActiveDocument,
  diagramStore,
  setActiveDocument,
  useIsActiveDocument,
} from '@/features/diagram/composables/useDiagram'
import { rememberDocument } from '@/features/diagram/composables/useDocuments'
import {
  newDocumentTab,
  renameDocumentTab,
  resolveCloseRequest,
  useCloseRequest,
} from '@/features/diagram/composables/useEditorTabs'
import CloseDocumentDialog from '@/features/diagram/components/CloseDocumentDialog.vue'
import RenameFileDialog from '@/features/diagram/components/RenameFileDialog.vue'
import DiagramCanvas from '@/features/diagram/components/DiagramCanvas.vue'
import DiagramToolbar from '@/features/diagram/components/DiagramToolbar.vue'
import InspectorPanel from '@/features/diagram/components/InspectorPanel.vue'
import ExportDialog from '@/features/diagram/components/ExportDialog.vue'
import FlowsDialog from '@/features/diagram/components/FlowsDialog.vue'
import HelpDialog from '@/features/diagram/components/HelpDialog.vue'
import NewDocumentDialog from '@/features/diagram/components/NewDocumentDialog.vue'
import OpenDialog from '@/features/diagram/components/OpenDialog.vue'
import {
  hydrateDocumentFile,
  saveDocument,
  saveDocumentAs,
  useDocumentFile,
  useRenamePrompt,
} from '@/features/diagram/composables/useDocumentFile'

// Docked views stay mounted behind their tab, and several can share the screen,
// so this view has to know which panel it is in before it knows anything else.
const { params, isActive } = usePanel()
// Typed up front: the template is compiled apart from this block and would not
// otherwise see the guard below narrow it.
const documentId: string = params?.documentId ?? ''
if (!documentId) throw new Error('The diagram view can only be opened on a document')

/**
 * Every part of the editor below this point — including the toolbar teleported
 * into the app header — resolves its store from here, so a second tab editing a
 * second diagram never reaches into this one.
 */
provide(DOCUMENT_ID, documentId)

const { meta } = diagramStore(documentId)

// Closing a tab with edits that are not in a file yet asks first; the question
// is raised by the tab, and answered here because this is what can write it.
const { pendingClose } = useCloseRequest()
const { fileName } = useDocumentFile(documentId)

// Raised by a save that found the diagram renamed and the file unrenameable.
const { pendingRename } = useRenamePrompt()
const renaming = computed(() =>
  pendingRename.value?.documentId === documentId ? pendingRename.value : null,
)
const closing = computed(() => pendingClose.value === documentId)

/**
 * The app header holds one toolbar and several editors can share the screen, so
 * only the document the rest of the app is pointed at fills it — and answers
 * the save shortcut.
 */
const owns = useIsActiveDocument(documentId)

const exportOpen = ref(false)
const helpOpen = ref(false)
const openOpen = ref(false)
const newOpen = ref(false)
const mounted = ref(false)

onMounted(() => {
  mounted.value = true
  claimActiveDocument(documentId)
  // A file this diagram was saved to in an earlier session, so ⌘S goes back to
  // it rather than starting a second copy beside it.
  void hydrateDocumentFile(documentId)
  window.addEventListener('keydown', onSave)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onSave))

// The palette in the sidebar and the settings view sit outside every panel;
// this is what points them at the diagram the user is actually working on.
// Sticky: clicking into the settings tab must not leave them without a target.
watch(isActive, (active) => active && setActiveDocument(documentId), { immediate: true })

// The tab is labelled by the diagram it holds, so renaming one renames the other.
watch(
  () => meta.title,
  (title) => {
    renameDocumentTab(documentId, title)
    rememberDocument(documentId, title)
  },
)

/** ⌘S saves the source file rather than letting the browser save the page. */
function onSave(event: KeyboardEvent) {
  if (!owns.value) return
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  void (event.shiftKey ? saveDocumentAs(documentId) : saveDocument(documentId))
}

/**
 * Closing waits on the save: a picker the user backs out of must leave the tab
 * where it was rather than taking the answer as "yes, close it".
 */
async function saveAndClose() {
  if (await saveDocument(documentId)) resolveCloseRequest(documentId, true)
}
</script>

<template>
  <Teleport v-if="mounted && owns" :to="HEADER_SLOT_SELECTOR">
    <DiagramToolbar
      @new="newOpen = true"
      @open="openOpen = true"
      @save="saveDocument(documentId)"
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

  <CloseDocumentDialog
    :open="closing"
    :title="meta.title"
    :file-name="fileName"
    @save="saveAndClose"
    @discard="resolveCloseRequest(documentId, true)"
    @cancel="resolveCloseRequest(documentId, false)"
  />

  <RenameFileDialog :prompt="renaming" />

  <!-- A new diagram is a new tab, so this one is left exactly as it was. -->
  <NewDocumentDialog v-model:open="newOpen" @create="newDocumentTab($event)" />
  <ExportDialog v-model:open="exportOpen" />
  <OpenDialog v-model:open="openOpen" />
  <HelpDialog v-model:open="helpOpen" />
</template>
