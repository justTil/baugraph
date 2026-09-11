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
import {
  DEFAULT_CANVAS,
  EDGE_DEFAULTS,
  FLOW_DEFAULTS,
  NODE_DEFAULTS,
} from '@/model/defaults'

/**
 * Runtime schema for `.baugraph.json`.
 *
 * Every field that has a default in `defaults.ts` is optional here — a file may
 * omit it, and parsing fills it in. That is what lets the writer keep files terse
 * while the editor always sees a fully populated document.
 *
 * This schema is also the source for the published JSON Schema
 * (`npm run schema:generate` → `public/schema/baugraph-v1.schema.json`).
 */

const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'ids may contain letters, digits and . _ : -')

const vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const sizeSchema = z.object({
  width: z.number().finite().min(16),
  height: z.number().finite().min(16),
})

const metadataSchema = z.record(z.string(), z.unknown())

/**
 * Node type and technology ids. Deliberately not an enum: the catalogues live in
 * the app and grow with it, and a diagram naming something they have never heard
 * of is shown as written rather than rejected. The pattern only rules out
 * spellings that could never be a catalogue id, so `"Apache Kafka"` is caught
 * where `apache_kafka` was meant.
 */
const catalogueIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9_]*$/, 'catalogue ids are lower-case, digits and _')

/**
 * Connection points per side.
 *
 * Every side is optional and every side defaults to the one point it has always
 * had, so a file only names the sides it added to — and one written before this
 * existed parses to exactly the node it always did.
 */
const portCountSchema = z.number().int().min(1).max(MAX_PORTS)

const portsSchema = z.object({
  top: portCountSchema.optional(),
  right: portCountSchema.optional(),
  bottom: portCountSchema.optional(),
  left: portCountSchema.optional(),
})

export const nodeSchema = z.object({
  id: idSchema,
  kind: z.enum(['shape', 'zone']).default(NODE_DEFAULTS.kind),
  type: catalogueIdSchema.default(NODE_DEFAULTS.type),
  tech: catalogueIdSchema.default(NODE_DEFAULTS.tech),
  label: z.string().default(''),
  sublabel: z.string().default(NODE_DEFAULTS.sublabel),
  shape: z.enum(SHAPE_KEYS).default(NODE_DEFAULTS.shape),
  color: z.enum(COLOR_KEYS).default(NODE_DEFAULTS.color),
  border: z.enum(BORDER_WIDTHS).default(NODE_DEFAULTS.border),
  icon: z.string().default(NODE_DEFAULTS.icon),
  position: vec2Schema,
  size: sizeSchema,
  ports: portsSchema.optional(),
  parent: idSchema.nullable().default(NODE_DEFAULTS.parent),
  locked: z.boolean().default(NODE_DEFAULTS.locked),
  data: metadataSchema.optional(),
})

export const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  sourceSide: z.enum(SIDES).default(EDGE_DEFAULTS.sourceSide),
  targetSide: z.enum(SIDES).default(EDGE_DEFAULTS.targetSide),
  // Which point on that side, 1-based. A file may name one the node no longer
  // offers — a side that has since been narrowed — and the renderer falls back
  // to the last point that does exist rather than refusing to open the diagram.
  sourcePort: portCountSchema.default(EDGE_DEFAULTS.sourcePort),
  targetPort: portCountSchema.default(EDGE_DEFAULTS.targetPort),
  label: z.string().default(EDGE_DEFAULTS.label),
  route: z.enum(ROUTES).default(EDGE_DEFAULTS.route),
  line: z.enum(LINE_STYLES).default(EDGE_DEFAULTS.line),
  width: z.enum(LINE_WIDTHS).default(EDGE_DEFAULTS.width),
  arrows: z.enum(ARROW_MODES).default(EDGE_DEFAULTS.arrows),
  color: z.enum(COLOR_KEYS).nullable().default(EDGE_DEFAULTS.color),
  // No `.min(1)`: a hand-written `[]` is harmless and means the same as
  // omitting the key entirely — automatic routing.
  waypoints: z.array(vec2Schema).max(20).optional(),
  data: metadataSchema.optional(),
})

const flowEdgeStyleSchema = z.object({
  color: z.enum(COLOR_KEYS).optional(),
  token: z.enum(FLOW_TOKENS).optional(),
  speed: z.number().finite().min(10).max(4000).optional(),
})

export const flowSchema = z.object({
  id: idSchema,
  label: z.string().default(FLOW_DEFAULTS.label),
  // A flow with nothing to travel has nothing to say; the editor drops one whose
  // last connection is deleted rather than leaving it behind.
  edges: z.array(idSchema).min(1),
  from: idSchema.nullable().default(FLOW_DEFAULTS.from),
  color: z.enum(COLOR_KEYS).default(FLOW_DEFAULTS.color),
  motion: z.enum(FLOW_MOTIONS).default(FLOW_DEFAULTS.motion),
  token: z.enum(FLOW_TOKENS).default(FLOW_DEFAULTS.token),
  mode: z.enum(FLOW_MODES).default(FLOW_DEFAULTS.mode),
  speed: z.number().finite().min(10).max(4000).default(FLOW_DEFAULTS.speed),
  count: z.number().int().min(1).max(12).default(FLOW_DEFAULTS.count),
  stream: z.boolean().default(FLOW_DEFAULTS.stream),
  pause: z.number().finite().min(0).max(60).default(FLOW_DEFAULTS.pause),
  loop: z.boolean().default(FLOW_DEFAULTS.loop),
  enabled: z.boolean().default(FLOW_DEFAULTS.enabled),
  style: z.record(idSchema, flowEdgeStyleSchema).optional(),
  data: metadataSchema.optional(),
})

export const canvasSchema = z.object({
  theme: z.enum(['light', 'dark']).default(DEFAULT_CANVAS.theme),
  grid: z.boolean().default(DEFAULT_CANVAS.grid),
  snap: z.boolean().default(DEFAULT_CANVAS.snap),
  snapSize: z.number().int().min(1).max(200).default(DEFAULT_CANVAS.snapSize),
})

export const metaSchema = z.object({
  title: z.string().default('Untitled diagram'),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export const documentSchema = z
  .object({
    /** JSON Schema pointer some editors add; accepted and dropped. */
    $schema: z.string().optional(),
    baugraph: z.string().default(FORMAT_VERSION),
    meta: metaSchema.default({ title: 'Untitled diagram' }),
    canvas: canvasSchema.default(DEFAULT_CANVAS),
    nodes: z.array(nodeSchema).default([]),
    edges: z.array(edgeSchema).default([]),
    flows: z.array(flowSchema).default([]),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>()
    doc.nodes.forEach((node, i) => {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'id'],
          message: `duplicate node id "${node.id}"`,
        })
      }
      ids.add(node.id)
    })

    doc.nodes.forEach((node, i) => {
      if (node.parent == null) return
      if (!ids.has(node.parent)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'parent'],
          message: `parent "${node.parent}" does not exist`,
        })
      } else if (node.parent === node.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'parent'],
          message: 'a node cannot be its own parent',
        })
      }
    })

    // Zones may nest, so `parent` is a chain — and a chain can loop back on
    // itself. Anything walking it (layout, export) would spin forever.
    const parentOf = new Map(doc.nodes.map((node) => [node.id, node.parent ?? null]))
    doc.nodes.forEach((node, i) => {
      const seen = new Set<string>([node.id])
      let current = parentOf.get(node.id) ?? null
      while (current && parentOf.has(current)) {
        if (seen.has(current)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'parent'],
            message: `"${node.id}" is part of a parent cycle`,
          })
          break
        }
        seen.add(current)
        current = parentOf.get(current) ?? null
      }
    })

    const edgeIds = new Set<string>()
    doc.edges.forEach((edge, i) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', i, 'id'],
          message: `duplicate edge id "${edge.id}"`,
        })
      }
      edgeIds.add(edge.id)
      for (const end of ['source', 'target'] as const) {
        if (!ids.has(edge[end])) {
          ctx.addIssue({
            code: 'custom',
            path: ['edges', i, end],
            message: `${end} "${edge[end]}" does not reference an existing node`,
          })
        }
      }
    })

    // A flow is a set of references and nothing else, so every one of them has
    // to resolve — a dangling edge id would animate a connection that is not
    // there, which is a diagram lying about itself.
    const flowIds = new Set<string>()
    doc.flows.forEach((flow, i) => {
      if (flowIds.has(flow.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['flows', i, 'id'],
          message: `duplicate flow id "${flow.id}"`,
        })
      }
      flowIds.add(flow.id)

      const seenEdges = new Set<string>()
      flow.edges.forEach((edge, j) => {
        if (!edgeIds.has(edge)) {
          ctx.addIssue({
            code: 'custom',
            path: ['flows', i, 'edges', j],
            message: `"${edge}" does not reference an existing connection`,
          })
        }
        if (seenEdges.has(edge)) {
          ctx.addIssue({
            code: 'custom',
            path: ['flows', i, 'edges', j],
            message: `connection "${edge}" is listed twice in this flow`,
          })
        }
        seenEdges.add(edge)
      })

      if (flow.from != null && !ids.has(flow.from)) {
        ctx.addIssue({
          code: 'custom',
          path: ['flows', i, 'from'],
          message: `start node "${flow.from}" does not exist`,
        })
      }

      // Styling a connection the flow does not travel would draw nothing and
      // read as a bug in the diagram rather than in the file.
      for (const edge of Object.keys(flow.style ?? {})) {
        if (seenEdges.has(edge)) continue
        ctx.addIssue({
          code: 'custom',
          path: ['flows', i, 'style', edge],
          message: `"${edge}" is styled but is not one of this flow's connections`,
        })
      }
    })
  })

export type ParsedDocument = z.infer<typeof documentSchema>
