<script setup lang="ts">
import { Landmark } from '@lucide/vue'
import ChannelPlaceholder from '@/features/channels/components/ChannelPlaceholder.vue'
</script>

<template>
  <ChannelPlaceholder
    title="Beispiel: SWIFT"
    description="Platzhalter für den SWIFT-Kanal. Hier kommen Nachrichtentypen und Verarbeitung hin."
    :icon="Landmark"
  />
</template>
