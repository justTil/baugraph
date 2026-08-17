<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { imprintNotice, imprintUrl } from '@/config/legal'
</script>

<template>
  <!--
    The Impressum is maintained at online-impressum.de and embedded verbatim, so
    § 5 DDG details stay current without a redeploy. The direct link below is not
    decoration: if the frame ever fails to load, the Impressum must still be
    "unmittelbar erreichbar".
  -->
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto p-6">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">
        {{ imprintNotice.de }}
      </p>

      <a
        :href="imprintUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1.5 text-xs underline underline-offset-4"
      >
        Impressum in neuem Tab öffnen
        <ExternalLink class="size-3.5" />
      </a>
    </div>

    <iframe
      :src="imprintUrl"
      title="Impressum"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="bg-background min-h-[70svh] w-full flex-1 rounded-lg border"
    />
  </div>
</template>
