import { describe, expect, it } from 'vitest'
import type { DiagramDocument, DiagramEdge, DiagramNode } from '@/model'
import {
  blankDocument,
  parse,
  portFraction,
  prunePortPositions,
  safeParse,
  stringify,
} from '@/model'
import { toFileObject } from '@/model/serialize'

const node = (id: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  kind: 'shape',
  label: id.toUpperCase(),
  shape: 'rect',
  color: 'slate',
  position: { x: id === 'a' ? 0 : 300, y: 0 },
  size: { width: 140, height: 60 },
  ...extra,
})

const edge = (extra: Partial<DiagramEdge> = {}): DiagramEdge => ({
  id: 'a--b',
  source: 'a',
  target: 'b',
  sourceSide: 'auto',
  targetSide: 'auto',
  label: 'HTTP',
  route: 'orthogonal',
  line: 'solid',
  arrows: 'target',
  ...extra,
})

function doc(nodes: DiagramNode[], edges: DiagramEdge[] = []): DiagramDocument {
  return { ...blankDocument('Moved'), nodes, edges }
}

const fileEdge = (d: DiagramDocument) => (toFileObject(d).edges as Record<string, unknown>[])[0]!
const fileNode = (d: DiagramDocument, i = 0) =>
  (toFileObject(d).nodes as Record<string, unknown>[])[i]!

describe('portFraction', () => {
  it('spreads unmoved points evenly, the way a side always has', () => {
    expect(portFraction(1, 1)).toBe(0.5)
    expect([1, 2, 3].map((p) => portFraction(3, p))).toEqual([0.25, 0.5, 0.75])
  })

  it('puts a moved point where it was put, and only that one', () => {
    const moved = { '2': 0.9 }
    expect([1, 2, 3].map((p) => portFraction(3, p, moved))).toEqual([0.25, 0.9, 0.75])
  })

  it('falls back to the last point for a number past the end, moved or not', () => {
    expect(portFraction(2, 5)).toBe(portFraction(2, 2))
    expect(portFraction(2, 5, { '2': 0.1 })).toBe(0.1)
  })
})

describe('prunePortPositions', () => {
  it('drops points the side no longer has, and empty sides, and nothing left at all', () => {
    expect(prunePortPositions({ right: { '1': 0.2, '3': 0.8 } }, { right: 2 })).toEqual({
      right: { '1': 0.2 },
    })
    expect(prunePortPositions({ right: { '3': 0.8 } }, { right: 2 })).toBeUndefined()
    expect(prunePortPositions({ top: {} }, undefined)).toBeUndefined()
    expect(prunePortPositions(undefined, undefined)).toBeUndefined()
  })
})

describe('moved labels in the file', () => {
  it('writes nothing for a label that was never moved', () => {
    const out = fileEdge(doc([node('a'), node('b')], [edge()]))
    expect(out).not.toHaveProperty('labelPosition')
    expect(out).not.toHaveProperty('labelOffset')
  })

  it('round-trips a moved label', () => {
    const d = doc(
      [node('a'), node('b')],
      [edge({ labelPosition: 0.2, labelOffset: { x: 0, y: -24 } })],
    )
    const back = parse(stringify(d)).edges[0]!
    expect(back.labelPosition).toBe(0.2)
    expect(back.labelOffset).toEqual({ x: 0, y: -24 })
  })

  it('rounds float noise out of both', () => {
    const out = fileEdge(
      doc(
        [node('a'), node('b')],
        [edge({ labelPosition: 0.123456789, labelOffset: { x: 1.23456, y: -7.0001 } })],
      ),
    )
    expect(out.labelPosition).toBe(0.1235)
    expect(out.labelOffset).toEqual({ x: 1.23, y: -7 })
  })

  it('drops an offset that rounds to nothing', () => {
    const out = fileEdge(
      doc([node('a'), node('b')], [edge({ labelPosition: 0.3, labelOffset: { x: 0.001, y: 0 } })]),
    )
    expect(out.labelPosition).toBe(0.3)
    expect(out).not.toHaveProperty('labelOffset')
  })

  it('keeps the offset on one line, next to the label', () => {
    const text = stringify(
      doc(
        [node('a'), node('b')],
        // A non-default route, so there is a key after the label's to order against.
        [edge({ route: 'curved', labelPosition: 0.2, labelOffset: { x: 0, y: -24 } })],
      ),
    )
    expect(text).toContain('"labelOffset": { "x": 0, "y": -24 }')
    expect(text.indexOf('"labelPosition"')).toBeGreaterThan(text.indexOf('"label"'))
    expect(text.indexOf('"labelPosition"')).toBeLessThan(text.indexOf('"route"'))
  })

  it('refuses a place along the line past either end', () => {
    const raw = toFileObject(doc([node('a'), node('b')], [edge()]))
    ;(raw.edges as Record<string, unknown>[])[0]!.labelPosition = 1.5
    expect(safeParse(raw).ok).toBe(false)
  })
})

describe('moved connection points in the file', () => {
  it('writes nothing for a node whose points were never moved', () => {
    expect(fileNode(doc([node('a', { ports: { right: 3 } })]))).not.toHaveProperty(
      'portPositions',
    )
  })

  it('round-trips moved points', () => {
    const d = doc([
      node('a', { ports: { right: 3 }, portPositions: { right: { '2': 0.8 }, top: { '1': 0.25 } } }),
    ])
    expect(parse(stringify(d)).nodes[0]!.portPositions).toEqual({
      right: { '2': 0.8 },
      top: { '1': 0.25 },
    })
  })

  it('writes them on one line, spaced like the rest of the file', () => {
    const text = stringify(doc([node('a', { portPositions: { left: { '1': 0.3 } } })]))
    expect(text).toContain('"portPositions": { "left": { "1": 0.3 } }')
  })

  it('drops a moved point the side no longer offers', () => {
    const out = fileNode(
      doc([node('a', { ports: { right: 2 }, portPositions: { right: { '1': 0.2, '4': 0.9 } } })]),
    )
    expect(out.portPositions).toEqual({ right: { '1': 0.2 } })
  })

  it('accepts and ignores a point number past the side, rather than refusing the file', () => {
    const raw = toFileObject(doc([node('a')]))
    ;(raw.nodes as Record<string, unknown>[])[0]!.portPositions = { right: { '3': 0.5 } }
    const result = safeParse(raw)
    expect(result.ok).toBe(true)
  })

  it('refuses a point that could never exist, or a place off the side', () => {
    for (const portPositions of [{ right: { '7': 0.5 } }, { right: { '1': 1.2 } }, { right: { x: 0.5 } }]) {
      const raw = toFileObject(doc([node('a')]))
      ;(raw.nodes as Record<string, unknown>[])[0]!.portPositions = portPositions
      expect(safeParse(raw).ok, JSON.stringify(portPositions)).toBe(false)
    }
  })
})
