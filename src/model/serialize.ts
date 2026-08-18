import type { DiagramDocument, DiagramEdge, DiagramNode, MessageFlow } from '@/model/types'
import { FORMAT_VERSION } from '@/model/types'
import { EDGE_DEFAULTS, FLOW_DEFAULTS, NODE_DEFAULTS, blankDocument } from '@/model/defaults'
import { documentSchema } from '@/model/schema'
import { migrate } from '@/model/migrate'

/** Where the published JSON Schema lives, relative to the deployed app. */
export const SCHEMA_URL = `${import.meta.env.BASE_URL}schema/baugraph-v1.schema.json`

export class DiagramParseError extends Error {
  constructor(
    message: string,
    /** `path: message` pairs, one per validation failure. */
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'DiagramParseError'
  }
}

/** Drops keys whose value equals the format default. */
function omitDefaults<T extends object>(value: T, defaults: Partial<T>): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue
    if (key in defaults && Object.is((defaults as Record<string, unknown>)[key], v)) continue
    out[key] = v
  }
  return out as Partial<T>
}

/** Reorders an object's keys to `order`; anything unlisted is appended. */
function ordered<T extends object>(value: T, order: (keyof T)[]): T {
  const out: Record<string, unknown> = {}
  for (const key of order) {
    if (key in value && (value as Record<string, unknown>)[key as string] !== undefined) {
      out[key as string] = (value as Record<string, unknown>)[key as string]
    }
  }
  for (const key of Object.keys(value)) {
    if (!(key in out) && (value as Record<string, unknown>)[key] !== undefined) {
      out[key] = (value as Record<string, unknown>)[key]
    }
  }
  return out as T
}

const NODE_KEY_ORDER: (keyof DiagramNode)[] = [
  'id',
  'kind',
  'type',
  'tech',
  'label',
  'sublabel',
  'shape',
  'color',
  'border',
  'icon',
  'position',
  'size',
  'parent',
  'locked',
  'data',
]

const EDGE_KEY_ORDER: (keyof DiagramEdge)[] = [
  'id',
  'source',
  'target',
  'sourceSide',
  'targetSide',
  'label',
  'route',
  'line',
  'width',
  'arrows',
  'color',
  'data',
]

const FLOW_KEY_ORDER: (keyof MessageFlow)[] = [
  'id',
  'label',
  'edges',
  'from',
  'color',
  'motion',
  'token',
  'mode',
  'speed',
  'count',
  'stream',
  'pause',
  'loop',
  'enabled',
  'style',
  'data',
]

/** Rounds a coordinate so float noise never shows up in a diff. */
const round = (n: number) => Math.round(n * 100) / 100

/**
 * Produces the plain object that gets written to disk.
 *
 * Deterministic by construction: fixed key order, defaults omitted, coordinates
 * rounded, and nodes/edges kept in document order (which the editor preserves).
 * Saving an unchanged diagram twice yields byte-identical output.
 */
export function toFileObject(doc: DiagramDocument): Record<string, unknown> {
  const nodes = doc.nodes.map((node) => {
    const trimmed = omitDefaults(
      {
        ...node,
        position: { x: round(node.position.x), y: round(node.position.y) },
        size: { width: round(node.size.width), height: round(node.size.height) },
      },
      NODE_DEFAULTS,
    )
    if (trimmed.data && Object.keys(trimmed.data).length === 0) delete trimmed.data
    return ordered(trimmed as DiagramNode, NODE_KEY_ORDER)
  })

  const edges = doc.edges.map((edge) => {
    const trimmed = omitDefaults({ ...edge }, EDGE_DEFAULTS)
    if (trimmed.data && Object.keys(trimmed.data).length === 0) delete trimmed.data
    return ordered(trimmed as DiagramEdge, EDGE_KEY_ORDER)
  })

  const flows = (doc.flows ?? []).map((flow) => {
    const trimmed = omitDefaults({ ...flow }, FLOW_DEFAULTS)
    if (trimmed.data && Object.keys(trimmed.data).length === 0) delete trimmed.data
    // An override that overrides nothing is noise, and so is an empty map of them.
    if (trimmed.style) {
      const style = Object.fromEntries(
        Object.entries(trimmed.style).filter(([, value]) => Object.keys(value).length > 0),
      )
      if (Object.keys(style).length) trimmed.style = style
      else delete trimmed.style
    }
    return ordered(trimmed as MessageFlow, FLOW_KEY_ORDER)
  })

  return {
    $schema: SCHEMA_URL,
    baugraph: doc.baugraph || FORMAT_VERSION,
    meta: ordered({ ...doc.meta }, ['title', 'description', 'createdAt', 'updatedAt']),
    canvas: ordered({ ...doc.canvas }, ['theme', 'grid', 'snap', 'snapSize']),
    nodes,
    edges,
    // A diagram with no flows says nothing about them: an empty array would show
    // up as a change in every file the moment this feature shipped.
    ...(flows.length ? { flows } : {}),
  }
}

/**
 * Coordinate pairs are printed on one line. `JSON.stringify` would spread
 * `{ "x": 300, "y": 60 }` over four, turning "moved a node" into a four-line
 * diff — the single most common change a diagram ever sees.
 */
const INLINE_KEYS = new Set(['position', 'size'])

/**
 * Keys whose *children* are each one line. A flow's per-connection overrides are
 * keyed by edge id, so the keys cannot be listed above — but each override is
 * one small idea ("this one is red") and reads as one line.
 */
const INLINE_CHILD_KEYS = new Set(['style'])

function format(value: unknown, indent: string, key?: string, inline = false): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    // A list of plain values — a flow's connection ids — is one thing, so it goes
    // on one line. Only lists of objects (nodes, edges) are stacked.
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
    }
    const inner = indent + '  '
    return `[\n${value.map((v) => inner + format(v, inner)).join(',\n')}\n${indent}]`
  }

  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (!entries.length) return '{}'
  if (inline || (key && INLINE_KEYS.has(key))) {
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
  }

  const inner = indent + '  '
  const inlineChildren = !!key && INLINE_CHILD_KEYS.has(key)
  const body = entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner, k, inlineChildren)}`)
    .join(',\n')
  return `{\n${body}\n${indent}}`
}

/** Serialises a document to the exact text written to a `.baugraph.json` file. */
export function stringify(doc: DiagramDocument): string {
  return `${format(toFileObject(doc), '')}\n`
}

/**
 * Parses and validates file contents into a fully-populated document.
 * Throws `DiagramParseError` with per-field issues on invalid input.
 */
export function parse(input: string | unknown): DiagramDocument {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch (error) {
      throw new DiagramParseError(
        `Not valid JSON: ${(error as Error).message}`,
      )
    }
  }

  const result = documentSchema.safeParse(migrate(raw))
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }))
    throw new DiagramParseError(
      `${issues.length} problem${issues.length === 1 ? '' : 's'} in this diagram file`,
      issues,
    )
  }

  const { $schema: _schema, ...doc } = result.data
  return doc as DiagramDocument
}

/** Non-throwing variant, for UI paths that want to show the issues inline. */
export function safeParse(
  input: string | unknown,
): { ok: true; document: DiagramDocument } | { ok: false; error: DiagramParseError } {
  try {
    return { ok: true, document: parse(input) }
  } catch (error) {
    if (error instanceof DiagramParseError) return { ok: false, error }
    return { ok: false, error: new DiagramParseError((error as Error).message) }
  }
}

export { blankDocument }
