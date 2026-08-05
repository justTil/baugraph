<script setup lang="ts">
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

defineProps<{
  title?: string
}>()
</script>

<template>
  <header class="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
    <SidebarTrigger class="-ml-1" />
    <Separator orientation="vertical" class="mr-2 h-4" />
    <h1 class="text-sm font-medium">
      {{ title }}
    </h1>
    <div class="ml-auto flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
