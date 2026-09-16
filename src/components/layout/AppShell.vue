<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useAppTheme } from '@/composables/useAppTheme'
import { useNavigation } from '@/composables/useNavigation'
import { usePresentation } from '@/features/workspace/composables/usePresentation'

const { activeItem } = useNavigation()
const { presenting } = usePresentation()
useAppTheme()
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset class="h-svh overflow-hidden">
      <AppHeader :title="activeItem?.label" />
      <!--
        Views own their padding; the editor needs the full bleed. Presenting
        lifts it out of the sidebar/header layout entirely and over the top of
        both, rather than fighting their own sizing — simplest way to get a
        chrome-free, full-viewport view of whatever a view puts here.
      -->
      <main
        class="flex min-h-0 flex-1 flex-col"
        :class="presenting ? 'bg-background fixed inset-0 z-50' : ''"
      >
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
