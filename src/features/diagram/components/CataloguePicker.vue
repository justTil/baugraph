<script lang="ts">
/** One selectable entry. `terms` are extra strings the search box matches on. */
export interface PickerItem {
  id: string
  label: string
  /** Icon id from the Lucide registry. */
  icon?: string
  terms?: string[]
}

export interface PickerGroup {
  id: string
  label: string
  items: PickerItem[]
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Ban, Check, ChevronsUpDown, Plus, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { iconComponent } from '@/features/diagram/data/icons'

/**
 * A searchable, grouped picker — used for both catalogues the inspector offers:
 * what a node is (node type) and what it runs on (technology). Long lists, so a
 * plain select would mean scrolling past eighty entries to reach IBM DB2.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    groups: PickerGroup[]
    placeholder?: string
    /** Label of the entry that clears the selection. */
    clearLabel?: string
    searchPlaceholder?: string
    /**
     * Offers "Add “<query>” …" when nothing matches, and a remove button next
     * to entries listed in `removableIds`.
     */
    allowCustom?: boolean
    /** Ids that may be removed again — a picker's own past additions. */
    removableIds?: Set<string>
  }>(),
  {
    placeholder: 'Not set',
    clearLabel: 'None',
    searchPlaceholder: 'Search…',
    allowCustom: false,
    removableIds: () => new Set(),
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  /** A picker with `allowCustom` asking the parent to add this as a new entry. */
  (e: 'create', label: string): void
  (e: 'remove', id: string): void
}>()

const open = ref(false)
const query = ref('')
const searchInput = ref<InstanceType<typeof Input> | null>(null)

const current = computed(() => {
  for (const group of props.groups) {
    const item = group.items.find((entry) => entry.id === props.modelValue)
    if (item) return item
  }
  return null
})

/** An id the catalogue does not know still shows, so a hand-edited file reads back. */
const triggerLabel = computed(() => current.value?.label || props.modelValue || props.placeholder)

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.groups
  return props.groups
    .map((group) => ({
      ...group,
      items: group.label.toLowerCase().includes(q)
        ? group.items
        : group.items.filter((item) =>
            [item.id, item.label, ...(item.terms ?? [])].some((term) =>
              term.toLowerCase().includes(q),
            ),
          ),
    }))
    .filter((group) => group.items.length > 0)
})

/** Whether the typed text is worth offering as a new entry: non-empty and not already there. */
const createLabel = computed(() => {
  if (!props.allowCustom) return null
  const trimmed = query.value.trim()
  if (!trimmed) return null
  const exists = props.groups.some((group) =>
    group.items.some((item) => item.label.toLowerCase() === trimmed.toLowerCase()),
  )
  return exists ? null : trimmed
})

function select(id: string) {
  emit('update:modelValue', id)
  open.value = false
}

function create() {
  if (!createLabel.value) return
  emit('create', createLabel.value)
  open.value = false
}

/** Enter takes the first match, or adds the typed text when nothing matched. */
function takeFirst() {
  const first = results.value[0]?.items[0]
  if (first) select(first.id)
  else create()
}

watch(open, (isOpen) => {
  query.value = ''
  if (!isOpen) return
  nextTick(() => (searchInput.value?.$el as HTMLInputElement | undefined)?.focus())
})
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="h-8 w-full justify-between px-2 font-normal"
        :title="triggerLabel"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <component
            :is="iconComponent(current?.icon)"
            v-if="current?.icon && iconComponent(current.icon)"
            class="size-3.5 shrink-0 opacity-70"
          />
          <span class="truncate" :class="{ 'text-muted-foreground': !modelValue }">
            {{ triggerLabel }}
          </span>
        </span>
        <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-64 p-0" align="start" :side-offset="4">
      <div class="border-b p-1.5">
        <Input
          ref="searchInput"
          v-model="query"
          :placeholder="searchPlaceholder"
          class="h-7 text-xs"
          spellcheck="false"
          @keydown.enter.prevent="takeFirst()"
          @keydown.stop
        />
      </div>

      <div class="max-h-64 overflow-y-auto p-1">
        <button
          type="button"
          :class="
            cn(
              'hover:bg-accent flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs',
              !modelValue && 'bg-accent',
            )
          "
          @click="select('')"
        >
          <Ban class="size-3.5 shrink-0 opacity-60" />
          <span class="flex-1 truncate">{{ clearLabel }}</span>
          <Check v-if="!modelValue" class="size-3.5 shrink-0" />
        </button>

        <template v-for="group in results" :key="group.id">
          <div
            class="text-muted-foreground px-1.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
          >
            {{ group.label }}
          </div>
          <div
            v-for="item in group.items"
            :key="item.id"
            :class="
              cn(
                'group hover:bg-accent flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs',
                modelValue === item.id && 'bg-accent',
              )
            "
          >
            <button
              type="button"
              :title="item.id"
              class="flex min-w-0 flex-1 items-center gap-1.5"
              @click="select(item.id)"
            >
              <component
                :is="iconComponent(item.icon)"
                v-if="item.icon && iconComponent(item.icon)"
                class="size-3.5 shrink-0 opacity-70"
              />
              <span class="flex-1 truncate">{{ item.label }}</span>
              <Check v-if="modelValue === item.id" class="size-3.5 shrink-0" />
            </button>
            <button
              v-if="removableIds.has(item.id)"
              type="button"
              title="Remove"
              class="hover:text-destructive shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100"
              @click.stop="emit('remove', item.id)"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </template>

        <button
          v-if="createLabel"
          type="button"
          class="hover:bg-accent text-muted-foreground hover:text-foreground mt-0.5 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs"
          @click="create()"
        >
          <Plus class="size-3.5 shrink-0" />
          <span class="flex-1 truncate">Add “{{ createLabel }}”</span>
        </button>

        <p v-if="!results.length && !createLabel" class="text-muted-foreground px-1.5 py-2 text-xs">
          Nothing matches “{{ query }}”.
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
