<script setup lang="ts">
import { LayoutTemplate } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HEADER_SLOT_ID } from '@/components/layout/header-slot'
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
  <header
    class="bg-background sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b px-3"
  >
    <SidebarTrigger class="-ml-1" />
    <Separator orientation="vertical" class="mr-1 h-4" />
    <h1 class="text-muted-foreground shrink-0 text-sm font-medium">
      {{ title }}
    </h1>
    <!--
      Views teleport their toolbar in here, so the editor gets a single compact
      top bar instead of stacking a second one under the app header.
    -->
    <div :id="HEADER_SLOT_ID" class="flex min-w-0 flex-1 items-center gap-1" />
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
</template>
