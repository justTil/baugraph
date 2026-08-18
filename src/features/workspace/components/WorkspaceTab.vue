<script setup lang="ts">
import type { IDockviewPanelHeaderProps } from 'dockview-vue'
import { X } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import { navItem } from '@/config/navigation'
import type { PanelParams } from '@/features/workspace/composables/useWorkspace'
import { requestClosePanel } from '@/features/workspace/composables/useWorkspace'

const props = defineProps<{ params: IDockviewPanelHeaderProps<PanelParams> }>()

const panelApi = props.params.api
const icon = navItem(props.params.params.viewId)?.icon

const title = ref(panelApi.title)
const subscription = panelApi.onDidTitleChange((event) => (title.value = event.title))
onBeforeUnmount(() => subscription.dispose())

/**
 * Closing by hand goes through the workspace, so a view holding unsaved work
 * gets to ask about it first. `api.close()` is the unconditional door.
 */
function close() {
  requestClosePanel(panelApi.id)
}

/** Middle-click closes, the way it does in every other tabbed workspace. */
function onPointerDown(event: PointerEvent) {
  if (event.button !== 1) return
  event.preventDefault()
  close()
}
</script>

<template>
  <div
    class="group/tab flex h-full w-full items-center gap-2 px-3 text-[13px] select-none"
    @pointerdown="onPointerDown"
  >
    <component :is="icon" v-if="icon" class="size-3.5 shrink-0 opacity-70" />
    <span class="truncate">{{ title }}</span>
    <button
      type="button"
      class="hover:bg-accent hover:text-accent-foreground -mr-1.5 grid size-5 shrink-0 place-items-center rounded opacity-0 transition-opacity group-hover/tab:opacity-70 focus-visible:opacity-100 hover:opacity-100"
      :aria-label="`Close ${title}`"
      @pointerdown.stop
      @click.stop="close()"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
