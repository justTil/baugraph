<script setup lang="ts">
import { useSlots } from 'vue'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * A row of mutually exclusive choices.
 *
 * Options may carry a `preview` payload, which is handed to the `preview` slot
 * and drawn above the label — for choices that are about how something *looks*,
 * where a picture settles in a glance what two words cannot. Without the slot
 * the field stays the plain row of labels it has always been.
 */

defineProps<{
  modelValue: string
  options: { value: string; label: string; title?: string; preview?: unknown }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const slots = useSlots()
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
      :class="slots.preview && 'h-auto flex-col gap-1 py-1.5'"
    >
      <slot v-if="slots.preview" name="preview" :option="option" />
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroup>
</template>
