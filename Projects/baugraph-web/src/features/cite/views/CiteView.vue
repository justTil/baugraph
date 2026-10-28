<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, ExternalLink } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { openView } from '@/features/workspace/composables/useWorkspace'
import type { CitationStyle } from '@/features/cite/lib/citation'
import {
  citationAuthor,
  citationBuildDate as buildDate,
  citationUrl,
  citationVersion as version,
  citations,
} from '@/features/cite/lib/citation'

/** Only ever fills the caption — the reference is to Baugraph, not the figure. */
const figureTitle = ref('')

// Taken once when the view opens: an access date is the day it was used.
const accessed = new Date()

const entries = computed(() =>
  citations({ accessed, figureTitle: figureTitle.value }),
)

/** Which entry just got copied, so its button can say so for a moment. */
const copied = ref<CitationStyle | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copy(style: CitationStyle, text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  copied.value = style
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = null), 1500)
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <CardTitle>Cite Baugraph</CardTitle>
        <CardDescription>
          For a thesis, paper or report that shows a diagram drawn here.
        </CardDescription>
      </CardHeader>
      <CardContent class="text-muted-foreground space-y-3 text-sm">
        <p>
          A diagram you draw is your own work. Baugraph is MIT-licensed, so an exported image
          needs no attribution. Many universities still ask you to name the software behind a
          figure, though. Put <span class="text-foreground">"own illustration, created with
          Baugraph"</span> in the caption and the full reference in your bibliography.
        </p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Author</dt>
          <dd class="text-foreground">{{ citationAuthor.given }} {{ citationAuthor.family }}</dd>
          <dt>Version</dt>
          <dd class="text-foreground font-mono">{{ version }}</dd>
          <dt>Built</dt>
          <dd class="text-foreground font-mono">{{ buildDate }}</dd>
          <dt>Source</dt>
          <dd>
            <a
              :href="citationUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-foreground inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
            >
              {{ citationUrl.replace('https://', '') }}
              <ExternalLink class="size-3" />
            </a>
          </dd>
        </dl>
        <p>
          Cite the version you actually used. It is also shown next to the logo in the sidebar,
          and <button
            type="button"
            class="text-foreground underline underline-offset-2 hover:no-underline"
            @click="openView('changelog')"
          >What's New</button> lists what changed between versions.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>References</CardTitle>
        <CardDescription>
          Pick the style your institution uses. The access date is today.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <div class="space-y-1.5">
          <Label for="cite-figure-title">Figure title (for the caption)</Label>
          <Input
            id="cite-figure-title"
            v-model="figureTitle"
            placeholder="e.g. Order processing between shop and warehouse"
          />
        </div>

        <section v-for="entry in entries" :key="entry.style" class="space-y-1.5">
          <div class="flex items-end justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-medium">{{ entry.label }}</h3>
              <p class="text-muted-foreground text-xs">{{ entry.hint }}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="copy(entry.style, entry.text)"
            >
              <component :is="copied === entry.style ? Check : Copy" class="size-3.5" />
              {{ copied === entry.style ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <pre
            class="bg-muted overflow-x-auto rounded-md px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all"
            >{{ entry.text }}</pre
          >
        </section>
      </CardContent>
    </Card>
  </div>
</template>
