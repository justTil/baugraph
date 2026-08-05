<script setup lang="ts">
import type { ColorKey } from '@/model'
import { cn } from '@/lib/utils'
import { COLOR_SWATCHES } from '@/features/diagram/lib/theme'

defineProps<{
  modelValue: ColorKey | null | undefined
  /** Adds a leading "theme default" swatch that selects `null`. */
  allowDefault?: boolean
  defaultHex?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ColorKey | null): void
}>()
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-if="allowDefault"
      type="button"
      title="Theme default"
      :class="
        cn(
          'size-6 rounded-md border border-black/20 dark:border-white/20',
          modelValue == null && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
        )
      "
      :style="{ background: defaultHex }"
      @click="emit('update:modelValue', null)"
    />
    <button
      v-for="swatch in COLOR_SWATCHES"
      :key="swatch.key"
      type="button"
      :title="swatch.key"
      :class="
        cn(
          'size-6 rounded-md border border-black/20 dark:border-white/20',
          modelValue === swatch.key && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
        )
      "
      :style="{ background: swatch.hex }"
      @click="emit('update:modelValue', swatch.key)"
    />
  </div>
</template>
