<script setup lang="ts">
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

defineProps<{
  modelValue: string
  options: { value: string; label: string; title?: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <ToggleGroup
    type="single"
    variant="outline"
    size="sm"
    :model-value="modelValue"
    class="w-full"
    @update:model-value="$event && emit('update:modelValue', String($event))"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :title="option.title ?? option.label"
      class="flex-1 text-xs"
    >
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroup>
</template>
