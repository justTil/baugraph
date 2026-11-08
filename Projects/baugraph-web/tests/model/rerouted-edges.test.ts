import { describe, expect, it } from 'vitest'
import type { DiagramDocument, DiagramEdge, DiagramNode } from '@/model'
import { blankDocument, MAX_WAYPOINTS, parse, safeParse, stringify } from '@/model'
import { toFileObject } from '@/model/serialize'
import type { Box } from '@/features/diagram/lib/edge-path'
import { edgeGeometry, moveSegment, tidyWaypoints } from '@/features/diagram/lib/edge-path'

const node = (id: string, x: number, y: number): DiagramNode => ({
  id,
  kind: 'shape',
  label: id.toUpperCase(),
  shape: 'rect',
  color: 'slate',
  position: { x, y },
  size: { width: 100, height: 100 },
})

const edge = (extra: Partial<DiagramEdge> = {}): DiagramEdge => ({
  id: 'a--b',
  source: 'a',
  target: 'b',
  sourceSide: 'auto',
  targetSide: 'auto',
  route: 'orthogonal',
  line: 'solid',
  arrows: 'target',
  ...extra,
})

const doc = (edges: DiagramEdge[]): DiagramDocument => ({
  ...blankDocument('Rerouted'),
  nodes: [node('a', 0, 0), node('b', 300, 200)],
  edges,
})

const boxOf = (n: DiagramNode): Box => ({ ...n.position, ...n.size })

/** The line as the canvas and the export draw it, from a document alone. */
function drawn(d: DiagramDocument) {
  const [a, b] = d.nodes
  const e = d.edges[0]!
  return edgeGeometry(boxOf(a!), boxOf(b!), {
    sourceSide: e.sourceSide,
    targetSide: e.targetSide,
    route: e.route,
    waypoints: e.waypoints,
  })
}

describe('a rerouted connection in the file', () => {
  // What the editor writes after taking over the automatic route and dragging
  // a leg out past the end of the source's side, and tidying on release.
  const auto = drawn(doc([edge()]))
  const moved = moveSegment(auto.points!, 0, -40.4, {
    start: auto.startSlide,
    end: auto.endSlide,
  })
  const rerouted = doc([edge({ waypoints: tidyWaypoints(auto.start, moved, auto.end) })])

  it('round-trips, and the line is drawn where it was on the canvas', () => {
    const back = parse(stringify(rerouted))
    const before = rerouted.edges[0]!.waypoints!
    const after = back.edges[0]!.waypoints!
    expect(after).toHaveLength(before.length)
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i]!.x, 2)
      expect(p.y).toBeCloseTo(before[i]!.y, 2)
    })
    const [was, is] = [drawn(rerouted), drawn(back)]
    expect(is.points!.length).toBe(was.points!.length)
    is.points!.forEach((p, i) => {
      expect(p.x).toBeCloseTo(was.points![i]!.x, 2)
      expect(p.y).toBeCloseTo(was.points![i]!.y, 2)
    })
  })

  it('writes each point on a line of its own, to two decimals at most', () => {
    const text = stringify(rerouted)
    expect(text).not.toMatch(/"[xy]": -?\d+\.\d{3}/)
    const block = text.match(/"waypoints": \[([\s\S]*?)\]/)![1]!
    const lines = block.split('\n').filter((l) => l.trim())
    expect(lines).toHaveLength(rerouted.edges[0]!.waypoints!.length)
    for (const line of lines) expect(line).toMatch(/^\s*\{ "x": -?[\d.]+, "y": -?[\d.]+ \},?$/)
  })

  it('writes nothing for an automatic connection — and a reset is one', () => {
    expect(toFileObject(doc([edge()])).edges).toEqual([
      expect.not.objectContaining({ waypoints: expect.anything() }),
    ])
    const reset = doc([edge({ waypoints: undefined })])
    expect(stringify(reset)).toBe(stringify(doc([edge()])))
  })

  it('keeps the ends on auto, so a reset hands the whole route back', () => {
    const back = parse(stringify(rerouted))
    expect(back.edges[0]!.sourceSide).toBe('auto')
    expect(back.edges[0]!.targetSide).toBe('auto')
  })

  it('opens up to the bend point limit, and not past it', () => {
    const points = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 150, y: i * 10 }))
    expect(safeParse(stringify(doc([edge({ waypoints: points(MAX_WAYPOINTS) })]))).ok).toBe(true)
    expect(safeParse(stringify(doc([edge({ waypoints: points(MAX_WAYPOINTS + 1) })]))).ok).toBe(
      false,
    )
  })
})
