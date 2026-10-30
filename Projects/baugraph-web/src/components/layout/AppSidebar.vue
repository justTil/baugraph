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
import markLight from '@/assets/brand/baugraph-mark.svg'
import markDark from '@/assets/brand/baugraph-mark-on-dark.svg'

const { groups, isActive, isOpen, isVisible, setActiveItem } = useNavigation()

const version = __APP_VERSION__
const selfHosted = __SELF_HOSTED__
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
            <!--
              The bg mark, with its colours baked in (an <img> can't inherit
              them), so the dark theme swaps in its own file.
            -->
            <span class="flex size-8 shrink-0 items-center justify-center">
              <img :src="markLight" alt="" class="w-8 dark:hidden">
              <img :src="markDark" alt="" class="hidden w-8 dark:block">
            </span>
            <div class="grid flex-1 text-left leading-tight">
              <span class="text-navy truncate font-semibold">Baugraph</span>
              <span class="text-muted-foreground truncate text-xs">
                <template v-if="selfHosted">Self-hosted</template>
                <template v-else>Architecture diagrams</template>
              </span>
            </div>
            <span class="text-muted-foreground shrink-0 font-mono text-[11px]">v{{ version }}</span>
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
                :as="item.href ? 'a' : 'button'"
                :href="item.href"
                :target="item.href ? '_blank' : undefined"
                :rel="item.href ? 'noopener noreferrer' : undefined"
                :is-active="isActive(item.id)"
                :disabled="item.disabled"
                :tooltip="item.label"
                @click="!item.href && setActiveItem(item.id)"
              >
                <component :is="item.icon" v-if="item.icon" />
                <span>{{ item.label }}</span>
                <!--
                  A view can sit in a background tab or a split alongside the
                  focused one, which `is-active` alone cannot say.
                -->
                <span
                  v-if="isOpen(item.id) && !isActive(item.id)"
                  class="bg-sidebar-foreground/40 ml-auto size-1.5 shrink-0 rounded-full"
                  aria-hidden="true"
                />
              </SidebarMenuButton>
              <SidebarMenuBadge v-if="item.badge">
                {{ item.badge }}
              </SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <!-- The palette is only meaningful while the editor is on screen. -->
      <template v-if="isVisible('editor')">
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
