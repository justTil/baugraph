<script setup lang="ts">
import { LayoutTemplate } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HEADER_ACTIONS_SLOT_ID, HEADER_SLOT_ID } from '@/components/layout/header-slot'
import { useWorkspace } from '@/features/workspace/composables/useWorkspace'

defineProps<{
  title?: string
}>()

const { resetLayout } = useWorkspace()

function onResetLayout() {
  if (!window.confirm('Close every tab and restore the default arrangement?')) return
  resetLayout()
}
</script>

<template>
  <div class="bg-background sticky top-0 z-20 flex flex-col border-b">
    <header class="flex h-12 shrink-0 items-center gap-2 px-3">
      <SidebarTrigger class="-ml-1" />
      <Separator orientation="vertical" class="mr-1 h-4" />
      <h1 class="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">
        {{ title }}
      </h1>
      <!--
        A view's file-level actions (new/open/save/export, …) - the ones that
        belong with the app chrome rather than the toolbar row below. Empty,
        and so invisible, for views (Settings, Legal, About) that put nothing
        here; the leading/trailing separators travel with the content itself
        so none are left stranded when it's empty.
      -->
      <div :id="HEADER_ACTIONS_SLOT_ID" class="flex shrink-0 items-center gap-1" />
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="size-7" @click="onResetLayout">
            <LayoutTemplate />
            <span class="sr-only">Reset layout</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset layout</TooltipContent>
      </Tooltip>
    </header>
    <!--
      Views teleport their toolbar in here. Giving it a row of its own, instead
      of squeezing it into the app chrome above, is what keeps a toolbar as busy
      as the editor's from crowding out the title and the sidebar trigger.
      `empty:hidden` drops the row entirely for views (Settings, Legal, About)
      that put nothing here.
    -->
    <div
      :id="HEADER_SLOT_ID"
      class="flex min-w-0 items-center gap-1 border-t px-3 py-1.5 empty:hidden empty:border-t-0 empty:py-0"
    />
  </div>
</template>
