<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { openView } from '@/features/workspace/composables/useWorkspace'
import { site } from '@/config/legal'

const version = __APP_VERSION__
const selfHosted = __SELF_HOSTED__
const repoUrl = 'https://github.com/justTil/baugraph'

const credits = [
  { name: 'Vue', url: 'https://vuejs.org' },
  { name: 'Vue Flow', url: 'https://vueflow.dev' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com' },
  { name: 'Reka UI', url: 'https://reka-ui.com' },
  { name: 'shadcn-vue', url: 'https://www.shadcn-vue.com' },
  { name: 'Lucide', url: 'https://lucide.dev' },
  { name: 'GSAP', url: 'https://gsap.com' },
  { name: 'dockview', url: 'https://dockview.dev' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-6">
    <Card>
      <CardHeader>
        <div class="flex items-center gap-3">
          <div
            class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-9 items-center justify-center rounded-lg font-sans text-sm leading-none font-bold tracking-tight"
          >
            BG
          </div>
          <div>
            <CardTitle class="text-base">{{ site.name }}</CardTitle>
            <CardDescription>Architecture diagrams — flows, queues, integrations.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-3 text-sm">
        <p class="text-muted-foreground">
          {{ site.name }} is a browser-based diagram editor built on Vue Flow. Diagrams are
          stored as plain <code class="bg-muted rounded px-1 py-0.5 text-xs">.baugraph.json</code>
          files designed to be committed next to the code they describe. Everything runs locally
          in your browser — there is no account, no server-side storage and nothing is uploaded.
        </p>
        <p class="text-muted-foreground">
          Version <span class="text-foreground font-mono">{{ version }}</span>
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Source and license</CardTitle>
        <CardDescription>
          {{ site.name }} is open source. See <a
            :href="`${repoUrl}#readme`"
            target="_blank"
            rel="noopener noreferrer"
            class="text-foreground underline underline-offset-2 hover:no-underline"
          >the README</a> for the file format, keyboard shortcuts and how a diagram is built.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button as="a" variant="outline" size="sm" :href="repoUrl" target="_blank" rel="noopener noreferrer">
          GitHub
          <ExternalLink class="size-3.5" />
        </Button>
        <Button v-if="!selfHosted" variant="ghost" size="sm" @click="openView('legal')">
          Legal &amp; privacy
        </Button>
      </CardContent>
    </Card>

    <Card v-if="selfHosted">
      <CardHeader>
        <CardTitle>Self-hosted instance</CardTitle>
        <CardDescription>
          This is your own deployment of {{ site.name }}, built from the public source at
          <a
            :href="repoUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-foreground underline underline-offset-2 hover:no-underline"
          >{{ repoUrl.replace('https://', '') }}</a>. It runs entirely under your control — Til
          Schwarze's Impressum and legal notices at baugraph.com don't apply here.
        </CardDescription>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Built with</CardTitle>
        <CardDescription>Open-source components {{ site.name }} runs on.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <li v-for="credit in credits" :key="credit.name">
            <a
              :href="credit.url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground underline underline-offset-2 hover:no-underline"
            >
              {{ credit.name }}
            </a>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
