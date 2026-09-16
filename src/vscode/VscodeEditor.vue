<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { FileJson, TriangleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import {
  HEADER_ACTIONS_SLOT_ID,
  HEADER_SLOT_ID,
  HEADER_SLOT_SELECTOR,
} from '@/components/layout/header-slot'
import { DOCUMENT_ID } from '@/features/diagram/composables/useDiagram'
import DiagramCanvas from '@/features/diagram/components/DiagramCanvas.vue'
import DiagramToolbar from '@/features/diagram/components/DiagramToolbar.vue'
import InspectorPanel from '@/features/diagram/components/InspectorPanel.vue'
import PalettePanel from '@/features/diagram/components/PalettePanel.vue'
import ExportDialog from '@/features/diagram/components/ExportDialog.vue'
import FlowsDialog from '@/features/diagram/components/FlowsDialog.vue'
import HelpDialog from '@/features/diagram/components/HelpDialog.vue'
import { usePresentation } from '@/features/workspace/composables/usePresentation'
import { VSCODE_DOCUMENT_ID, post, useVscodeDocument } from '@/vscode/bridge'

/**
 * The editor as VS Code sees it: one file, one canvas, no tabs.
 *
 * Everything below the shell is the same component tree the web app mounts —
 * the canvas, the inspector, the toolbar, the palette — so a feature lands in
 * both at once. What is missing is everything that only makes sense in a
 * browser tab: the document index, the dock, the open/new dialogs, and the
 * File System Access plumbing. VS Code already has all of those.
 */
provide(DOCUMENT_ID, VSCODE_DOCUMENT_ID)

const { store, ready, editable, dark, fileName, parseError, save } = useVscodeDocument()
const { presenting } = usePresentation()

const exportOpen = ref(false)
const helpOpen = ref(false)
/** The toolbar teleports into the header, which has to exist before it mounts. */
const mounted = ref(false)

// The chrome's own styling isn't reached by `useAppTheme` (see `main.ts`),
// which only drives the shared component tree, so it still needs this.
watch(dark, (on) => document.documentElement.classList.toggle('dark', on), { immediate: true })

/**
 * ⌘S is handled here rather than left to VS Code: the webview has the keyboard
 * while the canvas is focused, and the save has to flush the pending edit into
 * the document before the document is written.
 */
function onKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  save()
}

onMounted(() => {
  mounted.value = true
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <SidebarProvider class="h-screen min-h-0">
    <Sidebar v-if="!presenting" collapsible="icon">
      <SidebarContent>
        <PalettePanel />
      </SidebarContent>
    </Sidebar>

    <div class="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
      <!--
        Presentation mode drops the webview's own chrome too, the same as the
        nav and header it stands in for on the web — just the canvas is left
        to share.

        Both slot targets stay mounted regardless — `v-show` rather than
        `v-if`/`v-else` — since the toolbar's own Teleport below reaches for
        them by id: swapping in a freshly mounted element with the same id
        would leave whatever was already teleported in behind, stranded on
        the discarded one.
      -->
      <header v-show="!presenting" class="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <SidebarTrigger class="size-7" />
        <span class="text-muted-foreground truncate font-mono text-xs">
          {{ fileName }}
          <span v-if="store.dirty.value" aria-hidden="true">•</span>
        </span>
        <div :id="HEADER_ACTIONS_SLOT_ID" class="ml-auto flex items-center gap-1" />
      </header>

      <div
        v-show="!presenting"
        :id="HEADER_SLOT_ID"
        class="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1"
      />

      <!--
        Only once the file has been read: the canvas would otherwise mount on a
        blank diagram and fit the view to it, which then reads as the file's own
        starting viewport.
      -->
      <main v-if="ready && !parseError" class="flex min-h-0 flex-1">
        <DiagramCanvas @export="exportOpen = true" />
        <InspectorPanel v-if="!presenting" @export="exportOpen = true" />
      </main>

      <!--
        A file this build cannot read is left exactly as it is. Nothing is
        written back, and the text editor — which has the schema, and the line
        numbers these issues point at — is one button away.
      -->
      <div v-else-if="parseError" class="flex min-h-0 flex-1 flex-col gap-3 p-6">
        <div class="flex items-center gap-2">
          <TriangleAlert class="text-destructive size-4 shrink-0" />
          <h1 class="text-sm font-semibold">{{ parseError.message }}</h1>
        </div>
        <ul
          v-if="parseError.issues.length"
          class="text-muted-foreground max-h-64 space-y-1 overflow-y-auto font-mono text-xs"
        >
          <li v-for="issue in parseError.issues" :key="`${issue.path}:${issue.message}`">
            <span class="text-foreground">{{ issue.path }}</span> — {{ issue.message }}
          </li>
        </ul>
        <div>
          <Button size="sm" variant="outline" @click="post({ type: 'command', command: 'openSource' })">
            <FileJson />
            Open as text
          </Button>
        </div>
      </div>

      <div v-else class="text-muted-foreground flex flex-1 items-center justify-center text-xs">
        Opening…
      </div>
    </div>

    <!-- The toolbar fills the row above, the way it fills the app header on the web. -->
    <Teleport v-if="mounted && ready && !parseError" :to="HEADER_SLOT_SELECTOR">
      <DiagramToolbar
        @new="post({ type: 'command', command: 'new' })"
        @open="post({ type: 'command', command: 'open' })"
        @save="save()"
        @export="exportOpen = true"
        @help="helpOpen = true"
      />
    </Teleport>

    <template v-if="ready && !parseError">
      <!-- Opens itself: both the toolbar and a connection's inspector reach for it. -->
      <FlowsDialog />
      <ExportDialog v-model:open="exportOpen" />
      <HelpDialog v-model:open="helpOpen" />
    </template>

    <!-- A read-only document (a diff, a file in a virtual workspace) still opens. -->
    <div
      v-if="ready && !editable"
      class="bg-muted text-muted-foreground pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1 text-xs"
    >
      Read-only — changes will not be written
    </div>
  </SidebarProvider>
</template>
