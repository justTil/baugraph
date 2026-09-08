/**
 * Regenerates `src/features/diagram/data/ai-skills.generated.ts` — the text
 * behind the "Copy AI skills" button.
 *
 * That button hands an AI assistant everything it needs to write a valid
 * `.baugraph.json` by hand: the field reference, every enum, the full node-type
 * and technology catalogues, a worked example and the JSON Schema. All of it is
 * pulled from the same source the app itself runs on, so a new palette entry or
 * a new field is one `npm run ai-skills:generate` away from being taught to
 * whatever AI a user pastes this into — nothing here is hand-copied.
 *
 *   npm run ai-skills:generate
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  ARROW_MODES,
  BORDER_WIDTHS,
  COLOR_KEYS,
  FLOW_MODES,
  FLOW_MOTIONS,
  FLOW_TOKENS,
  FORMAT_VERSION,
  LINE_STYLES,
  LINE_WIDTHS,
  MAX_PORTS,
  ROUTES,
  SHAPE_KEYS,
  SIDES,
} from '@/model/types'
import { documentSchema } from '@/model/schema'
import { stringify } from '@/model/serialize'
import { NODE_TYPE_GROUPS } from '@/features/diagram/data/node-types'
import { TECH_CATEGORIES } from '@/features/diagram/data/tech'
import { sampleDocument } from '@/features/diagram/data/sample'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(root, 'src/features/diagram/data/ai-skills.generated.ts')

const enumList = (values: readonly string[]) => values.map((v) => `\`${v}\``).join(', ')

const nodeTypeCatalogue = NODE_TYPE_GROUPS.map((group) => {
  const rows = group.types
    .map((t) => {
      const bits = [`shape: ${t.shape ?? (t.kind === 'zone' ? 'zone container' : 'rect')}`, `color: ${t.color}`]
      if (t.tech) bits.push(`tech category: ${t.tech}`)
      return `- \`${t.id}\` — ${t.label} (${bits.join(', ')})`
    })
    .join('\n')
  return `### ${group.label}\n${rows}`
}).join('\n\n')

const techCatalogue = TECH_CATEGORIES.map((category) => {
  const items = category.items.map((item) => `\`${item.id}\` (${item.label})`).join(', ')
  return `### ${category.label} — defaults node type \`${category.nodeType}\`\n${items}`
}).join('\n\n')

const jsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `https://baugraph.local/schema/v${FORMAT_VERSION}/baugraph.schema.json`,
  title: 'Baugraph diagram',
  description: `Baugraph diagram document, format version ${FORMAT_VERSION}.`,
  ...z.toJSONSchema(documentSchema, { io: 'input', target: 'draft-2020-12' }),
}

const example = stringify(sampleDocument())

const markdown = `# Baugraph — writing \`.baugraph.json\` diagrams

Baugraph is an architecture-diagram editor whose file format is plain, diffable
JSON meant to live in a repository. You can write or edit a \`.baugraph.json\`
file directly — this document is everything needed to produce one that opens
correctly, plus the full JSON Schema to validate against. Format version:
\`${FORMAT_VERSION}\`.

## Shape of a document

\`\`\`json
{
  "baugraph": "${FORMAT_VERSION}",
  "meta": { "title": "My diagram" },
  "canvas": { "theme": "light", "grid": true, "snap": true, "snapSize": 10 },
  "nodes": [],
  "edges": [],
  "flows": []
}
\`\`\`

- \`meta\` — \`title\` (string), optional \`description\`, \`createdAt\`/\`updatedAt\` (ISO-8601).
- \`canvas\` — editor display settings only; safe to omit and let it default.
- \`nodes\` — boxes and zones. See below.
- \`edges\` — connections between two node ids.
- \`flows\` — optional messages animated along a set of edges.
- \`sketch\` — optional freehand annotation layer drawn by hand in the editor;
  omit it entirely. See below.

Every field that has a default may be omitted; the reader fills it back in. Do
not invent fields — anything not in the schema belongs under a node's, edge's
or flow's \`data\` object instead, which is free-form and never interpreted.

## Nodes

\`\`\`json
{
  "id": "order-service",
  "kind": "shape",
  "type": "service",
  "tech": "spring_boot",
  "label": "Order Service",
  "sublabel": "Java 21",
  "shape": "rect",
  "color": "blue",
  "icon": "package",
  "position": { "x": 40, "y": 180 },
  "size": { "width": 168, "height": 62 }
}
\`\`\`

- \`id\` — stable, author-chosen, referenced by edges and by \`parent\`. Letters,
  digits, \`. _ : -\` only.
- \`kind\` — \`"shape"\` for a regular node, \`"zone"\` for a labelled container
  other nodes can sit inside (a VPC, a cluster, a bounded context).
- \`type\` — what the node *is* (\`database\`, \`api_gateway\`, \`message_broker\`…),
  drawn as a fixed caption so a rename never loses the icon's meaning. Pick from
  the node-type catalogue below; an id it does not recognise is still shown
  (humanised), never rejected.
- \`tech\` — the concrete product behind it (\`postgresql\`, \`apache_kafka\`…),
  drawn next to \`type\`. Pick from the technology catalogue below, or invent a
  reasonable \`snake_case\` id — unrecognised ids are shown humanised rather than
  dropped, so exact membership matters less here than for \`type\`.
- \`label\` — what is drawn on the node. \`sublabel\` is a smaller second line
  (protocol, SLA, cardinality…).
- \`shape\` — one of ${enumList(SHAPE_KEYS)}. Ignored for zones.
- \`color\` — one of ${enumList(COLOR_KEYS)}. A semantic key resolved by the active theme, not a hex value.
- \`border\` — one of ${enumList(BORDER_WIDTHS)}. Omit for the default (\`regular\`).
- \`icon\` — a kebab-case Lucide icon id (e.g. \`door-open\`, \`database\`). Omit for none.
- \`position\` — top-left corner. Absolute canvas coordinates, or — when \`parent\`
  is set — relative to that zone's own top-left corner, so moving a zone only
  touches the zone's own \`position\`.
- \`size\` — \`{ "width": number, "height": number }\`, minimum 16 each.
- \`parent\` — id of the enclosing zone node, or omit/\`null\` for none. A zone may
  itself have a \`parent\`, so zones can nest.
- \`ports\` — how many connection points a side offers, only for sides that carry
  more than the one every node starts with: \`{ "right": 4 }\`. Up to ${MAX_PORTS} a
  side. Omit entirely unless a fan-out actually needs more than one point on a
  side.
- \`locked\` — editor-only convenience; omit.
- \`data\` — free-form object for anything else.

## Edges

\`\`\`json
{
  "id": "order-service--order-db",
  "source": "order-service",
  "target": "order-db",
  "sourceSide": "right",
  "targetSide": "left",
  "label": "write",
  "route": "orthogonal",
  "line": "solid",
  "arrows": "target",
  "color": null
}
\`\`\`

- \`id\`, \`source\`, \`target\` — \`source\`/\`target\` must reference existing node ids.
- \`sourceSide\`/\`targetSide\` — one of ${enumList(SIDES)}. \`auto\` lets the renderer pick the nearest side; name a side explicitly when the layout should be deliberate.
- \`sourcePort\`/\`targetPort\` — which point on that side (1-based). Only
  meaningful once the side is not \`auto\` and the node's \`ports\` gives that side
  more than one point.
- \`label\` — optional text on the line.
- \`route\` — one of ${enumList(ROUTES)}.
- \`line\` — one of ${enumList(LINE_STYLES)}.
- \`width\` — one of ${enumList(LINE_WIDTHS)}. Omit for the default.
- \`arrows\` — one of ${enumList(ARROW_MODES)}.
- \`color\` — one of the same color keys as a node, or \`null\` to follow the
  theme's neutral edge colour (the default — most edges should leave this
  \`null\` and reserve colour for edges that mean something different, like a
  failure path).
- \`waypoints\` — optional. A list of \`{ "x": number, "y": number }\` points,
  source to target. Omit for automatic routing (the default, and normally the
  right choice). Give an edge waypoints only when the layout genuinely needs
  a hand-drawn path — the connector is then drawn straight through them with
  no obstacle avoidance at all, so a badly placed point can run the line
  through another node.
- \`data\` — free-form.

## Flows (animated messages) — optional

A flow names a set of edge ids and lets the editor work out the traversal
order and where the message forks from how those edges are wired — list the
connections, nothing more.

\`\`\`json
{
  "id": "flow-order-placed",
  "label": "Order placed",
  "edges": ["api-gateway--order-service", "order-service--order-created"],
  "from": "api-gateway",
  "color": "blue",
  "motion": "token",
  "token": "envelope",
  "mode": "broadcast",
  "speed": 220,
  "count": 1,
  "stream": false,
  "pause": 0.9,
  "loop": true,
  "enabled": true
}
\`\`\`

- \`edges\` — edge ids this message travels, in any order (at least one).
- \`from\` — node the message starts at; omit to let it be worked out (the one
  end of the edge set that nothing else feeds into).
- \`color\`, \`motion\` (${enumList(FLOW_MOTIONS)}), \`token\` (${enumList(FLOW_TOKENS)}) — how it is drawn.
- \`mode\` — ${enumList(FLOW_MODES)}: \`broadcast\` copies the message onto every edge a node forks to at once (pub/sub); \`sequence\` sends one message down them in turn (a routing slip).
- \`speed\` — canvas units per second. \`count\` — messages per pass (or in flight
  at once, if \`stream\`). \`stream\` — true for a connection that is never empty
  (constant load) rather than a single event. \`pause\` — seconds of stillness
  before repeating (ignored while streaming). \`loop\`, \`enabled\` — self-explanatory.
- \`style\` — per-edge overrides for this flow only, keyed by edge id, each an
  object of any of \`color\`/\`token\`/\`speed\` — for the one connection that should
  not read the same as the rest, like a failure path drawn red and slow:
  \`{ "order-created--dead-letter-queue": { "color": "red", "token": "packet", "speed": 110 } }\`.

## Sketch (freehand Canvas layer) — optional

A hand-drawn overlay on top of the diagram. It is produced by drawing in the
editor's Canvas mode, not written by hand — reproduce it when round-tripping a
file, but do not author one from scratch.

\`\`\`json
{
  "sketch": {
    "strokes": [
      { "id": "stroke", "color": "red", "width": 3, "points": [120, 80, 140, 96, 180, 110] }
    ]
  }
}
\`\`\`

- \`strokes\` — freehand paths. \`points\` is a flat \`[x, y, x, y, …]\` run in
  canvas coordinates (the same space as a node's \`position\`), so a stroke pans
  and zooms with what it annotates. \`color\` is one of the node colour keys;
  \`width\` is in canvas units.
- \`visible\` — \`false\` only when the layer has been hidden in the editor;
  omitted otherwise.
- A diagram with nothing drawn writes no \`sketch\` key at all.

## Node-type catalogue

The \`type\` a node can carry, grouped as the palette groups them. Any
\`snake_case\` id is accepted even if not listed here, but these carry a sensible
default icon, shape and colour in the editor.

${nodeTypeCatalogue}

## Technology catalogue

The \`tech\` a node can carry, grouped by category. Pick the technology whose
category matches the node's \`type\` (a \`database\` node usually wants a
\`database\`-category tech). Any \`snake_case\` id works; these are recognised and
rendered with their canonical label.

${techCatalogue}

## Worked example

The diagram Baugraph ships with on a first visit — every shape, a zone with
children positioned relative to it, styled edges and both kinds of flow.

\`\`\`json
${example}\`\`\`

## JSON Schema

Full JSON Schema for \`.baugraph.json\`, also published at
\`/schema/baugraph-v1.schema.json\`. Validate against this before treating a
generated file as final.

\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`
`

const source = `// GENERATED by scripts/generate-ai-skills.ts — do not edit by hand.
// Run \`npm run ai-skills:generate\` after changing a palette or the file format.

/** Everything an AI assistant needs to write a valid \`.baugraph.json\` by hand. */
export const AI_SKILLS_MARKDOWN = ${JSON.stringify(markdown)}
`

writeFileSync(outFile, source)
console.log(`wrote ${outFile.replace(`${root}/`, '')} — ${markdown.length} chars`)
