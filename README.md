# Baugraph

Architecture diagrams — flows, queues, integrations — that live in your repository.

Baugraph is a browser-based diagram editor built on [Vue Flow](https://vueflow.dev)
(the Vue port of React Flow). Diagrams are stored as plain `.baugraph.json` files
designed to be committed next to the code they describe: node ids are derived from
labels, defaults are omitted, and keys are written in a fixed order, so a diff shows
exactly what changed and nothing else.

## Getting started

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run type-check` | `vue-tsc` only |
| `npm run generate` | Regenerate the JSON Schema and the icon registry |
| `./build.sh` | Clean install + type-check + production build |
| `./manage.sh start [PORT]` | Serve `dist/` behind a load balancer |

## Using the editor

Drag a node from the palette in the sidebar onto the canvas, or click one to drop it
in the centre. Hover a node to reveal its four connection dots — drag a dot onto
another node to connect them, or onto empty canvas to create the next node *and* the
connection in one gesture. Double-click a node to rename it inline; everything else
(icon, colour, shape, routing, arrowheads, line style) lives in the inspector.

### What a node is, and what it runs on

Every node carries two things beyond its name, and both are drawn on it:

- its **type** — `Database`, `API Gateway`, `Message Broker` — which stays put
  through a rename. Call a database "Orders" and the node still says `Database`
  underneath, so nobody has to remember what a cylinder or an icon meant.
- its **technology** — `PostgreSQL`, `IBM DB2`, `Apache Kafka`, `TIBCO EMS` —
  shown right after the type, in the node's own colour. It is the line a
  screenshot has to carry, so it is on the node rather than buried in a panel.

Both are picked in the inspector (or from a node's right-click menu) out of
searchable catalogues: ~90 node types and ~250 technologies grouped by what they
are — databases, message brokers, integration and ESB, caches, clouds, CI/CD,
identity, observability. The palette's own technology groups are the shortcut:
drag `Apache Kafka` straight onto the canvas and you get an amber queue that is
already a topic running Kafka.

The caption never repeats the name. A node called "PostgreSQL" reads
`PostgreSQL` / `Database`; rename it to "Orders" and it reads
`Orders` / `Database · PostgreSQL`. Either way the canvas says what it is.

### Sizing

A node is as big as what it carries. It arrives at the size its label, caption and
icon actually measure — a cylinder taller than a box, because its caps eat the
room a database's two lines need — and a rename or a new technology grows the box
instead of cutting the text off. A size set by hand is never taken away again: the
box only ever grows to fit.

To set one by hand, select the node and drag a side — the whole edge is the
handle, so width, the thing a diagram gets tidied with most, takes no aiming.
`⇧⌘F` hands the decision back: it sizes the selection to its own text, wraps a
selected zone around its contents, and with nothing selected does the lot, which
is how an older diagram full of clipped captions gets fixed in one keystroke.

Select several nodes and press `⌘G` to wrap them in a labelled zone — a VPC, a
cluster, a bounded context. The nodes become children of the zone, so moving it moves
them. Dropping a node onto a zone (from the palette, or by dragging one across the
canvas) groups it there too, and dragging it clear releases it again; either way the
grouping is written to the file as `parent`. Zones nest, so a cluster can live inside
a region.

Lock a node or zone with `⇧⌘L` and it drops out of reach — not selectable, not
draggable, not connectable — which is what makes rearranging the contents of a zone
bearable. A locked node carries a small lock badge; clicking it unlocks that node
again, and the inspector can unlock everything at once.

### Message flows

A diagram can show a message moving through it. Select the node it starts at and
press *Flow from …* in the inspector (or right-click → **Animate message from
here**), and a message travels every connection onwards — **multiplying wherever
the path forks**. One order published to a topic with three subscribers is one
envelope arriving and three leaving, which is the move most middleware diagrams
are drawn to explain and the one a still picture cannot make.

Nothing about that split is authored. A flow stores only *which* connections the
message travels; the order the hops happen in, and where the message multiplies,
are read off the graph every time it runs. Adding a fourth subscriber to a
fan-out is one more id in `edges` — never a rewritten timeline — and rerouting a
connection or dragging a node keeps the animation correct, because the messages
follow the path that is actually on screen.

Two engines draw it, and a flow can use either or both:

- **Messages** — discrete tokens (dot, packet or envelope) travelling the line,
  driven by GSAP against the connection's own SVG path. Every hop moves at the
  same speed, so a long connection honestly takes longer than a short one, and
  branches out of a fork leave together.
- **Line** — a marching dash along the connection, the way a link under constant
  load reads. Pure CSS on an SVG stroke, so it costs nothing to leave running.

Set *Where the path forks* to **One by one** instead of **Multiply** and a single
message walks the connections in turn — a routing slip, or a step-by-step
walkthrough of a sequence.

Speed, colour, message shape, how many messages per pass and the gap before it
repeats are all in the inspector; hovering a flow there haloes the connections it
runs over. The toolbar's pause button freezes every flow where it is, which is
what you want while working *on* a diagram that animates. A system asking for
reduced motion is never animated at all: the messages are shown parked on the
connections they travel instead.

| Shortcut | |
| --- | --- |
| `Shift` + drag | rubber-band select |
| scroll / pinch | pan / zoom |
| `F` | fit the view to the diagram |
| `⇧⌘F` | size the selection to its text (everything, if nothing is selected) |
| `Enter` | rename the selected node |
| `⌘D` / `⌘G` | duplicate / wrap in a zone |
| `⇧⌘L` | lock the selection |
| `⌘Z` / `⇧⌘Z` | undo / redo |
| `⌘S` | download the `.baugraph.json` |
| `⌫` | delete selection |
| arrows | nudge (`⇧` = ×5) |

The current diagram autosaves to `localStorage`, so a reload never loses work. That
copy is a convenience, not the source of truth — export the JSON and commit it.

## The file format

A diagram is one JSON document. See
[`examples/order-processing.baugraph.json`](examples/order-processing.baugraph.json)
for a complete one:

```json
{
  "$schema": "/schema/baugraph-v1.schema.json",
  "baugraph": "1.0",
  "meta": { "title": "Order processing" },
  "canvas": { "theme": "light", "grid": true, "snap": true, "snapSize": 10 },
  "nodes": [
    {
      "id": "order-platform",
      "kind": "zone",
      "type": "vpc",
      "tech": "aws",
      "label": "Order platform",
      "sublabel": "production",
      "position": { "x": 300, "y": 60 },
      "size": { "width": 620, "height": 430 }
    },
    {
      "id": "order-db",
      "type": "database",
      "tech": "postgresql",
      "label": "Order DB",
      "sublabel": "primary",
      "shape": "cylinder",
      "color": "green",
      "icon": "database",
      "position": { "x": 300, "y": 50 },
      "size": { "width": 168, "height": 70 },
      "parent": "order-platform"
    }
  ],
  "edges": [
    {
      "id": "api-gateway--order-service",
      "source": "api-gateway",
      "target": "order-service",
      "sourceSide": "bottom",
      "targetSide": "top",
      "label": "POST /orders"
    }
  ],
  "flows": [
    {
      "id": "flow-order-placed",
      "label": "Order placed",
      "edges": [
        "order-service--order-created",
        "order-created--billing-adapter",
        "order-created--notification-service",
        "order-created--analytics-sink"
      ],
      "token": "envelope"
    }
  ]
}
```

Design decisions, all in service of readable diffs:

- **`type` and `tech` are catalogue ids**, not display text: `ibm_db2` in the
  file, "IBM DB2" on screen. Renaming an entry in the catalogue changes every
  diagram's labels without touching a single file, and a `grep` for
  `"tech": "tibco_ems"` finds every diagram that depends on it. Ids the app does
  not know are shown as written rather than dropped, so a file may name a
  technology this build has never heard of.
- **Ids are derived from labels** (`api-gateway`, `api-gateway-2`) and never
  regenerated. Renaming a node does not rewrite every edge that references it.
- **Defaults are omitted on write** and filled back in on read. A file only ever
  spells out what differs from the default, so `"line": "dashed"` stands out.
- **Keys are written in a fixed order** and coordinates are rounded, so saving an
  unchanged diagram twice produces byte-identical output.
- **`position` and `size` stay on one line**, keeping "moved a node" to a one-line diff.
- **A child's `position` is relative to its `parent` zone**, so moving a zone touches
  one line instead of every node inside it. `parent` *is* the grouping, and it chains:
  a zone may itself have a parent.
- **`locked` is an editing aid**, written only when true. It keeps a node out of the
  way while you work on its neighbours and has no effect on rendering or export.
- **A flow names connections, not a timeline.** `edges` is a set of edge ids and
  the traversal is derived from them, so the fan-out above is four ids rather
  than a hand-written schedule that would go stale the moment a node moved. Every
  id has to resolve: a flow pointing at a connection that is not there is
  rejected on open, and the editor drops a flow whose last connection is deleted
  rather than leaving one behind. A diagram with no flows writes no `flows` key.
- **`data` on any node or edge is yours** — free-form metadata, round-tripped
  untouched. Use it for ticket links, ownership, team conventions.

### Validating a diagram

Every export validates against the bundled JSON Schema at
[`public/schema/baugraph-v1.schema.json`](public/schema/baugraph-v1.schema.json).
Point your editor at it via the `$schema` key for completion and inline errors while
hand-editing. Opening a file in the app reports every problem it finds — dangling
edge endpoints, duplicate ids, unknown parents — with the path to each one.

The schema is generated from the same zod schema the app parses with
(`src/model/schema.ts`), so the two cannot drift:

```sh
npm run schema:generate
```

### Migration

Exports from the original single-file `diagram-tool.html` are recognised by their
shape and converted on open — shapes, sides, routes and Bootstrap icon names are all
mapped across. See `src/model/migrate.ts`.

## Exports

| Format | Use |
| --- | --- |
| `.baugraph.json` | The editable source — this is the one to commit |
| SVG | Vector, opaque or transparent background, message flows animated |
| PNG | Raster at 2× or 4× |

SVG and PNG are rendered by a standalone renderer (`src/features/diagram/lib/render-svg.ts`)
that reuses the same shape, routing and colour code as the canvas, so an export matches
what is on screen. Everything happens in the browser; nothing is uploaded.

An exported SVG keeps its message flows: they are written as SMIL
(`animateMotion` along the connections' own paths), so the file animates on its
own in a browser with no script and no stylesheet. Because every hop of a journey
runs at one speed, distance along a route is proportional to time along it, and a
whole branch — fan-out included — collapses into a single declarative animation.
PNG leaves the flows out; a raster is one frame, and one frame of an animation is
not a picture of the diagram.

## Project layout

```
src/
  model/                   the .baugraph.json format — types, zod schema,
                           (de)serialisation, migration, id generation
  features/diagram/
    components/            canvas, custom nodes and edges, palette, inspector
    composables/           editor state, undo/redo, autosave, placement,
                           the GSAP message-flow runtime
    lib/                   shape geometry, edge routing, flow traversal,
                           theme, SVG export
    data/                  node-type and technology catalogues, the palette
                           built from both, curated Lucide icons, sample
  components/
    ui/                    shadcn-vue primitives
    layout/                app shell, header, sidebar
scripts/                   code generators (JSON Schema, icon registry)
public/schema/             the published JSON Schema
examples/                  an example diagram
```

### Node types and technologies

Both catalogues are plain data, no generator involved:

| File | Holds |
| --- | --- |
| `src/features/diagram/data/node-types.ts` | what a node *is* — id, label, icon, colour, shape, default size, and the technology category it suggests |
| `src/features/diagram/data/tech.ts` | what it *runs on* — id, label, search aliases, grouped into categories that each map to a node type |

To add one, append an entry with a snake_case `id` and the label as it should be
spelled on screen (`{ id: 'ibm_db2', label: 'IBM DB2', aliases: ['db2'] }`). The
palette, both context menus and the inspector pick it up; nothing else needs
touching. Ids are what diagrams store, so treat them as permanent — change a
`label` freely, change an `id` and existing files stop resolving it (they fall
back to showing the id, humanised).

### Icons

Icons come from [Lucide](https://lucide.dev) (ISC). A curated subset of ~240 is
bundled — importing all ~3500 would dominate the bundle and make the picker
unusable. To add one, put its PascalCase name in `CURATED` in
`scripts/generate-icons.ts` and run:

```sh
npm run icons:generate
```

The generator fails loudly on an unknown name, so a typo cannot reach the app as a
silently missing icon.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) with
[Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
TypeScript cannot type `.vue` imports on its own, which is why `type-check` runs
`vue-tsc` instead of `tsc`.
