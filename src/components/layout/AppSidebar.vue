<script setup lang="ts">
import { Boxes } from '@lucide/vue'
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
} from '@/components/ui/sidebar'
import { useNavigation } from '@/composables/useNavigation'

const { groups, isActive, setActiveItem } = useNavigation()
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
            <div class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <Boxes class="size-4" />
            </div>
            <div class="grid flex-1 text-left leading-tight">
              <span class="truncate font-semibold">Luma</span>
              <span class="text-muted-foreground truncate text-xs">Middleware Hub</span>
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
    </SidebarContent>

    <SidebarFooter>
      <div class="text-muted-foreground px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
        Verbunden mit Staging
      </div>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
