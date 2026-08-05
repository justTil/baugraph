<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Input } from '@/components/ui/input'
import type { PaletteItem } from '@/features/diagram/data/palette'
import { PALETTE } from '@/features/diagram/data/palette'
import { iconComponent } from '@/features/diagram/data/icons'
import { COLOR_HEX } from '@/features/diagram/lib/theme'
import { PALETTE_DRAG_TYPE } from '@/features/diagram/lib/drag'
import { usePlacement } from '@/features/diagram/composables/usePlacement'

const { place } = usePlacement()

const query = ref('')

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return PALETTE
  return PALETTE.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
    ),
  })).filter((group) => group.items.length > 0)
})

function onDragStart(event: DragEvent, item: PaletteItem) {
  if (!event.dataTransfer) return
  event.dataTransfer.setData(PALETTE_DRAG_TYPE, JSON.stringify(item))
  event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Palette</SidebarGroupLabel>
    <SidebarGroupContent>
      <div class="relative px-1 pb-1 group-data-[collapsible=icon]:hidden">
        <Search
          class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
        />
        <Input
          v-model="query"
          placeholder="Search nodes…"
          spellcheck="false"
          class="h-8 pl-8 text-xs"
        />
      </div>
    </SidebarGroupContent>
  </SidebarGroup>

  <SidebarGroup v-for="group in groups" :key="group.id" class="py-0">
    <SidebarGroupLabel class="text-[10px] tracking-wider uppercase">
      {{ group.label }}
    </SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in group.items" :key="item.label">
          <SidebarMenuButton
            size="sm"
            :tooltip="item.label"
            class="cursor-grab active:cursor-grabbing"
            draggable="true"
            @dragstart="onDragStart($event, item)"
            @click="place(item)"
          >
            <component
              :is="iconComponent(item.icon) ?? 'span'"
              class="size-4 shrink-0"
              :style="{ color: COLOR_HEX[item.color] }"
            />
            <span class="truncate">{{ item.label }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>

  <p
    v-if="!groups.length"
    class="text-muted-foreground px-4 py-2 text-xs group-data-[collapsible=icon]:hidden"
  >
    No node matches “{{ query }}”.
  </p>
</template>
