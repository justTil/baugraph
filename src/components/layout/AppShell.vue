<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useNavigation } from '@/composables/useNavigation'

const { activeItem } = useNavigation()
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset class="h-svh overflow-hidden">
      <AppHeader :title="activeItem?.label" />
      <!-- Views own their padding; the editor needs the full bleed. -->
      <main class="flex min-h-0 flex-1 flex-col">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
