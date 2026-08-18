<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Toggle } from '@/components/ui/toggle'
import { stringify } from '@/model'
import SegmentedField from '@/features/diagram/components/SegmentedField.vue'
import { useDiagram } from '@/features/diagram/composables/useDiagram'
import { saveDocumentAs } from '@/features/diagram/composables/useDocumentFile'
import {
  canOverwriteFiles,
  exportGif,
  exportPng,
  exportSvg,
  gifShape,
} from '@/features/diagram/lib/export'
import { documentFrames } from '@/features/diagram/lib/render-svg'
import type { BackdropId, ChromeId } from '@/features/diagram/lib/frame'
import { BACKDROP_OPTIONS, CHROME_OPTIONS } from '@/features/diagram/lib/frame'

/**
 * Choosing what to export, next to a picture of what that will be.
 *
 * Every setting here changes how the result *looks* — whether it moves, what is
 * behind it, how big it is — and none of that can be settled from a filename and
 * a multiplier. So the choices sit on the left and the thing itself sits on the
 * right, rebuilt from the same renderer the export uses, animation and all: the
 * preview is not a picture *of* the export, it is the export, shrunk to fit.
 */

const open = defineModel<boolean>('open', { required: true })

const { documentId, meta, toDocument } = useDiagram()

type Format = 'json' | 'svg' | 'png' | 'gif'

const FORMATS = [
  { value: 'json', label: 'JSON', title: 'The editable source' },
  { value: 'svg', label: 'SVG', title: 'Vector, and it animates itself' },
  { value: 'png', label: 'PNG', title: 'One frame, as pixels' },
  { value: 'gif', label: 'GIF', title: 'The flows, playing' },
]

const PNG_SCALES = ['1', '2', '3', '4'].map((v) => ({ value: v, label: `${v}×` }))
const GIF_SCALES = ['1', '2'].map((v) => ({ value: v, label: `${v}×` }))
const GIF_RATES = ['12', '16', '20', '25'].map((v) => ({ value: v, label: `${v} fps` }))

const format = ref<Format>('svg')
/**
 * The dressing: a desktop window around the diagram and a gradient behind it,
 * for the exports that are going somewhere they have to look like a screenshot
 * rather than like a figure. Off to begin with — the plain picture is still the
 * one to embed in a README.
 */
const chrome = ref<ChromeId>('none')
const backdrop = ref<BackdropId>('none')

/** A window with nothing behind it looks unfinished, so choosing one picks a
 *  backdrop to stand it on — the first time, and never over a choice already made. */
watch(chrome, (now, before) => {
  if (now !== 'none' && before === 'none' && backdrop.value === 'none') {
    backdrop.value = now === 'windows' ? 'windows' : 'macos'
  }
})

const frame = computed(() =>
  format.value === 'json'
    ? undefined
    // The title bar carries the diagram's own name.
    : { chrome: chrome.value, backdrop: backdrop.value, title: meta.title },
)

const dressed = computed(() => chrome.value !== 'none' || backdrop.value !== 'none')
const transparent = ref(false)
const animate = ref(true)
const pngScale = ref('2')
const gifScale = ref('1')
const gifRate = ref('20')

const error = ref<string | null>(null)
const busy = ref(false)
/** 0 → 1 while a GIF is being drawn; the only export slow enough to need it. */
const progress = ref(0)

/**
 * The document, and what it renders to under the current settings.
 *
 * Only while the dialog is open: this tracks the whole diagram, and re-rendering
 * it behind a closed dialog on every nudge of a node is work for nobody.
 */
const preview = computed(() => {
  if (!open.value) return null
  const doc = toDocument()

  const frames = documentFrames(doc, {
    frame: frame.value,
    transparent: transparent.value && (format.value === 'svg' || format.value === 'png'),
    // A PNG is one frame, and a frame of an animation is not a picture of the
    // diagram; a GIF is nothing but the animation.
    animate: format.value === 'png' ? false : format.value === 'gif' || animate.value,
  })

  try {
    return {
      source: stringify(doc),
      svg: frames.frame(),
      width: Math.round(frames.bounds.width),
      height: Math.round(frames.bounds.height),
      duration: frames.duration,
    }
  } finally {
    frames.dispose()
  }
})

/** Nothing to animate means nothing to write a GIF of. */
const movable = computed(() => (preview.value?.duration ?? 0) > 0)

const gif = computed(() =>
  gifShape(preview.value?.duration ?? 0, Number(gifRate.value)),
)

const scale = computed(() => Number(format.value === 'gif' ? gifScale.value : pngScale.value))

/** The size of the file, where it is known before the file is made. */
const bytes = computed(() => {
  const shot = preview.value
  if (!shot) return null
  if (format.value === 'json') return new Blob([shot.source]).size
  if (format.value === 'svg') return new Blob([shot.svg]).size
  return null
})

const size = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} kB` : `${(n / 1048576).toFixed(1)} MB`

/** The line under the preview: what this export is, in numbers. */
const summary = computed(() => {
  const shot = preview.value
  if (!shot) return ''

  const parts: string[] = []
  if (format.value === 'json') {
    parts.push(`${size(bytes.value ?? 0)} of source`)
  } else if (format.value === 'gif') {
    parts.push(`${Math.round(shot.width * scale.value)} × ${Math.round(shot.height * scale.value)} px`)
    if (movable.value) {
      parts.push(`${gif.value.seconds.toFixed(1)} s`, `${gif.value.frames} frames`)
    }
  } else {
    const factor = format.value === 'png' ? scale.value : 1
    parts.push(`${Math.round(shot.width * factor)} × ${Math.round(shot.height * factor)} px`)
    if (bytes.value !== null) parts.push(size(bytes.value))
  }
  return parts.join(' · ')
})

const blurb = computed(() => {
  if (format.value === 'json') {
    return canOverwriteFiles
      ? 'Editable and diff-friendly — this is the one to commit. Saves to a file you pick.'
      : 'Editable and diff-friendly — this is the one to commit.'
  }
  if (format.value === 'svg') {
    return 'Vector, so it holds up at any size. The flows are written into it as SMIL and play wherever the file opens.'
  }
  if (format.value === 'png') return 'One frame, as pixels, for anywhere a vector will not go.'
  return 'The flows, playing, in the one format a chat window or a pull request will show without asking.'
})

const action = computed(() => {
  if (format.value === 'json') return canOverwriteFiles ? 'Save as…' : 'Download JSON'
  return `Download ${format.value.toUpperCase()}`
})

// A fresh dialog should not inherit the error from the last one.
watch(open, (showing) => {
  if (showing) error.value = null
})

async function run() {
  if (busy.value) return
  error.value = null
  busy.value = true
  progress.value = 0

  try {
    const doc = toDocument()
    switch (format.value) {
      case 'json':
        if (!(await saveDocumentAs(documentId))) return
        break
      case 'svg':
        exportSvg(doc, { transparent: transparent.value, animate: animate.value, frame: frame.value })
        break
      case 'png':
        await exportPng(doc, scale.value, { transparent: transparent.value, frame: frame.value })
        break
      case 'gif':
        await exportGif(doc, {
          fps: Number(gifRate.value),
          scale: scale.value,
          frame: frame.value,
          onProgress: (done) => (progress.value = done),
        })
        break
    }
    open.value = false
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Export diagram</DialogTitle>
        <DialogDescription>
          Everything is generated in the browser — nothing is uploaded.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <!-- The choices. -->
        <div class="space-y-4">
          <SegmentedField
            :model-value="format"
            :options="FORMATS"
            @update:model-value="format = $event as Format"
          />

          <p class="text-muted-foreground text-xs leading-relaxed">{{ blurb }}</p>

          <div v-if="format === 'png'" class="space-y-1.5">
            <p class="text-xs font-medium">Resolution</p>
            <SegmentedField v-model="pngScale" :options="PNG_SCALES" />
          </div>

          <template v-if="format === 'gif'">
            <div class="space-y-1.5">
              <p class="text-xs font-medium">Resolution</p>
              <SegmentedField v-model="gifScale" :options="GIF_SCALES" />
            </div>
            <div class="space-y-1.5">
              <p class="text-xs font-medium">Frame rate</p>
              <SegmentedField v-model="gifRate" :options="GIF_RATES" />
            </div>
          </template>

          <template v-if="format !== 'json'">
            <div class="space-y-1.5">
              <p class="text-xs font-medium">Window</p>
              <SegmentedField
                :model-value="chrome"
                :options="CHROME_OPTIONS"
                @update:model-value="chrome = $event as ChromeId"
              />
            </div>
            <div class="space-y-1.5">
              <p class="text-xs font-medium">Backdrop</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="option in BACKDROP_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="ring-offset-background focus-visible:ring-ring size-7 rounded-md border transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  :class="
                    backdrop === option.value
                      ? 'border-primary ring-primary/40 ring-2'
                      : 'border-border hover:border-foreground/40'
                  "
                  :title="option.label"
                  :aria-label="option.label"
                  :aria-pressed="backdrop === option.value"
                  :style="option.css ? { backgroundImage: option.css } : undefined"
                  @click="backdrop = option.value as BackdropId"
                >
                  <span v-if="!option.css" class="text-muted-foreground text-[10px]">—</span>
                </button>
              </div>
            </div>
          </template>

          <div
            v-if="(format === 'svg' || format === 'png') && !dressed"
            class="flex flex-wrap gap-2"
          >
            <Toggle
              size="sm"
              variant="outline"
              :model-value="transparent"
              @update:model-value="transparent = Boolean($event)"
            >
              {{ transparent ? 'No background' : 'Background' }}
            </Toggle>
          </div>

          <div v-if="format === 'svg'" class="flex flex-wrap gap-2">
            <Toggle
              size="sm"
              variant="outline"
              :model-value="animate"
              @update:model-value="animate = Boolean($event)"
            >
              {{ animate ? 'Flows move' : 'Flows still' }}
            </Toggle>
          </div>

          <p v-if="format === 'gif' && !movable" class="text-muted-foreground text-xs">
            Nothing in this diagram moves yet. Add a message flow and the GIF has
            something to play.
          </p>
        </div>

        <!-- What that will be. -->
        <div class="space-y-2">
          <div
            class="flex h-64 items-center justify-center overflow-hidden rounded-md border p-3"
            :class="transparent && !dressed && format !== 'gif' ? 'bg-export-checker' : 'bg-muted/40'"
          >
            <pre
              v-if="format === 'json'"
              class="text-muted-foreground h-full w-full overflow-hidden font-mono text-[10px] leading-snug whitespace-pre"
              >{{ preview?.source.split('\n').slice(0, 22).join('\n') }}</pre
            >
            <!-- eslint-disable-next-line vue/no-v-html -- our own renderer's output -->
            <div
              v-else-if="preview"
              class="flex h-full w-full items-center justify-center [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full"
              v-html="preview.svg"
            />
          </div>
          <p class="text-muted-foreground text-center text-xs tabular-nums">{{ summary }}</p>
        </div>
      </div>

      <DialogFooter class="items-center gap-3 sm:justify-between">
        <p class="text-destructive mr-auto text-sm">{{ error }}</p>
        <Button :disabled="busy || (format === 'gif' && !movable)" @click="run">
          <Loader2 v-if="busy" class="animate-spin" />
          <template v-if="busy && format === 'gif'">
            Drawing frames… {{ Math.round(progress * 100) }}%
          </template>
          <template v-else>{{ action }}</template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style>
/* The usual chequerboard, so "no background" looks like no background rather
   than like a white one. */
.bg-export-checker {
  --export-checker: color-mix(in srgb, currentColor 8%, transparent);
  background-image:
    linear-gradient(45deg, var(--export-checker) 25%, transparent 25%),
    linear-gradient(-45deg, var(--export-checker) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--export-checker) 75%),
    linear-gradient(-45deg, transparent 75%, var(--export-checker) 75%);
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  background-size: 12px 12px;
}
</style>
