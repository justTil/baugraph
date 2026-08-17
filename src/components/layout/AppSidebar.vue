<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { useNavigation } from '@/composables/useNavigation'
import PalettePanel from '@/features/diagram/components/PalettePanel.vue'

const { groups, isActive, setActiveItem, activeItemId } = useNavigation()
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
            <!--
              Wordmark: "BG" in the UI sans. public/favicon.svg carries the same
              two letters as outlines and still needs redrawing to match Geist.
            -->
            <div
              class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-sans text-[13px] leading-none font-bold tracking-tight"
            >
              BG
            </div>
            <div class="grid flex-1 text-left leading-tight">
              <span class="truncate font-semibold">Baugraph</span>
              <span class="text-muted-foreground truncate text-xs">Architecture diagrams</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup v-for="group in groups" :key="group.id">
        <SidebarGroupLabel v-if="group.label">
          {{ group.label }}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in group.items" :key="item.id">
              <SidebarMenuButton
                :is-active="isActive(item.id)"
                :disabled="item.disabled"
                :tooltip="item.label"
                @click="setActiveItem(item.id)"
              >
                <component :is="item.icon" v-if="item.icon" />
                <span>{{ item.label }}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge v-if="item.badge">
                {{ item.badge }}
              </SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <!-- The palette is only meaningful while the editor is on screen. -->
      <template v-if="activeItemId === 'editor'">
        <SidebarSeparator />
        <PalettePanel />
      </template>
    </SidebarContent>

    <SidebarFooter>
      <div class="text-muted-foreground px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
        Drag a node onto the canvas, or click it to drop it in the centre.
      </div>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
