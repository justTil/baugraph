<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import ChangelogItems from '@/features/changelog/components/ChangelogItems.vue'
import type { ChangeKind } from '@/features/changelog/lib/parse-changelog'
import { parseChangelog, renderInline } from '@/features/changelog/lib/parse-changelog'
import source from '../../../../changelog.md?raw'

const version = __APP_VERSION__
const releases = computed(() => parseChangelog(source))

/**
 * A muted tint per group so Added / Fixed / Removed read apart at a glance.
 * Falls back to the neutral chrome for anything unrecognised (and for the
 * headless group older entries used before `### Added` existed).
 */
const TONES: Record<string, string> = {
  Added: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  Changed: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  Fixed: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-500',
  Removed: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  Deprecated: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Security: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
}

const tone = (kind: ChangeKind) =>
  TONES[kind] ?? 'border-border bg-muted text-muted-foreground'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-8 overflow-y-auto p-6">
    <header class="space-y-1">
      <div class="flex items-center gap-2">
        <Sparkles class="text-muted-foreground size-5" />
        <h1 class="text-2xl font-semibold tracking-tight">What's new</h1>
      </div>
      <p class="text-muted-foreground text-sm">
        Every notable change to Baugraph, newest first. You're on
        <span class="text-foreground font-mono">v{{ version }}</span>.
      </p>
    </header>

    <ol class="relative space-y-6 border-l pl-6">
      <li
        v-for="(release, index) in releases"
        :key="release.version"
        class="relative"
      >
        <span
          class="bg-background absolute top-6 -left-[1.8125rem] size-3 rounded-full border-2"
          :class="index === 0 ? 'border-primary' : 'border-muted-foreground/40'"
          aria-hidden="true"
        />

        <Card>
          <CardHeader>
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 class="text-lg font-semibold tracking-tight">
                {{ release.version }}
              </h2>
              <span
                v-if="index === 0"
                class="border-primary/30 bg-primary/10 text-primary rounded-full border px-1.5 py-0.5 text-[0.6875rem] font-medium"
              >
                Latest
              </span>
              <span
                v-if="release.date"
                class="text-muted-foreground ml-auto text-xs tabular-nums"
              >
                {{ release.date }}
              </span>
            </div>
          </CardHeader>

          <CardContent class="space-y-5">
            <p
              v-for="(note, i) in release.notes"
              :key="i"
              class="text-muted-foreground text-sm leading-relaxed"
              v-html="renderInline(note)"
            />

            <section
              v-for="section in release.sections"
              :key="section.kind || 'general'"
              class="space-y-2.5"
            >
              <span
                v-if="section.kind"
                class="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
                :class="tone(section.kind)"
              >
                {{ section.kind }}
              </span>
              <ChangelogItems :items="section.items" />
            </section>
          </CardContent>
        </Card>
      </li>
    </ol>
  </div>
</template>
