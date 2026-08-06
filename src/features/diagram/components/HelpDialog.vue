<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ICONS } from '@/features/diagram/data/icons'

const open = defineModel<boolean>('open', { required: true })

const SHORTCUTS: [string, string][] = [
  ['Shift + drag', 'rubber-band select'],
  ['Space / middle-drag', 'pan the canvas'],
  ['⌘ + scroll, pinch', 'zoom (plain scroll pans)'],
  ['F', 'fit diagram to window'],
  ['Enter', 'rename the selected node'],
  ['⌘D', 'duplicate selection'],
  ['⌘G', 'wrap selection in a zone'],
  ['⇧⌘L', 'lock selection'],
  ['⌘Z / ⇧⌘Z', 'undo / redo'],
  ['⌘S', 'download the .baugraph.json'],
  ['⌫', 'delete selection'],
  ['arrows', 'nudge (⇧ = ×5)'],
]
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Baugraph</DialogTitle>
        <DialogDescription>
          Architecture diagrams that live in your repository.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5 text-sm leading-relaxed">
        <section class="space-y-2">
          <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            Building
          </h3>
          <p>
            Drag from the palette onto the canvas, or click a palette entry to drop it in the
            centre. Double-click empty canvas to repeat the last node type.
          </p>
          <p>
            Hover a node to reveal its four connection dots. Drag a dot onto another node to
            connect them, or onto empty canvas to create the next node
            <em>and</em> the connection in one gesture.
          </p>
          <p>
            Double-click a node to rename it inline. Icon, colour, shape, routing, arrowheads and
            line style live in the inspector on the right.
          </p>
        </section>

        <section class="space-y-2">
          <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            Zones &amp; grouping
          </h3>
          <p>
            Select several nodes and press <kbd class="bg-muted rounded px-1 font-mono">⌘G</kbd> to
            wrap them in a labelled zone — a VPC, a cluster, a bounded context. The nodes become
            children of the zone, so moving it moves them, and their positions are stored relative
            to it as <code class="bg-muted rounded px-1 font-mono text-xs">parent</code>.
          </p>
          <p>
            Dropping a node onto a zone — from the palette or by dragging one already on the canvas
            — groups it there; dragging it clear of the zone releases it again. Zones can be
            grouped into other zones, so a cluster can sit inside a region.
          </p>
          <p>
            Lock a zone (<kbd class="bg-muted rounded px-1 font-mono">⇧⌘L</kbd>) once you are happy
            with it: it stops answering the pointer, so you can rearrange what is inside without
            grabbing the frame by mistake. A locked node shows a small lock badge — click it to
            unlock. Locking is stored per node and changes nothing about how the diagram exports.
          </p>
        </section>

        <section class="space-y-2">
          <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            The file format
          </h3>
          <p>
            Export produces a <code class="bg-muted rounded px-1 font-mono text-xs">.baugraph.json</code>
            file: node ids are derived from labels, defaults are omitted and keys are written in a
            fixed order, so a diff shows exactly what changed and nothing else. It validates against
            the JSON Schema at
            <code class="bg-muted rounded px-1 font-mono text-xs">/schema/baugraph-v1.schema.json</code>.
          </p>
          <p>Exports from the original single-file tool are recognised and converted on open.</p>
        </section>

        <section class="space-y-2">
          <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            Shortcuts
          </h3>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <template v-for="[keys, description] in SHORTCUTS" :key="keys">
              <dt><kbd class="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{{ keys }}</kbd></dt>
              <dd class="text-muted-foreground">{{ description }}</dd>
            </template>
          </dl>
        </section>

        <section class="space-y-2">
          <h3 class="text-muted-foreground text-xs font-bold tracking-wider uppercase">Icons</h3>
          <p class="text-muted-foreground">
            {{ ICONS.length }} Lucide icons (ISC licensed) are bundled and searchable from the node
            inspector.
          </p>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
