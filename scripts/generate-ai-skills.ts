/**
 * Regenerates `src/features/diagram/data/ai-skills.generated.ts` — the text
 * behind the "Copy AI skills" button.
 *
 * That button hands an AI assistant everything it needs to write a valid
 * `.baugraph.json` by hand: the field reference, every enum, the layout rules
 * the canvas sizes and routes by, the full node-type and technology catalogues,
 * a worked example and the JSON Schema. All of it is pulled from the same
 * source the app itself runs on, so a new palette entry, a new field or a new
 * sizing rule is one `npm run ai-skills:generate` away from being taught to
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
import { DEFAULT_CANVAS, DEFAULT_NODE_SIZE, DEFAULT_ZONE_SIZE } from '@/model/defaults'
import { documentSchema } from '@/model/schema'
import { stringify } from '@/model/serialize'
import { NODE_TYPE_GROUPS, nodeTypeLabel, nodeTypeSize, type NodeType } from '@/features/diagram/data/node-types'
import { TECH_CATEGORIES, techLabel } from '@/features/diagram/data/tech'
import { sampleDocument } from '@/features/diagram/data/sample'
import {
  MIN_DEFAULT,
  MIN_SIZE,
  ZONE_HEADROOM,
  ZONE_PADDING,
  fitNodeSize,
  type FitSource,
} from '@/features/diagram/lib/auto-size'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = resolve(root, 'src/features/diagram/data/ai-skills.generated.ts')

const enumList = (values: readonly string[]) => values.map((v) => `\`${v}\``).join(', ')

const GRID = DEFAULT_CANVAS.snapSize
/** Where a zone's first child sits, relative to the zone, once the zone is fitted around it. */
const ZONE_INSET_X = ZONE_PADDING
const ZONE_INSET_TOP = ZONE_PADDING + ZONE_HEADROOM

/** The larger of two sizes, per axis. */
const atLeast = (a: { width: number; height: number }, b: { width: number; height: number }) => ({
  width: Math.max(a.width, b.width),
  height: Math.max(a.height, b.height),
})
const dims = (s: { width: number; height: number }) => `${s.width}×${s.height}`

/** The size the editor gives a new node of this type dropped from the palette. */
function startingSize(t: NodeType) {
  const declared = nodeTypeSize(t)
  if (t.kind === 'zone') return declared
  return atLeast(declared, fitNodeSize({ label: t.label, type: t.id, shape: t.shape, icon: t.icon }))
}

/**
 * Real nodes run through the same fitter the editor uses, so the table the AI
 * reads is the sizing the canvas will actually enforce, not a guess about it.
 */
const sizingExamples: FitSource[] = [
  { label: 'Order Service', type: 'service', tech: 'spring_boot', icon: 'package' },
  { label: 'Order Service', type: 'service', tech: 'spring_boot', icon: 'package', sublabel: 'Java 21' },
  { label: 'Notification Service', type: 'notification', tech: 'node_js', icon: 'bell', sublabel: 'email · push' },
  { label: 'Order DB', type: 'database', tech: 'postgresql', shape: 'cylinder', icon: 'database', sublabel: 'primary' },
  { label: 'order.created', type: 'topic', tech: 'apache_kafka', shape: 'queue', icon: 'radio-tower' },
  { label: 'Customer', type: 'user', shape: 'circle', icon: 'user' },
  { label: 'Valid order?', type: 'decision', shape: 'diamond', icon: 'split' },
  { label: 'Billing Adapter', type: 'adapter', tech: 'tibco_businessworks', icon: 'plug', sublabel: 'SAP · IDoc' },
]

const sizingTable = [
  '| label | type · tech | shape | icon | sublabel | minimum size |',
  '| --- | --- | --- | --- | --- | --- |',
  ...sizingExamples.map((n) => {
    const caption = [nodeTypeLabel(n.type), techLabel(n.tech)].filter(Boolean).join(' · ')
    return `| ${n.label} | ${caption} | ${n.shape ?? 'rect'} | ${n.icon ? 'yes' : '—'} | ${n.sublabel ?? '—'} | ${dims(fitNodeSize(n))} |`
  }),
].join('\n')

const shapeFloors = [
  ...Object.entries(MIN_SIZE).map(([shape, size]) => `\`${shape}\` ${dims(size!)}`),
  `every other shape ${dims(MIN_DEFAULT)}`,
].join(', ')

const nodeTypeCatalogue = NODE_TYPE_GROUPS.map((group) => {
  const rows = group.types
    .map((t) => {
      const bits = [
        `shape: ${t.shape ?? (t.kind === 'zone' ? 'zone container' : 'rect')}`,
        `color: ${t.color}`,
        `starts at ${dims(startingSize(t))}`,
      ]
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

- \`meta\` — \`title\` (string), optional \`description\`, \`authors\`,
  \`createdAt\`/\`updatedAt\` (ISO-8601). \`authors\` is a list of
  \`{ "name": "…", "email": "…", "website": "…" }\` in crediting order; only
  \`name\` is required, and the key is omitted entirely when nobody is credited.
- \`canvas\` — editor display settings only; safe to omit and let it default.
- \`nodes\` — boxes and zones. See below.
- \`edges\` — connections between two node ids.
- \`flows\` — optional messages animated along a set of edges.

Every field that has a default may be omitted; the reader fills it back in. Do
not invent fields — anything not in the schema belongs under a node's, edge's
or flow's \`data\` object instead, which is free-form and never interpreted.

Array order carries no meaning, and the editor rewrites it on save: nodes in
hierarchy order (a zone, then everything inside it — which also keeps a parent
ahead of its children), edges grouped by \`source\` and then \`target\`, flows by
\`id\`. Writing a file in that order keeps the diff to what actually changed;
writing it in another order is still valid and will simply be re-sorted.

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
  "size": { "width": 180, "height": 70 }
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
- \`size\` — \`{ "width": number, "height": number }\`, minimum 16 each. Must be
  large enough for the node's text — see "Layout and placement" below.
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

## Layout and placement

Baugraph never lays a diagram out for you. Every node is drawn exactly at the
\`position\` and \`size\` the file gives it, and nothing is moved or resized when
the file is opened, so the layout is your job. A diagram that is valid JSON but
has overlapping boxes, clipped labels or connectors zig-zagging through each
other still opens. It just reads badly. Follow the rules below and the file
opens looking like a person drew it.

### Coordinates and the grid

- Canvas units are screen pixels at 100% zoom. The origin is the top-left, \`x\`
  grows to the right and \`y\` grows downward.
- \`position\` is a node's **top-left corner**, not its centre. The centre is
  \`x + width / 2\`, \`y + height / 2\`.
- The editor snaps to a ${GRID}px grid. Write every \`position\` value as a
  multiple of ${GRID}. Lines come out straighter, and the user's own drags line
  up with what you placed. Round the sizes you work out up to ${GRID} as well.
  The few built-in floors that are not multiples of ${GRID} (a height of 62, for
  example) are fine to use as they are.
- Start the diagram near \`(40, 40)\` and grow it right and down. Nothing needs
  to go at negative coordinates.

### Sizing a node

The editor has a minimum size for every node: the smallest box that fits its
text and icon. If a file gives a smaller size, the node is drawn at that size
anyway and its label or caption gets cut off, until the user runs "Resize
every node to fit" (⇧⌘F). **Always write a size at least as large as the
node's content needs.**

What a node draws, top to bottom and centred vertically:

- an optional 20px icon on the left, with 10px between it and the text
- the \`label\`: 13px semibold, about 7.5px per character, 17px per line (\`\\n\`
  breaks it into more lines)
- the caption \`Type · Technology\`, built from \`type\` and \`tech\`: 10px, about
  5.5px per character, 14px tall. Count the display names, e.g. \`API Gateway ·
  Kong\`, not the ids.
- the \`sublabel\`: 11px, about 6px per character, 15px tall

Estimate the size as follows:

- **width** = 24 (padding) + 30 (only with an icon) + the widest of those lines,
  rounded up to ${GRID}.
- **height** = 22 (padding) + the heights of the lines present, rounded up to
  ${GRID}.

Then add what the shape needs:

- \`cylinder\`: +45 height for its caps
- \`queue\`: +34 width for the ticks on its right end
- \`note\`: +18 width and +6 height for the folded corner
- \`pill\`: about +35% of the height, added to the width
- \`hexagon\`: +36 width
- \`diamond\`: the content width ÷ 0.55, and 1.8 × the content height
- \`circle\`: square, sized by whichever axis the content needs more

Every shape also has a floor that it never goes below: ${shapeFloors}. A new
node dropped from the palette starts at ${dims(DEFAULT_NODE_SIZE)}, or larger if
its content needs more room. The node-type catalogue below lists each type's
starting size.

Measured minimums for some typical nodes:

${sizingTable}

When in doubt, round up. A box 20px wider than it needs to be looks fine. A
clipped caption does not.

Nodes that sit in the same column should share one width, the widest of them.
Nodes that sit in the same row should share one height where their shapes
allow it. Matching sizes are what make a diagram look deliberate.

### Spacing

- **Between columns:** leave at least 80px between neighbouring boxes. If the
  edge between them carries a \`label\`, leave 100–140px. The label is drawn as
  an 18px-tall pill centred on the middle of the connector, about 6px per
  character + 13px wide, and it needs room to sit clear of both boxes.
- **Between rows:** leave at least 60px between stacked boxes, and more if a
  labelled edge runs vertically between them.
- **Never let two boxes overlap.** Keep at least 40px between any two boxes
  that a connector might need to pass between. Connectors keep 14px clear of
  every node they pass, so a narrower gap has no lane in it and the line takes
  a long detour instead.
- A reliable pitch for plain \`rect\` nodes is **~280px per column and ~130px per
  row**, which fits a 190×70 box plus the gaps above. Widen the pitch when the
  boxes get wider.

### Arranging the diagram

- **Pick one main direction and stick to it.** Use left to right for request
  and data flows: the user or client on the far left, then entry points
  (gateway, load balancer), then services, and stores, queues and external
  sinks on the right. Use top to bottom for pipelines, hierarchies and
  deployment stacks. Most edges should point the same way.
- **Place nodes on a grid of columns and rows**, one column per tier or step:
  \`x = x0 + column × columnPitch\`, \`y = y0 + row × rowPitch\`. Do not scatter
  nodes at arbitrary coordinates.
- **Line up the centres of connected nodes, not their top-left corners.** When
  heights differ, offset the \`y\` by half the difference. For example, a 90px
  cylinder beside a 60px box goes at \`y − 15\`. The two facing sides of a
  connection are pulled onto one straight line when their centres are within
  26px. Beyond that, the connector gets a visible jog.
- **Fan-out and fan-in:** stack the targets in one column and centre the
  source vertically on that stack, so the lines spread evenly.
- **Avoid crossings.** Order the nodes in each column to match the order of
  what they connect to in the neighbouring column. Put a node that talks to
  many others (a broker, an event bus) in the middle of its column.
- **Keep it compact.** Leave no large empty areas, but don't cram nodes
  together either. Wide diagrams read better than tall ones on a screen.
- Put cross-cutting concerns (auth, monitoring, logging) along the bottom or
  in a separate row, not in the middle of the main flow.
- Put actors and external systems (\`user\`, \`third_party\`, \`internet\`) outside
  the zones they call into.
- Annotations (\`text\`, \`note\`) belong in empty space next to what they
  describe. Connectors ignore them and pass underneath.

### Zones

- A child's \`position\` is **relative to its zone's top-left corner**.
- The zone's header (its label in 12px uppercase, then the caption, then the
  sublabel) sits 8px from the top and 13px from each side. It takes about
  ${ZONE_INSET_TOP}px when all three lines are present.
- Put the first child at least \`x = ${ZONE_INSET_X}\`, \`y = ${ZONE_INSET_TOP}\` inside the
  zone.
- Size the zone to wrap its contents: \`width = rightmost child's x + width +
  ${ZONE_PADDING}\` and \`height = lowest child's y + height + ${ZONE_PADDING}\`. The zone
  must also be wide enough for its uppercase header text. This is exactly what
  the editor's "Fit" produces. An empty zone defaults to
  ${dims(DEFAULT_ZONE_SIZE)}.
- Children must lie completely inside their zone. A child placed outside the
  frame is still drawn there and moves with the zone, but it looks broken.
- To nest a zone, give the inner zone a \`parent\`. The same rules apply at
  every level, so size the innermost zones first and then wrap the outer ones
  around them.
- Leave at least 60px between sibling zones, and at least 80px if edges run
  between them.
- Zones are not obstacles: connectors cross zone borders freely. An edge may
  connect to a zone itself, and it always attaches at an \`auto\` side.

### Making connections route cleanly

- **\`auto\` sides** compare the two nodes' centres. If the horizontal distance
  is greater than or equal to the vertical one, the connector leaves from the
  left or right side, otherwise from the top or bottom. Two nodes placed
  diagonally can therefore connect on sides you did not expect. For a
  deliberate look, keep connected nodes in the same row or column, or set
  \`sourceSide\`/\`targetSide\` explicitly. For example, in a left-to-right
  diagram, set \`"sourceSide": "right", "targetSide": "left"\`.
- **Obstacle avoidance:** \`orthogonal\` (the default), \`straight\` and \`curved\`
  connectors all detour around other nodes. Zones and annotations do not
  count as obstacles. The detour search only looks about 90px beyond the two
  nodes being joined, and if it finds no way through, the line runs straight
  across whatever is in the way. Do not rely on it to rescue a crowded layout.
  Keep a clear channel between every pair of connected nodes.
- **Several edges on one side:** when three edges leave a node's right side,
  they all start at the same midpoint by default. Give that side more
  connection points, e.g. \`"ports": { "right": 3 }\`, and give each edge its own
  \`sourcePort\` (1, 2, 3). Points are spaced evenly: point *i* of *n* sits at
  *i* / (*n* + 1) along the side. Number them in the same order as their
  targets (top to bottom on left and right sides, left to right on top and
  bottom sides), or the lines cross. Do the same on the target end with
  \`targetPort\` for fan-in.
- Do not connect two nodes that have a third node sitting directly between
  them. Move one of them, or route through the middle node if that is what
  the architecture means.
- Leave \`waypoints\` out unless nothing else works. See Edges above.

### Checklist before you finish

1. Every \`position\` value is a multiple of ${GRID}.
2. Every node is at least as large as its content (see the table above).
   When unsure, go wider.
3. No two boxes overlap, and connected boxes have a clear gap of 80px or more
   between them.
4. Every child sits inside its zone, below the header, with ${ZONE_PADDING}px or
   more of padding, and each zone wraps its children.
5. Connected nodes share a row or column, with their centres within 26px of
   each other, wherever the architecture allows.
6. Edges fanning out of one side use \`ports\` with distinct \`sourcePort\`s, in
   the same order as their targets.
7. The main flow runs in one direction, with as few crossings as possible.

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
