<script setup lang="ts">
import type { IWatermarkPanelProps } from 'dockview-vue'
import { LayoutTemplate } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { navigation } from '@/config/navigation'
import { openView } from '@/features/workspace/composables/useWorkspace'

defineProps<{ params: IWatermarkPanelProps }>()

const items = navigation.flatMap((group) => group.items).filter((item) => !item.disabled)
</script>

<template>
  <div class="text-muted-foreground grid h-full place-items-center p-6">
    <div class="flex max-w-xs flex-col items-center gap-3 text-center">
      <LayoutTemplate class="size-6 opacity-50" />
      <p class="text-sm">
        Nothing open here. Pick a view, or drag a tab into this area to split the workspace.
      </p>
      <div class="flex flex-wrap justify-center gap-1.5">
        <Button
          v-for="item in items"
          :key="item.id"
          variant="outline"
          size="sm"
          @click="openView(item.id)"
        >
          <component :is="item.icon" v-if="item.icon" />
          {{ item.label }}
        </Button>
      </div>
    </div>
  </div>
</template>
