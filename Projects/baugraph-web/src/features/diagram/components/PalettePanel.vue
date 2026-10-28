<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronRight, LayoutGrid, Search } from '@lucide/vue'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import PaletteOverviewDialog from '@/features/diagram/components/PaletteOverviewDialog.vue'
import type { PaletteGroup, PaletteItem } from '@/features/diagram/data/palette'
import { PALETTE, searchPalette } from '@/features/diagram/data/palette'
import { iconComponent } from '@/features/diagram/data/icons'
import { COLOR_HEX } from '@/features/diagram/lib/theme'
import { PALETTE_DRAG_TYPE } from '@/features/diagram/lib/drag'
import { usePlacement } from '@/features/diagram/composables/usePlacement'
import { useIndustries } from '@/features/diagram/composables/useIndustries'
import { usePaletteOverview } from '@/features/diagram/composables/usePaletteOverview'

const { place } = usePlacement()
const { isShown } = useIndustries()

const query = ref('')
const { open: overviewOpen } = usePaletteOverview()
const searching = computed(() => query.value.trim().length > 0)

/**
 * Only the building blocks. The technology catalogue — a few hundred vendors —
 * is reached from the node inspector and the canvas context menu instead; the
 * palette is a place to grab a shape, not to browse products.
 */
const groups = computed(() =>
  searchPalette(query.value).filter((group) => group.kind === 'types'),
)

/**
 * The general building blocks, then the industry packs under a heading of
 * their own. A pack hidden in Settings stays out of the list but not out of a
 * search: typing "SWIFT" finds it whichever industries are switched on.
 */
const sections = computed(() =>
  [
    { id: 'general', label: '', groups: groups.value.filter((group) => !group.industry) },
    {
      id: 'industries',
      label: 'Industries',
      groups: groups.value.filter(
        (group) => group.industry && (searching.value || isShown(group.id)),
      ),
    },
  ].filter((section) => section.groups.length),
)

/**
 * Groups start open, except the industry packs — a dozen entries each that
 * most diagrams never reach for. A search opens everything that matched.
 */
const expanded = reactive(Object.fromEntries(PALETTE.map((group) => [group.id, !group.industry])))

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
      <!-- The sidebar is too narrow to show what exists; this lays it all out. -->
      <Button
        variant="ghost"
        size="sm"
        class="text-muted-foreground h-7 w-full justify-start gap-2 px-2 text-xs group-data-[collapsible=icon]:hidden"
        @click="overviewOpen = true"
      >
        <LayoutGrid class="size-3.5" />
        Browse all palettes
        <kbd class="bg-muted ml-auto rounded px-1 font-mono text-[10px]">B</kbd>
      </Button>
    </SidebarGroupContent>
  </SidebarGroup>

  <PaletteOverviewDialog v-model:open="overviewOpen" />

  <template v-for="section in sections" :key="section.id">
    <SidebarGroup v-if="section.label" class="pb-0">
      <SidebarGroupLabel>{{ section.label }}</SidebarGroupLabel>
    </SidebarGroup>

    <SidebarGroup v-for="group in section.groups" :key="group.id" class="py-0">
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
  </template>

  <p
    v-if="!sections.length"
    class="text-muted-foreground px-4 py-2 text-xs group-data-[collapsible=icon]:hidden"
  >
    No node matches “{{ query }}”.
  </p>
</template>
