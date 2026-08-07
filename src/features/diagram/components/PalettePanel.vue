<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronRight, Search } from '@lucide/vue'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Input } from '@/components/ui/input'
import type { PaletteGroup, PaletteItem } from '@/features/diagram/data/palette'
import { PALETTE, searchPalette } from '@/features/diagram/data/palette'
import { iconComponent } from '@/features/diagram/data/icons'
import { COLOR_HEX } from '@/features/diagram/lib/theme'
import { PALETTE_DRAG_TYPE } from '@/features/diagram/lib/drag'
import { usePlacement } from '@/features/diagram/composables/usePlacement'

const { place } = usePlacement()

const query = ref('')
const searching = computed(() => query.value.trim().length > 0)

/**
 * Only the building blocks. The technology catalogue — a few hundred vendors —
 * is reached from the node inspector and the canvas context menu instead; the
 * palette is a place to grab a shape, not to browse products.
 */
const groups = computed(() =>
  searchPalette(query.value).filter((group) => group.kind === 'types'),
)

/** Groups start open; a search opens everything that matched. */
const expanded = reactive(Object.fromEntries(PALETTE.map((group) => [group.id, true])))

const isOpen = (group: PaletteGroup) => searching.value || expanded[group.id]

function toggle(group: PaletteGroup, open: boolean) {
  if (!searching.value) expanded[group.id] = open
}

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
    <details
      class="group/palette"
      :open="isOpen(group)"
      @toggle="toggle(group, ($event.target as HTMLDetailsElement).open)"
    >
      <SidebarGroupLabel
        as="summary"
        class="cursor-pointer list-none gap-1 text-[10px] tracking-wider uppercase [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          class="size-3 transition-transform group-open/palette:rotate-90"
        />
        {{ group.label }}
        <span class="text-sidebar-foreground/40 ml-auto normal-case">{{ group.items.length }}</span>
      </SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-for="item in group.items" :key="`${item.type}:${item.tech ?? ''}`">
            <SidebarMenuButton
              size="sm"
              :tooltip="item.label"
              class="cursor-grab active:cursor-grabbing"
              draggable="true"
              @dragstart="onDragStart($event, item)"
              @click="place(item)"
            >
              <component
                :is="iconComponent(item.listIcon || item.icon) ?? 'span'"
                class="size-4 shrink-0"
                :style="{ color: COLOR_HEX[item.color] }"
              />
              <span class="truncate">{{ item.label }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </details>
  </SidebarGroup>

  <p
    v-if="!groups.length"
    class="text-muted-foreground px-4 py-2 text-xs group-data-[collapsible=icon]:hidden"
  >
    No node matches “{{ query }}”.
  </p>
</template>
