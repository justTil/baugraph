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
  ['⌥ + drag', 'ignore the grid and the alignment guides'],
  ['Space / middle-drag', 'pan the canvas'],
  ['⌘ + scroll, pinch', 'zoom (plain scroll pans)'],
  ['F', 'fit diagram to window'],
  ['⇧⌘F', 'size the selection to its own text (all of it, if nothing is selected)'],
  ['Enter', 'rename the selected node'],
  ['right-click', 'context menu for what is under the pointer'],
  ['⌘A', 'select everything'],
  ['⌘D', 'duplicate selection'],
  ['⌘G', 'wrap selection in a zone'],
  ['⇧⌘L', 'lock selection'],
  ['⌘Z / ⇧⌘Z', 'undo / redo'],
  ['⌘S', 'save to the .baugraph.json file'],
  ['⇧⌘S', 'save to a different file'],
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
            Hover a node to reveal its connection dots. Drag a dot onto another node to
            connect them — neither end needs aiming, and the connection runs the way you drew
            it. Released over empty canvas, a connection is simply dropped.
          </p>
          <p>
            A side carries one dot until you give it more: up to six a side, set per side under
            <em>Connection points</em> in a node's inspector, and spread evenly along it. A
            connection can be moved between them from its own inspector.
          </p>
          <p>
            Double-click a node to rename it inline. Icon, colour, shape, routing, arrowheads and
            line style live in the inspector on the right.
          </p>
          <p>
            Nodes size themselves to what they carry: a new one arrives as wide and as tall as its
            label and caption need, and a rename or a new technology grows the box rather than
            cutting the text off. Drag any side of a selected node to set a size by hand — the whole
            edge is the handle, not just its corners — and press
            <kbd class="bg-muted rounded px-1 font-mono">⇧⌘F</kbd> (or <em>Fit</em> in the inspector)
            to hand the decision back, which also wraps a zone around its contents.
          </p>
          <p>
            Every node carries its <em>type</em> — Database, API Gateway, Message Broker — and it
            stays on the node through a rename, so an icon never has to be remembered. Pick the
            <em>technology</em> next to it (PostgreSQL, IBM DB2, Apache Kafka, TIBCO EMS) and it is
            drawn right under the label, where a screenshot will carry it. The palette's technology
            groups skip both steps: drag Apache Kafka on and the node is already a Kafka topic.
          </p>
          <p>
            Right-click anything for a menu of what applies to it: rename, colour, shape, align,
            lock, delete on a node or selection; route, line, arrows and direction on a connection;
            add a node, select all, undo, grid and export on empty canvas. Each menu also has a
            <em>Developer</em> submenu that copies the id or the JSON of what you clicked.
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
            Message flows
          </h3>
          <p>
            A diagram can show a message moving through it. Select the connections it travels
            and add a flow — from the <em>Message flows</em> button in the toolbar, from a
            selected connection's inspector, or by right-clicking a node and choosing
            <em>Animate message from here</em>, which picks up everything downstream of it in
            one go. The message <em>multiplies wherever the path forks</em>: one order published
            to a topic with three subscribers is one envelope arriving and three leaving.
          </p>
          <p>
            None of that is drawn by hand. A flow only records which connections the message
            travels; the order of the hops, and where it splits, are worked out from how those
            connections are wired — so adding a fourth subscriber to a fan-out is one click, and
            rerouting a connection or dragging a node leaves the animation correct.
          </p>
          <p>
            Pick how it is shown: <em>Messages</em> travelling the line, a moving <em>Line</em>
            for a link under constant load, or both. Where a node leaves on several connections
            at once, <em>When one node feeds several</em> decides what that means: <em>All at
            once</em> copies the message onto every one of them, <em>One at a time</em> sends a
            single message down them in turn — a routing slip, or a walkthrough of a sequence.
          </p>
          <p>
            Two paths out of the same node rarely mean the same thing, so each connection can
            be drawn its own way — the failure path as a red packet crawling to the dead-letter
            queue while the rest are blue envelopes at full speed. Open a connection under
            <em>Connections</em> in the flow editor and set its colour, message shape or speed
            there; each control reads <em>same as the flow</em> until you touch it. Selecting a
            <em>connection</em> on the canvas shows which flows it is part of, adds it to another
            or takes it out, and opens the editor on that connection.
          </p>
          <p>
            <em>Sends</em> decides what kind of thing a flow is. <em>An event</em> goes through
            and the line falls quiet until the next one. <em>Constantly</em> never stops:
            messages leave one after another so the connection is never empty, which is how a
            link under permanent load reads. <em>In flight</em> then says how many are on the
            way at once.
          </p>
          <p>
            Hover a flow in the editor to light up the connections it runs over. The pause
            button in the toolbar freezes every flow where it is, which is what you want while
            working on a diagram that animates. Exported SVGs keep their animation; PNGs, being
            one frame, leave it out.
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
          <p class="text-muted-foreground text-xs">
            The <em>Copy AI skills</em> button in the toolbar hands an AI assistant the file
            format, both catalogues and the schema as one block of text, so it can write diagrams
            for you.
          </p>
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
