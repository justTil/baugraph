<script setup lang="ts">
import { computed } from 'vue'

/**
 * Renders one paragraph, turning bare URLs into links.
 * The legal texts are plain strings on purpose — they need to stay readable
 * (and diffable) in `src/config/legal.ts` rather than carry markup.
 */
const props = defineProps<{ text: string }>()

/** Capturing group so `split` keeps the URLs as their own parts. */
const URL_SPLIT = /(https?:\/\/[^\s,)]+)/g
const IS_URL = /^https?:\/\//

const parts = computed(() =>
  props.text.split(URL_SPLIT).map(value => ({ value, isLink: IS_URL.test(value) })),
)
</script>

<template>
  <p class="text-muted-foreground text-sm leading-relaxed">
    <template v-for="(part, index) in parts" :key="index">
      <a
        v-if="part.isLink"
        :href="part.value"
        target="_blank"
        rel="noopener noreferrer"
        class="text-foreground underline underline-offset-2 hover:no-underline"
      >{{ part.value }}</a>
      <template v-else>{{ part.value }}</template>
    </template>
  </p>
</template>
