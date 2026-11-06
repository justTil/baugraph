import { describe, expect, it } from 'vitest'
import type { DiagramDocument } from '@/model'
import { parse } from '@/model'
import {
  NODE_DEPTH,
  STAND_HEIGHT,
  cablePoints,
  liftRoute,
  pointOnTrack,
  samplePath,
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

const levels = (d: DiagramDocument) =>
  Object.fromEntries(stackLayout(d).nodes.map((n) => [n.node.id, n.level]))

describe('stackLayout', () => {
  it('stands a diagram without planes on one implicit ground plane', () => {
    const layout = stackLayout(doc({ nodes: [node('a', 0, 0), node('b', 300, 0)] }))
    expect(layout.planes).toEqual([{ id: null, label: '', color: 'slate', level: 0, count: 2 }])
    expect(layout.nodes.map((n) => n.level)).toEqual([0, 0])
  })

  it('keeps every node where the 2D canvas has it', () => {
    const layout = stackLayout(
      doc({
        planes: [{ id: 'ground' }, { id: 'dmz' }],
        nodes: [node('zone', 100, 50, { kind: 'zone' }), node('a', 20, 40, { parent: 'zone', plane: 'dmz' })],
      }),
    )
    // Parent-relative in the file, absolute here, and unchanged by the plane.
    expect(layout.nodes.find((n) => n.node.id === 'a')!.box).toMatchObject({ x: 120, y: 90 })
  })

  it('stacks planes ground first and puts a plane-less node on the ground', () => {
    const d = doc({
      planes: [{ id: 'data' }, { id: 'app' }, { id: 'dmz' }],
      nodes: [node('db', 0, 0, { plane: 'data' }), node('gw', 0, 0, { plane: 'dmz' }), node('loose', 0, 0)],
    })
    expect(levels(d)).toEqual({ db: 0, gw: 2, loose: 0 })
    expect(stackLayout(d).planes.map((p) => p.count)).toEqual([2, 0, 1])
  })

  it('carries a zone’s contents onto the zone’s plane, unless they name their own', () => {
    const d = doc({
      planes: [{ id: 'ground' }, { id: 'app' }, { id: 'dmz' }],
      nodes: [
        node('cluster', 0, 0, { kind: 'zone', plane: 'app' }),
        node('inner', 0, 0, { kind: 'zone', parent: 'cluster' }),
        node('svc', 10, 10, { parent: 'inner' }),
        node('edge-proxy', 10, 10, { parent: 'cluster', plane: 'dmz' }),
      ],
    })
    expect(levels(d)).toEqual({ cluster: 1, inner: 1, svc: 1, 'edge-proxy': 2 })
  })

  it('raises a node by the zone floors under it on its own plane only', () => {
    const layout = stackLayout(
      doc({
        planes: [{ id: 'ground' }, { id: 'dmz' }],
        nodes: [
          node('zone', 0, 0, { kind: 'zone' }),
          node('inside', 10, 10, { parent: 'zone' }),
          node('lifted', 10, 10, { parent: 'zone', plane: 'dmz' }),
        ],
      }),
    )
    const depth = Object.fromEntries(layout.nodes.map((n) => [n.node.id, n.depth]))
    expect(depth).toEqual({ zone: 0, inside: 1, lifted: 0 })
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
    expect(by.mat!.height).toBe(NODE_DEPTH.flat)
    expect(by.note!.thickness).toBe(0)
  })

  it('stands a node across the middle of its box, as deep as it is', () => {
    const [a] = stackLayout(doc({ nodes: [node('a', 100, 200)] })).nodes
    expect(a!.floor).toEqual({ x: 100, y: 230 - NODE_DEPTH.regular / 2, width: 120, height: NODE_DEPTH.regular })
  })

  it('plugs a connection into a standing node’s side at its connection point’s height', () => {
    const layout = stackLayout(
      doc({
        nodes: [node('a', 0, 0, { ports: { right: 3 } }), node('b', 400, 0)],
        edges: [
          { id: 'top', source: 'a', target: 'b', sourceSide: 'right', sourcePort: 1, targetSide: 'left' },
          { id: 'bottom', source: 'a', target: 'b', sourceSide: 'right', sourcePort: 3, targetSide: 'left' },
        ],
      }),
    )
    const [top, bottom] = layout.edges
    // The first of three points down the canvas side sits high on the standing side, the last low.
    expect(top!.ends[0].up).toBeCloseTo(45)
    expect(bottom!.ends[0].up).toBeCloseTo(15)
    // Into the middle of the other node's side.
    expect(top!.ends[1].up).toBeCloseTo(30)
    // Seen from straight above everything lies flat, and the line runs just over the floor.
    expect(top!.ends[0].flat).toBeLessThan(10)
  })

  it('meets a standing node’s canvas top high on its back, and its bottom low on its front', () => {
    const layout = stackLayout(
      doc({
        nodes: [node('a', 0, 0), node('b', 0, 300)],
        edges: [{ id: 'down', source: 'a', target: 'b', sourceSide: 'bottom', targetSide: 'top' }],
      }),
    )
    const [down] = layout.edges
    // Out of a's foot, at the front…
    expect(down!.ends[0].up).toBeLessThan(15)
    // …into b near its top, at the back.
    expect(down!.ends[1].up).toBeGreaterThan(45)
  })

  it('rises evenly between two heights, level out of one end and into the other', () => {
    const points = liftRoute(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
      70,
    )
    expect(points.map((p) => p.y)).toEqual([10, 40, 70])
    expect(points.map((p) => p.z)).toEqual([0, 0, 0])
  })

  it('keeps an in-plane connection on the route the canvas draws', () => {
    const layout = stackLayout(
      doc({
        nodes: [node('a', 0, 0), node('b', 300, 0)],
        edges: [{ id: 'a--b', source: 'a', target: 'b', sourceSide: 'right', targetSide: 'left' }],
      }),
    )
    const [edge] = layout.edges
    expect(edge!.route).not.toBeNull()
    // Out of a's right side, into b's left — along the canvas's own line.
    expect(edge!.route![0]!.x).toBeCloseTo(122, 0)
    expect(edge!.route!.at(-1)!.x).toBeCloseTo(298, 0)
    expect(edge!.route!.every((p) => Math.abs(p.y - 30) < 1)).toBe(true)
  })

  it('turns a connection between planes into a cable with no 2D route', () => {
    const layout = stackLayout(
      doc({
        planes: [{ id: 'ground' }, { id: 'dmz' }],
        nodes: [node('a', 0, 0, { plane: 'dmz' }), node('b', 300, 0)],
        edges: [{ id: 'a--b', source: 'a', target: 'b' }],
      }),
    )
    expect(layout.edges[0]).toMatchObject({ from: 1, to: 0, route: null })
  })

  it('only routes around nodes on the same plane', () => {
    // `wall` sits squarely between a and b on the canvas, but a plane up.
    const nodes = [node('a', 0, 0), node('b', 400, 0), node('wall', 180, -20, { size: { width: 80, height: 100 } })]
    const edges = [{ id: 'a--b', source: 'a', target: 'b', sourceSide: 'right', targetSide: 'left' }]
    const flat = stackLayout(doc({ nodes, edges })).edges[0]!.route!
    const stacked = stackLayout(
      doc({
        planes: [{ id: 'ground' }, { id: 'up' }],
        nodes: nodes.map((n) => (n.id === 'wall' ? { ...n, plane: 'up' } : n)),
        edges,
      }),
    ).edges[0]!.route!
    expect(flat.some((p) => Math.abs(p.y - 30) > 5)).toBe(true)
    expect(stacked.every((p) => Math.abs(p.y - 30) < 1)).toBe(true)
  })

  it('pads one footprint for every plate', () => {
    const { footprint } = stackLayout(doc({ nodes: [node('a', 0, 0), node('b', 300, 100)] }))
    expect(footprint).toEqual({ x: -60, y: -60, width: 540, height: 280 })
  })
})

describe('samplePath', () => {
  it('splits a straight line into short steps', () => {
    const points = samplePath('M0,0L30,0', 10)
    expect(points.map((p) => p.x)).toEqual([0, 10, 20, 30])
  })

  it('follows a rounded corner through its control point', () => {
    const points = samplePath('M0,0L10,0Q20,0 20,10L20,20', 5)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 20, y: 20 })
    // Inside the corner, never out past it.
    expect(points.every((p) => p.x <= 20 && p.y >= 0)).toBe(true)
  })

  it('ends a cubic exactly where the path does', () => {
    const points = samplePath('M0,0C0,50 100,50 100,0')
    expect(points.at(-1)).toEqual({ x: 100, y: 0 })
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(37.5, 0)
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

  it('run a cable vertically out of one end and into the other', () => {
    const from = { x: 0, y: 0, z: 0 }
    const to = { x: 200, y: 300, z: 50 }
    const points = cablePoints(from, to)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
    // Leaves straight up: the first step barely moves sideways.
    expect(Math.abs(points[1]!.x)).toBeLessThan(1)
    expect(points[1]!.y).toBeGreaterThan(0)
    for (let i = 1; i < points.length; i++) expect(points[i]!.y).toBeGreaterThanOrEqual(points[i - 1]!.y)
  })
})
