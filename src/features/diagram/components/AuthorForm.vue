<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AuthorDraft } from '@/features/diagram/lib/authors'
import { authorFromDraft } from '@/features/diagram/lib/authors'

/** The three fields of one author, for adding someone or editing them. */

const props = defineProps<{ submitLabel: string }>()
const emit = defineEmits<{ (e: 'save'): void; (e: 'cancel'): void }>()
const draft = defineModel<AuthorDraft>({ required: true })

const form = ref<HTMLFormElement | null>(null)
const canSave = computed(() => authorFromDraft(draft.value) !== null)

onMounted(() => form.value?.querySelector('input')?.focus())

function submit() {
  if (canSave.value) emit('save')
}
</script>

<template>
  <!-- `novalidate`: the format stores addresses as written, so the browser's own
       idea of a valid email must not block saving one. -->
  <form
    ref="form"
    novalidate
    class="bg-muted/40 space-y-2 rounded-md border p-2"
    @submit.prevent="submit"
    @keydown.esc.stop.prevent="emit('cancel')"
  >
    <div class="space-y-1">
      <Label class="text-xs">Name</Label>
      <Input
        v-model="draft.name"
        class="h-8 text-sm"
        placeholder="Ada Lovelace"
        autocomplete="name"
      />
    </div>
    <div class="space-y-1">
      <Label class="text-xs">
        Email <span class="text-muted-foreground font-normal">optional</span>
      </Label>
      <Input
        v-model="draft.email"
        type="email"
        class="h-8 text-sm"
        placeholder="ada@example.com"
        autocomplete="email"
      />
    </div>
    <div class="space-y-1">
      <Label class="text-xs">
        Website <span class="text-muted-foreground font-normal">optional</span>
      </Label>
      <Input
        v-model="draft.website"
        inputmode="url"
        class="h-8 text-sm"
        placeholder="example.com"
        autocomplete="url"
      />
    </div>
    <div class="flex justify-end gap-1.5 pt-1">
      <Button type="button" variant="ghost" size="xs" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" size="xs" :disabled="!canSave">{{ props.submitLabel }}</Button>
    </div>
  </form>
</template>
