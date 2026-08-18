<script setup lang="ts">
import type { IDockviewPanelProps } from 'dockview-vue'
import { computed, onBeforeUnmount, provide, ref } from 'vue'
import { views } from '@/config/views'
import type { PanelParams } from '@/features/workspace/composables/useWorkspace'
import { PANEL_CONTEXT } from '@/features/workspace/composables/usePanel'

/**
 * dockview hands the whole renderer payload in as a single `params` prop, so
 * the view's own params sit one level down at `params.params`.
 */
const props = defineProps<{ params: IDockviewPanelProps<PanelParams> }>()

const panelApi = props.params.api
const viewId = props.params.params.viewId

const view = computed(() => views[viewId])

const isVisible = ref(panelApi.isVisible)
const isActive = ref(panelApi.isActive)

const subscriptions = [
  panelApi.onDidVisibilityChange((event) => (isVisible.value = event.isVisible)),
  panelApi.onDidActiveChange((event) => (isActive.value = event.isActive)),
]
onBeforeUnmount(() => subscriptions.forEach((s) => s.dispose()))

provide(PANEL_CONTEXT, {
  viewId,
  isVisible,
  isActive,
  api: panelApi,
  containerApi: props.params.containerApi,
})
</script>

<template>
  <!-- Views own their padding; the editor needs the full bleed. -->
  <div class="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <component :is="view" v-if="view" />
    <p v-else class="text-muted-foreground p-6 text-sm">
      Für diesen Eintrag existiert noch keine Ansicht.
    </p>
  </div>
</template>
