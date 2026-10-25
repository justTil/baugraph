<script setup lang="ts">
import { computed, ref } from 'vue'
import { Ban } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { searchIcons } from '@/features/diagram/data/icons'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const query = ref('')
const results = computed(() => searchIcons(query.value))

const isSelected = (id: string) => props.modelValue === id
</script>

<template>
  <div class="space-y-2">
    <Input v-model="query" placeholder="Filter icons…" class="h-8 text-xs" spellcheck="false" />

    <div class="grid max-h-44 grid-cols-7 gap-0.5 overflow-y-auto rounded-md border p-1">
      <button
        type="button"
        title="No icon"
        :class="
          cn(
            'hover:bg-accent flex items-center justify-center rounded p-1.5',
            !modelValue && 'bg-foreground text-background hover:bg-foreground',
          )
        "
        @click="emit('update:modelValue', '')"
      >
        <Ban class="size-4" />
      </button>
      <button
        v-for="entry in results"
        :key="entry.id"
        type="button"
        :title="entry.id"
        :class="
          cn(
            'hover:bg-accent flex items-center justify-center rounded p-1.5',
            isSelected(entry.id) && 'bg-foreground text-background hover:bg-foreground',
          )
        "
        @click="emit('update:modelValue', entry.id)"
      >
        <component :is="entry.component" class="size-4" />
      </button>
    </div>

    <p v-if="!results.length" class="text-muted-foreground text-xs">
      No icon matches “{{ query }}”.
    </p>
  </div>
</template>
