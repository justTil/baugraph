<script setup lang="ts">
import 'dockview-vue/dist/styles/dockview.css'
import type { DockviewIDisposable, DockviewReadyEvent, VueComponent } from 'dockview-vue'
import { DockviewVue } from 'dockview-vue'
import { markRaw, onBeforeUnmount } from 'vue'
import { PANEL_COMPONENT, registerDock } from '@/features/workspace/composables/useWorkspace'
import { workspacePolicy } from '@/config/workspace'
import { dockTheme } from '@/features/workspace/lib/theme'
import WorkspacePanel from '@/features/workspace/components/WorkspacePanel.vue'
import WorkspaceTab from '@/features/workspace/components/WorkspaceTab.vue'
import WorkspaceWatermark from '@/features/workspace/components/WorkspaceWatermark.vue'

// `markRaw`: these are renderer descriptors handed straight to dockview, not
// state - proxying them would break the identity checks it does internally.
//
// The cast is dockview's slot type (`DefineComponent<any>`) being contravariant
// in its props: any component that actually declares `params` fails to match it.
const renderer = (component: unknown) => markRaw(component as VueComponent)

const components = { [PANEL_COMPONENT]: renderer(WorkspacePanel) }
const tabComponent = renderer(WorkspaceTab)
const watermarkComponent = renderer(WorkspaceWatermark)

let subscriptions: DockviewIDisposable[] = []

function onReady(event: DockviewReadyEvent) {
  subscriptions = registerDock(event.api, workspacePolicy)
}

onBeforeUnmount(() => subscriptions.forEach((s) => s.dispose()))
</script>

<template>
  <DockviewVue
    class="min-h-0 flex-1"
    :components="components"
    :default-tab-component="tabComponent"
    :watermark-component="watermarkComponent"
    :theme="dockTheme"
    :hide-borders="true"
    @ready="onReady"
  />
</template>
