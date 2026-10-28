<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ExternalLink } from '@lucide/vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import LegalBlockText from '@/features/legal/components/LegalBlockText.vue'
import type { LegalLocale } from '@/config/legal'
import { bindingLocaleNotice, hasPlaceholders, imprintNotice, imprintUrl, legalDocuments } from '@/config/legal'

const locale = ref<LegalLocale>('de')
const documents = computed(() => legalDocuments[locale.value])
// First document rather than a hard-coded id, so adding or reordering documents
// in `legal.ts` cannot leave the tab list with nothing selected.
const activeTab = ref(legalDocuments.de[0]?.id ?? '')
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto p-6">
    <!--
      The Impressum itself is hosted at online-impressum.de and opens directly
      from the sidebar; this only adds what the hosted page cannot know.
    -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p class="text-muted-foreground">{{ imprintNotice[locale] }}</p>
      <a
        :href="imprintUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1.5 text-xs underline underline-offset-4"
      >
        Impressum
        <ExternalLink class="size-3.5" />
      </a>
    </div>

    <!--
      Placeholders would ship as an invalid privacy policy, which is exactly the
      kind of thing nobody notices until it is cited at them. Say so loudly.
    -->
    <div
      v-if="hasPlaceholders"
      class="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
    >
      <AlertTriangle class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <p>
        Diese Seite enthält noch Platzhalter. Vor der Veröffentlichung alle mit
        <code class="bg-muted rounded px-1 py-0.5 text-xs">TODO:</code> markierten Werte in
        <code class="bg-muted rounded px-1 py-0.5 text-xs">src/config/legal.ts</code> ersetzen.
      </p>
    </div>

    <Tabs v-model="activeTab" class="gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger v-for="doc in documents" :key="doc.id" :value="doc.id">
            {{ doc.label }}
          </TabsTrigger>
        </TabsList>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          :model-value="locale"
          @update:model-value="$event && (locale = $event as LegalLocale)"
        >
          <ToggleGroupItem value="de" class="text-xs" title="Deutsch">
            DE
          </ToggleGroupItem>
          <ToggleGroupItem value="en" class="text-xs" title="English">
            EN
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <TabsContent v-for="doc in documents" :key="doc.id" :value="doc.id">
        <Card>
          <CardHeader>
            <CardTitle>{{ doc.title }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-5">
            <section v-for="(block, index) in doc.blocks" :key="index" class="space-y-2">
              <h3 v-if="block.heading" class="text-sm font-semibold">
                {{ block.heading }}
              </h3>

              <div v-if="block.lines" class="text-muted-foreground space-y-0.5 text-sm">
                <p v-for="line in block.lines" :key="line">
                  {{ line }}
                </p>
              </div>

              <LegalBlockText
                v-for="(paragraph, i) in block.paragraphs"
                :key="i"
                :text="paragraph"
              />

              <ul
                v-if="block.list"
                class="text-muted-foreground list-disc space-y-1 pl-5 text-sm leading-relaxed"
              >
                <li v-for="item in block.list" :key="item">
                  {{ item }}
                </li>
              </ul>
            </section>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <p class="text-muted-foreground px-1 text-xs">
      {{ bindingLocaleNotice[locale] }}
    </p>
  </div>
</template>
