<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Search } from '@lucide/vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PaletteGroup, PaletteItem } from '@/features/diagram/data/palette'
import { searchPalette } from '@/features/diagram/data/palette'
import { nodeTypeLabel } from '@/features/diagram/data/node-types'
import { iconComponent } from '@/features/diagram/data/icons'
import { COLOR_HEX } from '@/features/diagram/lib/theme'
import { useDocumentId } from '@/features/diagram/composables/useDiagram'
import { useIndustries } from '@/features/diagram/composables/useIndustries'
import { usePlacement } from '@/features/diagram/composables/usePlacement'

/**
 * Everything the palette can add, laid out at once.
 *
 * The sidebar is a narrow column of folded groups, which is the right shape
 * for grabbing something you already know is there and the wrong one for
 * finding out what is. This shows every group side by side — the general
 * building blocks, each industry pack, and the technology catalogue the
 * sidebar leaves to the inspector — and is also where an industry pack is
 * switched into or out of the sidebar.
 */
const open = defineModel<boolean>('open', { required: true })

const { place } = usePlacement()
const documentId = useDocumentId()
const { isShown, setShown } = useIndustries()

const query = ref('')
const tab = ref<'types' | 'tech'>('types')

// Each opening starts from the whole catalogue, not from the last search.
watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})

const matched = computed(() => searchPalette(query.value))

/** One tab's groups, general first and the industry packs after. */
function sections(kind: PaletteGroup['kind']) {
  const groups = matched.value.filter((group) => group.kind === kind)
  return [
    { id: 'general', label: 'General', groups: groups.filter((group) => !group.industry) },
    { id: 'industries', label: 'Industries', groups: groups.filter((group) => group.industry) },
  ].filter((section) => section.groups.length)
}

const typeSections = computed(() => sections('types'))
const techSections = computed(() => sections('tech'))

const count = (kind: PaletteGroup['kind']) =>
  matched.value
    .filter((group) => group.kind === kind)
    .reduce((total, group) => total + group.items.length, 0)

/** The node type a technology group's entries arrive as. */
const arrivesAs = (group: PaletteGroup) => nodeTypeLabel(group.items[0]?.type)

function add(item: PaletteItem) {
  if (!place(item)) return
  open.value = false
}

/**
 * `B` closes it again, the same key that opened it. Handled here rather than by
 * the canvas: the dialog holds the focus while it is open, and stopping the key
 * here keeps the canvas from reading it as "open" a moment later. A `b` typed
 * into the search box is just a letter.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'b' || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return
  event.preventDefault()
  event.stopPropagation()
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <!-- A fixed height, so the dialog stays put while a search narrows what is in it. -->
    <DialogContent class="flex h-[min(85vh,52rem)] flex-col gap-3 sm:max-w-5xl" @keydown="onKeydown">
      <DialogHeader>
        <DialogTitle>Palette overview</DialogTitle>
        <DialogDescription>
          Every building block Baugraph ships, grouped the way the palette groups them.
          <template v-if="documentId">Click an entry to drop it on the canvas.</template>
          <template v-else>Open a diagram to drop entries onto its canvas.</template>
          {{ ' ' }}<strong class="text-foreground font-semibold">Press B</strong> to open or close this
          overview.
        </DialogDescription>
      </DialogHeader>

      <Tabs v-model="tab" class="flex min-h-0 flex-1 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="types">
              Node types
              <span class="text-muted-foreground font-mono text-[10px]">{{ count('types') }}</span>
            </TabsTrigger>
            <TabsTrigger value="tech">
              Technologies
              <span class="text-muted-foreground font-mono text-[10px]">{{ count('tech') }}</span>
            </TabsTrigger>
          </TabsList>
          <div class="relative ml-auto w-full sm:w-64">
            <Search
              class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            />
            <Input
              v-model="query"
              placeholder="Search everything…"
              spellcheck="false"
              class="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <TabsContent
          v-for="pane in [
            { value: 'types', sections: typeSections },
            { value: 'tech', sections: techSections },
          ]"
          :key="pane.value"
          :value="pane.value"
          class="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1"
        >
          <section v-for="section in pane.sections" :key="section.id" class="space-y-2">
            <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {{ section.label }}
            </h3>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <article
                v-for="group in section.groups"
                :key="group.id"
                class="space-y-2 rounded-lg border p-3"
                :class="{ 'opacity-60': group.industry && group.kind === 'types' && !isShown(group.id) }"
              >
                <header class="flex items-center gap-2">
                  <h4 class="min-w-0 flex-1 truncate text-sm font-medium">{{ group.label }}</h4>
                  <span class="text-muted-foreground font-mono text-[10px]">{{ group.items.length }}</span>
                  <!-- Only node-type packs are in the sidebar to be shown or hidden. -->
                  <label
                    v-if="group.industry && group.kind === 'types'"
                    class="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px]"
                    title="Show this pack in the sidebar palette"
                  >
                    In palette
                    <Switch
                      :model-value="isShown(group.id)"
                      @update:model-value="setShown(group.id, Boolean($event))"
                    />
                  </label>
                </header>
                <p v-if="group.kind === 'tech'" class="text-muted-foreground text-[11px]">
                  Arrives as {{ arrivesAs(group) }}
                </p>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="item in group.items"
                    :key="`${item.type}:${item.tech ?? ''}`"
                    type="button"
                    class="hover:bg-accent inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs disabled:cursor-default disabled:hover:bg-transparent"
                    :disabled="!documentId"
                    :title="item.keywords?.length ? item.keywords.join(', ') : item.label"
                    @click="add(item)"
                  >
                    <component
                      :is="iconComponent(item.listIcon || item.icon) ?? 'span'"
                      class="size-3.5 shrink-0"
                      :style="{ color: COLOR_HEX[item.color] }"
                    />
                    <span class="truncate">{{ item.label }}</span>
                  </button>
                </div>
              </article>
            </div>
          </section>

          <p v-if="!pane.sections.length" class="text-muted-foreground py-6 text-center text-sm">
            Nothing matches “{{ query.trim() }}”.
          </p>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
