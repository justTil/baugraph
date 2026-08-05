<script setup lang="ts">
import { MessageSquare, Send } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import ChannelPlaceholder from '@/features/channels/components/ChannelPlaceholder.vue'
import LumaMiddlewareHub from '@/features/lmh/components/LumaMiddlewareHub.vue'

const hub = ref<InstanceType<typeof LumaMiddlewareHub> | null>(null)
const sending = ref(false)

function sendSignal() {
  sending.value = true
  hub.value?.play()
}
</script>

<template>
  <ChannelPlaceholder
    title="Beispiel: Signal"
    description="Ein Signal wird über den Luma Middleware Hub von der Cloud bis ins On-Premise-Zielsystem zugestellt."
    :icon="MessageSquare"
  >
    <div class="space-y-4">
      <Button :disabled="sending" @click="sendSignal">
        <Send data-icon="inline-start" />
        {{ sending ? 'Signal unterwegs…' : 'Send Signal' }}
      </Button>

      <LumaMiddlewareHub ref="hub" show-legend @done="sending = false" />
    </div>
  </ChannelPlaceholder>
</template>
