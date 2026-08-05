<script setup lang="ts">
import { computed } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import { useNavigation } from '@/composables/useNavigation'
import { views } from '@/config/views'

const { activeItemId } = useNavigation()

const activeView = computed(() => views[activeItemId.value])
</script>

<template>
  <AppShell>
    <component :is="activeView" v-if="activeView" />
    <p v-else class="text-muted-foreground text-sm">
      Für diesen Eintrag existiert noch keine Ansicht.
    </p>
  </AppShell>
</template>
