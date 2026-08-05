<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  description?: string
  icon?: Component
}>()
</script>

<template>
  <section class="bg-card text-card-foreground rounded-xl border p-6">
    <div class="flex items-start gap-3">
      <div class="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
        <component :is="icon" v-if="icon" class="size-4" />
      </div>
      <div class="space-y-1">
        <h2 class="font-medium">
          {{ title }}
        </h2>
        <p v-if="description" class="text-muted-foreground text-sm">
          {{ description }}
        </p>
      </div>
    </div>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>
