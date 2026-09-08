# The .baugraph.json format

A diagram is one JSON document, designed to produce readable diffs when
committed next to the code it describes.

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
    },
    {
      "id": "order-service--billing-adapter",
      "source": "order-service",
      "target": "billing-adapter",
      "waypoints": [{ "x": 640, "y": 220 }, { "x": 640, "y": 340 }]
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
        "order-created--dead-letter-queue"
      ],
      "token": "envelope",
      "style": {
        "order-created--dead-letter-queue": { "color": "red", "token": "packet", "speed": 110 }
      }
    }
  ],
  "sketch": {
    "strokes": [
      { "id": "stroke", "color": "red", "width": 3, "points": [120, 80, 150, 92, 190, 110] }
    ]
  }
}
```

See [`examples/order-processing.baugraph.json`](https://github.com/justTil/baugraph/blob/main/examples/order-processing.baugraph.json)
in the repository for a complete example.

## Design decisions

All in service of readable diffs:

- **`type` and `tech` are catalogue ids**, not display text: `ibm_db2` in the
  file, "IBM DB2" on screen. Renaming an entry in the catalogue changes every
  diagram's labels without touching a single file, and a `grep` for
  `"tech": "tibco_ems"` finds every diagram that depends on it. Ids the app
  does not know are shown as written rather than dropped, so a file may name
  a technology this build has never heard of.
- **Ids are derived from labels** (`api-gateway`, `api-gateway-2`) and never
  regenerated. Renaming a node does not rewrite every edge that references
  it.
- **Defaults are omitted on write** and filled back in on read. A file only
  ever spells out what differs from the default, so `"line": "dashed"`
  stands out.
- **Keys are written in a fixed order** and coordinates are rounded, so
  saving an unchanged diagram twice produces byte-identical output.
- **`position` and `size` stay on one line**, keeping "moved a node" to a
  one-line diff.
- **A child's `position` is relative to its `parent` zone**, so moving a
  zone touches one line instead of every node inside it. `parent` *is* the
  grouping, and it chains: a zone may itself have a parent.
- **A node's `ports` counts connection points, and nothing else.** Points
  are spread evenly along the side they sit on, so `"ports": { "right": 4 }`
  is the whole of what a fan-out stores — no coordinates to go stale when
  the node is resized, and nothing at all for the sides that were left
  alone. An edge's `sourcePort` / `targetPort` then names which of them an
  end uses, counted from the top or the left and starting at 1; both are
  omitted while the end is on `auto`, which places itself. A port a node no
  longer offers falls back to the last one that exists rather than failing
  to open.
- **`locked` is an editing aid**, written only when true. It keeps a node
  out of the way while you work on its neighbours and has no effect on
  rendering or export.
- **A flow names connections, not a timeline.** `edges` is a set of edge ids
  and the traversal is derived from them, so a fan-out is four ids rather
  than a hand-written schedule that would go stale the moment a node moved.
  Every id has to resolve: a flow pointing at a connection that is not there
  is rejected on open, and the editor drops a flow whose last connection is
  deleted rather than leaving one behind. A diagram with no flows writes no
  `flows` key.
- **`style` says only what differs.** A per-connection override carries just
  the fields that are not the flow's own, so a connection meant to look like
  the rest stores nothing at all rather than a copy that would go stale the
  next time the flow's colour changed. Styling a connection the flow does
  not travel is rejected on open, and an override is dropped along with the
  connection it described.
- **`data` on any node or edge is yours** — free-form metadata, round-tripped
  untouched. Use it for ticket links, ownership, team conventions.
- **`sketch` is the freehand Canvas layer**, and its own section rather than
  part of `canvas` (which is display settings). A diagram with nothing drawn on
  it writes no `sketch` key at all, so the feature is invisible in the file
  until it is used and every file written before it existed is unchanged. Each
  stroke's `points` is a flat `[x, y, …]` run in canvas coordinates — the same
  space as a node's `position` — so a drawing pans and zooms with what it
  annotates. `visible` is written only when the layer has been hidden.
- **An edge routes itself unless `waypoints` says otherwise.** Every
  connection is auto-routed around obstacles by default, the only behavior
  this format had before manual routing existed. Giving an edge one or more
  `waypoints` switches it to manual: the line is drawn straight through them,
  source to target, with no obstacle avoidance at all — the file is stating
  a route, not asking for one. Omitting the key, or writing `[]`, means
  automatic. Each point stays on its own line, the same reasoning as
  `position` and `size`: reshaping a connection should touch one line, not
  four.

## Validating a diagram

Every export validates against the bundled JSON Schema at
[`/schema/baugraph-v1.schema.json`](https://baugraph.com/schema/baugraph-v1.schema.json).
Point your editor at it via the `$schema` key for completion and inline
errors while hand-editing. Opening a file in the app reports every problem
it finds — dangling edge endpoints, duplicate ids, unknown parents — with
the path to each one.

The schema is generated from the same zod schema the app parses with
(`src/model/schema.ts`), so the two cannot drift:

```sh
npm run schema:generate
```
