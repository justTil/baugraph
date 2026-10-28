<script setup lang="ts">
import type { ChangelogItem } from '@/features/changelog/lib/parse-changelog'
import { renderInline } from '@/features/changelog/lib/parse-changelog'

/**
 * One bullet list from a release group, rendered as a marked list and
 * recursing for the rare nested bullet.
 */
defineProps<{
  items: ChangelogItem[]
  /** Nested lists sit tighter and lose the leading marker colour. */
  nested?: boolean
}>()
</script>

<template>
  <ul :class="nested ? 'mt-1.5 space-y-1' : 'space-y-2'">
    <li
      v-for="(item, index) in items"
      :key="index"
      class="text-foreground/90 relative pl-5 text-sm leading-relaxed"
    >
      <span
        class="absolute top-[0.5em] left-1 size-1.5 -translate-y-1/2 rounded-full"
        :class="nested ? 'bg-muted-foreground/40' : 'bg-muted-foreground/70'"
        aria-hidden="true"
      />
      <!-- eslint-disable-next-line vue/no-v-html -- escaped in renderInline; source is this repo's bundled changelog -->
      <span v-html="renderInline(item.text)" />
      <ChangelogItems v-if="item.children.length" :items="item.children" nested />
    </li>
  </ul>
</template>
