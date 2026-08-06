import { z } from 'zod'
import {
  ARROW_MODES,
  COLOR_KEYS,
  FORMAT_VERSION,
  LINE_STYLES,
  ROUTES,
  SHAPE_KEYS,
  SIDES,
} from '@/model/types'
import { DEFAULT_CANVAS, EDGE_DEFAULTS, NODE_DEFAULTS } from '@/model/defaults'

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

export const nodeSchema = z.object({
  id: idSchema,
  kind: z.enum(['shape', 'zone']).default(NODE_DEFAULTS.kind),
  type: catalogueIdSchema.default(NODE_DEFAULTS.type),
  tech: catalogueIdSchema.default(NODE_DEFAULTS.tech),
  label: z.string().default(''),
  sublabel: z.string().default(NODE_DEFAULTS.sublabel),
  shape: z.enum(SHAPE_KEYS).default(NODE_DEFAULTS.shape),
  color: z.enum(COLOR_KEYS).default(NODE_DEFAULTS.color),
  icon: z.string().default(NODE_DEFAULTS.icon),
  position: vec2Schema,
  size: sizeSchema,
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
  label: z.string().default(EDGE_DEFAULTS.label),
  route: z.enum(ROUTES).default(EDGE_DEFAULTS.route),
  line: z.enum(LINE_STYLES).default(EDGE_DEFAULTS.line),
  arrows: z.enum(ARROW_MODES).default(EDGE_DEFAULTS.arrows),
  color: z.enum(COLOR_KEYS).nullable().default(EDGE_DEFAULTS.color),
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
  })

export type ParsedDocument = z.infer<typeof documentSchema>
