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

| Shortcut | |
| --- | --- |
| `Shift` + drag | rubber-band select |
| scroll / pinch | pan / zoom |
| `F` | fit to content |
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
| SVG | Vector, opaque or transparent background |
| PNG | Raster at 2× or 4× |

SVG and PNG are rendered by a standalone renderer (`src/features/diagram/lib/render-svg.ts`)
that reuses the same shape, routing and colour code as the canvas, so an export matches
what is on screen. Everything happens in the browser; nothing is uploaded.

## Project layout

```
src/
  model/                   the .baugraph.json format — types, zod schema,
                           (de)serialisation, migration, id generation
  features/diagram/
    components/            canvas, custom nodes and edges, palette, inspector
    composables/           editor state, undo/redo, autosave, placement
    lib/                   shape geometry, edge routing, theme, SVG export
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
