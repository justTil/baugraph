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
    <SidebarInset>
      <AppHeader :title="activeItem?.label">
        <template #actions>
          <slot name="header-actions" />
        </template>
      </AppHeader>
      <main class="flex flex-1 flex-col gap-4 p-4">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
