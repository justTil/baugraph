<script setup lang="ts">
import type { IDockviewPanelHeaderProps } from 'dockview-vue'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  CheckCheck,
  CircleX,
  ListX,
  X,
} from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import { navItem } from '@/config/navigation'
import type { PanelParams } from '@/features/workspace/composables/useWorkspace'
import {
  closeAllPanels,
  closeOtherPanels,
  closePanelsToTheLeft,
  closePanelsToTheRight,
  closeSavedPanels,
  requestClosePanel,
} from '@/features/workspace/composables/useWorkspace'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

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

/**
 * Where this tab sits among its siblings — read fresh each time the menu
 * opens, since dockview's group isn't reactive on its own.
 */
const siblings = ref({ hasOthers: false, hasLeft: false, hasRight: false })

function onMenuOpenChange(open: boolean) {
  if (!open) return
  const panels = panelApi.group.panels
  const index = panels.findIndex((p) => p.id === panelApi.id)
  siblings.value = {
    hasOthers: panels.length > 1,
    hasLeft: index > 0,
    hasRight: index !== -1 && index < panels.length - 1,
  }
}
</script>

<template>
  <ContextMenu @update:open="onMenuOpenChange">
    <ContextMenuTrigger as-child>
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
    </ContextMenuTrigger>

    <ContextMenuContent class="w-52">
      <ContextMenuItem @select="close()">
        <X />
        Close
      </ContextMenuItem>
      <ContextMenuItem :disabled="!siblings.hasOthers" @select="closeOtherPanels(panelApi.id)">
        <CircleX />
        Close others
      </ContextMenuItem>
      <ContextMenuItem :disabled="!siblings.hasRight" @select="closePanelsToTheRight(panelApi.id)">
        <ArrowRightToLine />
        Close to the right
      </ContextMenuItem>
      <ContextMenuItem :disabled="!siblings.hasLeft" @select="closePanelsToTheLeft(panelApi.id)">
        <ArrowLeftToLine />
        Close to the left
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem @select="closeSavedPanels()">
        <CheckCheck />
        Close saved
      </ContextMenuItem>
      <ContextMenuItem @select="closeAllPanels()">
        <ListX />
        Close all
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
