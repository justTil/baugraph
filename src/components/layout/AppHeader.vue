<script setup lang="ts">
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { HEADER_SLOT_ID } from '@/components/layout/header-slot'

defineProps<{
  title?: string
}>()
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
  </header>
</template>
