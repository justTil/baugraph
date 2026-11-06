import { describe, expect, it } from 'vitest'
import type { DiagramDocument } from '@/model'
import { parse } from '@/model'
import {
  FLAT_DEPTH,
  STAND_HEIGHT,
  anchor,
  arcHeight,
  arcPoints,
  edgeBows,
  pointOnTrack,
  stackLayout,
  track,
} from '@/features/diagram/lib/scene3d'

const node = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  label: id,
  position: { x, y },
  size: { width: 120, height: 60 },
  ...extra,
})

const doc = (body: Record<string, unknown>): DiagramDocument =>
  parse({ baugraph: '1.0', meta: { title: 'Stack' }, nodes: [], edges: [], ...body })

describe('stackLayout', () => {
  it('keeps every node exactly where the 2D canvas has it', () => {
    const layout = stackLayout(
      doc({
        nodes: [node('zone', 100, 50, { kind: 'zone', size: { width: 300, height: 200 } }), node('a', 20, 40, { parent: 'zone' })],
      }),
    )
    // Parent-relative in the file, absolute here.
    expect(layout.nodes.find((n) => n.node.id === 'a')!.box).toEqual({ x: 120, y: 90, width: 120, height: 60 })
  })

  it('raises a node by the zone floors under it', () => {
    const layout = stackLayout(
      doc({
        nodes: [
          node('outer', 0, 0, { kind: 'zone' }),
          node('inner', 10, 10, { kind: 'zone', parent: 'outer' }),
          node('svc', 10, 10, { parent: 'inner' }),
          node('loose', 500, 0),
        ],
      }),
    )
    const depth = Object.fromEntries(layout.nodes.map((n) => [n.node.id, n.depth]))
    expect(depth).toEqual({ outer: 0, inner: 1, svc: 2, loose: 0 })
  })

  it('stands every node up but a zone and a flat one, a Tall or a Tower on a post', () => {
    const layout = stackLayout(
      doc({
        nodes: [
          node('a', 0, 0),
          node('b', 0, 0, { extrusion: 'tower' }),
          node('mat', 0, 0, { extrusion: 'flat' }),
          node('zone', 0, 0, { kind: 'zone' }),
          node('note', 0, 0, { kind: 'annotation', shape: 'text' }),
        ],
      }),
    )
    const by = Object.fromEntries(layout.nodes.map((n) => [n.node.id, n]))
    expect(Object.fromEntries(layout.nodes.map((n) => [n.node.id, n.standing]))).toEqual({
      a: true,
      b: true,
      mat: false,
      zone: false,
      note: true,
    })
    // Standing, a node is as tall as its face, and a post adds to that.
    expect(by.a!.height).toBe(60)
    expect(by.b!).toMatchObject({ stand: STAND_HEIGHT.tower, height: STAND_HEIGHT.tower + 60 })
    // Lying flat, it is only as thick as it is; a text annotation is only its face.
    expect(by.mat!.height).toBe(FLAT_DEPTH)
    expect(by.note!.thickness).toBe(0)
  })

  it('makes each shape the solid it stands for, as deep as that solid is', () => {
    const size = { width: 160, height: 100 }
    const thickness = (shape: string, extra: Record<string, unknown> = {}) =>
      stackLayout(doc({ nodes: [node('n', 0, 0, { shape, size, ...extra })] })).nodes[0]!.thickness
    // A database is a drum, its lid a circle: as deep as it is wide, even set Low.
    expect(thickness('cylinder')).toBe(160)
    expect(thickness('cylinder', { extrusion: 'low' })).toBe(160)
    // A queue is a tube and a circle a ball: round, so as deep as they are tall.
    expect(thickness('queue')).toBe(100)
    expect(thickness('circle')).toBe(100)
    // A box is a block, a good part of its shorter side deep; Low thins it.
    expect(thickness('rect')).toBe(75)
    expect(thickness('rect', { extrusion: 'low' })).toBe(45)
    // A note stays a sheet of paper.
    expect(thickness('note')).toBe(6)
  })

  it('draws every connection, and leaves out one whose end is missing', () => {
    const layout = stackLayout(
      doc({
        nodes: [node('a', 0, 0), node('b', 300, 0)],
        edges: [{ id: 'a--b', source: 'a', target: 'b' }],
      }),
    )
    expect(layout.edges).toEqual([expect.objectContaining({ bow: 0 })])
    expect(layout.edges[0]!.edge.id).toBe('a--b')
  })

  it('pads one floor under everything', () => {
    const { footprint } = stackLayout(doc({ nodes: [node('a', 0, 0), node('b', 300, 100)] }))
    expect(footprint).toEqual({ x: -60, y: -60, width: 540, height: 280 })
  })
})

describe('edgeBows', () => {
  const edge = (id: string, source: string, target: string) =>
    ({ id, source, target }) as Parameters<typeof edgeBows>[0][number]

  it('leaves a lone connection straight', () => {
    expect(edgeBows([edge('x', 'a', 'b'), edge('y', 'b', 'c')])).toEqual(
      new Map([
        ['x', 0],
        ['y', 0],
      ]),
    )
  })

  it('swings a request and its reply apart, to opposite sides', () => {
    const bows = edgeBows([edge('req', 'a', 'b'), edge('reply', 'b', 'a')])
    // Measured from each one's own direction, so equal numbers mean opposite sides.
    expect(bows.get('req')).toBe(bows.get('reply'))
    expect(bows.get('req')).not.toBe(0)

    const ab = { x: 0, y: 0, z: 0 }
    const ba = { x: 300, y: 0, z: 0 }
    const req = arcPoints(ab, ba, bows.get('req'))
    const reply = arcPoints(ba, ab, bows.get('reply'))
    const mid = (points: { z: number }[]) => points[Math.floor(points.length / 2)]!.z
    expect(Math.sign(mid(req))).toBe(-Math.sign(mid(reply)))
  })

  it('fans three connections between one pair out evenly about the middle', () => {
    const bows = edgeBows([edge('1', 'a', 'b'), edge('2', 'a', 'b'), edge('3', 'a', 'b')])
    expect([bows.get('1'), bows.get('2'), bows.get('3')]).toEqual([-24, 0, 24])
  })
})

describe('arcs', () => {
  const peak = (points: { y: number }[]) => Math.max(...points.map((p) => p.y))

  it('arch from the top of one node to the top of the other, at the same slant at both ends', () => {
    const from = { x: 0, y: 60, z: 0 }
    const to = { x: 400, y: 60, z: 100 }
    const points = arcPoints(from, to)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
    // Up out of the one, down into the other — at a slant, not straight up like a staple.
    const out = { run: Math.hypot(points[1]!.x - from.x, points[1]!.z - from.z), rise: points[1]!.y - from.y }
    const into = { run: Math.hypot(to.x - points.at(-2)!.x, to.z - points.at(-2)!.z), rise: points.at(-2)!.y - to.y }
    expect(out.run).toBeGreaterThan(0)
    expect(out.rise).toBeGreaterThan(0)
    expect(into.rise).toBeCloseTo(out.rise, 6)
    expect(into.run).toBeCloseTo(out.run, 6)
  })

  it('rise higher the farther they go, at the same angle whatever the length', () => {
    const arch = (distance: number) => arcPoints({ x: 0, y: 0, z: 0 }, { x: distance, y: 0, z: 0 })
    expect(peak(arch(800))).toBeCloseTo(arcHeight(800), 6)
    expect(peak(arch(800))).toBeGreaterThan(peak(arch(300)))
    const slant = (points: { x: number; y: number }[]) => points[1]!.y / points[1]!.x
    expect(slant(arch(800))).toBeCloseTo(slant(arch(300)), 6)
    // Never flatter than a hop, between two nodes side by side.
    expect(peak(arch(40))).toBe(30)
  })

  it('drop into a node raised far above the one they left from above', () => {
    const points = arcPoints({ x: 0, y: 0, z: 0 }, { x: 60, y: 200, z: 0 })
    expect(points.at(-2)!.y).toBeGreaterThan(200)
  })

  it('swing their middle aside by the bow, and keep their ends', () => {
    const from = { x: 0, y: 0, z: 0 }
    const to = { x: 300, y: 0, z: 0 }
    const points = arcPoints(from, to, 20)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
    expect(Math.abs(points[points.length >> 1]!.z)).toBeCloseTo(20, 6)
  })

  it('loop over the top of a node that sends to itself', () => {
    const at = { x: 50, y: 60, z: 30 }
    const points = arcPoints(at, at)
    expect(points[0]).toEqual(at)
    expect(points.at(-1)!.x).toBeCloseTo(at.x, 6)
    expect(points.at(-1)!.y).toBeCloseTo(at.y, 6)
    expect(peak(points)).toBeGreaterThan(at.y + 20)
  })
})

describe('anchor', () => {
  const layout = stackLayout(
    doc({
      nodes: [
        node('svc', 0, 0, { size: { width: 120, height: 60 } }),
        node('zone', 400, 0, { kind: 'zone', size: { width: 200, height: 100 } }),
        node('mat', 0, 300, { extrusion: 'flat' }),
      ],
    }),
  )
  const by = Object.fromEntries(layout.nodes.map((n) => [n.node.id, n]))

  it('meets every connection of a node at one point, the middle of its top', () => {
    expect(anchor(by.svc!)).toEqual({ x: 60, y: 30 })
    expect(anchor(by.mat!)).toEqual({ x: 60, y: 330 })
  })

  it('meets a zone over the middle of its back wall, clear of what it holds', () => {
    expect(anchor(by.zone!)).toEqual({ x: 500, y: 0 })
  })
})

describe('tracks', () => {
  it('measure their length and place along it by distance', () => {
    const t = track([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 30, z: 0 },
    ])
    expect(t.length).toBe(40)
    expect(pointOnTrack(t, 0.5, { x: 0, y: 0, z: 0 })).toEqual({ x: 10, y: 10, z: 0 })
    expect(pointOnTrack(t, 2, { x: 0, y: 0, z: 0 })).toEqual({ x: 10, y: 30, z: 0 })
  })
})
