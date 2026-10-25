import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiagramDocument, DiagramNode } from '@/model'
import { blankDocument, parse, sortDocument, sortMetadata, stringify } from '@/model'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = resolve(here, '../fixtures/1.28.0/valid/order-processing.json')

const sample = (): DiagramDocument => parse(readFileSync(fixture, 'utf-8'))

/**
 * Fisher-Yates off a seeded generator rather than `Math.random()`, so a failure
 * here is the same failure tomorrow.
 */
function shuffle<T>(items: readonly T[], seed = 7): T[] {
  const out = [...items]
  let state = seed
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function node(id: string, parent?: string): DiagramNode {
  return {
    id,
    kind: parent ? 'shape' : 'zone',
    label: id,
    shape: 'rect',
    color: 'slate',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 60 },
    ...(parent ? { parent } : {}),
  }
}

describe('canonical ordering', () => {
  it('writes the same file however the document is arranged', () => {
    const doc = sample()
    const scrambled: DiagramDocument = {
      ...doc,
      nodes: shuffle(doc.nodes),
      edges: shuffle(doc.edges, 5),
      flows: shuffle(doc.flows, 3).map((flow) => ({ ...flow, edges: shuffle(flow.edges, 3) })),
    }

    expect(stringify(scrambled)).toBe(stringify(doc))
  })

  it('is idempotent — writing what was just read changes nothing', () => {
    const once = stringify(sample())
    expect(stringify(parse(once))).toBe(once)
  })

  it('keeps a zone ahead of what it contains, at any depth', () => {
    const nodes = [
      node('inner-child', 'inner'),
      node('outer-child', 'outer'),
      node('inner', 'outer'),
      node('outer'),
      node('loose'),
    ]
    const seen = new Set<string>()
    for (const n of sortDocument({ ...blankDocument('Nesting'), nodes }).nodes) {
      if (n.parent) expect(seen, `${n.id} came before its parent`).toContain(n.parent)
      seen.add(n.id)
    }
  })

  it('groups a zone with its contents rather than interleaving siblings', () => {
    const nodes = [node('zone-b'), node('zone-a'), node('b-child', 'zone-b'), node('a-child', 'zone-a')]
    const order = sortDocument({ ...blankDocument('Grouping'), nodes }).nodes.map((n) => n.id)
    expect(order).toEqual(['zone-a', 'a-child', 'zone-b', 'b-child'])
  })

  it('survives a parent cycle instead of hanging on it', () => {
    const nodes = [
      { ...node('a', 'b'), kind: 'zone' as const },
      { ...node('b', 'a'), kind: 'zone' as const },
    ]
    expect(sortDocument({ ...blankDocument('Cycle'), nodes }).nodes.map((n) => n.id).sort()).toEqual(
      ['a', 'b'],
    )
  })

  it('groups connections by the node they leave', () => {
    const doc = sample()
    const sources = sortDocument(doc).edges.map((edge) => edge.source)
    expect([...sources]).toEqual([...sources].sort())
  })

  it('orders a flow the way the connections are written', () => {
    const doc = sample()
    const [flow] = sortDocument(doc).flows
    if (!flow) return
    const rank = new Map(sortDocument(doc).edges.map((edge, i) => [edge.id, i]))
    const ranks = flow.edges.map((id) => rank.get(id) ?? Number.MAX_SAFE_INTEGER)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('sorts metadata keys without touching list order', () => {
    expect(sortMetadata({ zeta: 1, alpha: { b: 2, a: [3, 1, 2] } })).toEqual({
      alpha: { a: [3, 1, 2], b: 2 },
      zeta: 1,
    })
    expect(Object.keys(sortMetadata({ zeta: 1, alpha: 2 }))).toEqual(['alpha', 'zeta'])
  })

  it('leaves user metadata alone apart from its key order', () => {
    const doc = sample()
    const first = doc.nodes[0]!
    const withData: DiagramDocument = {
      ...doc,
      nodes: [{ ...first, data: { owner: 'platform', ticket: ['B-2', 'B-1'] } }, ...doc.nodes.slice(1)],
    }
    expect(parse(stringify(withData)).nodes.find((n) => n.id === first.id)?.data).toEqual({
      owner: 'platform',
      ticket: ['B-2', 'B-1'],
    })
  })

  it('does not mutate the document it is given', () => {
    const doc = sample()
    const before = doc.nodes.map((n) => n.id)
    sortDocument(doc)
    expect(doc.nodes.map((n) => n.id)).toEqual(before)
  })
})
