import { describe, expect, it } from 'vitest'
import type { SpaceNode } from '@/model'
import { moveInSpace, parse, pinInSpace, resetInSpace, spacePositions, stringify } from '@/model'

/**
 * Where nodes stand in the 3D view, and what moving them there writes. The
 * rules: a node never moved in 3D stands where the canvas has it — within its
 * zone, wherever that zone was moved to — and moving in 3D only ever writes
 * `position3d`, never `position`.
 */

const n = (id: string, x: number, y: number, extra: Partial<SpaceNode> = {}): SpaceNode => ({
  id,
  position: { x, y },
  ...extra,
})

/**
 *   zone  at (100, 50)
 *     api   (20, 40) inside it
 *     inner zone (200, 40) inside it
 *       svc (10, 10) inside that
 *   db    at (600, 0)
 */
const NODES: SpaceNode[] = [
  n('zone', 100, 50),
  n('api', 20, 40, { parent: 'zone' }),
  n('inner', 200, 40, { parent: 'zone' }),
  n('svc', 10, 10, { parent: 'inner' }),
  n('db', 600, 0),
]

const at = (nodes: SpaceNode[]) => Object.fromEntries(spacePositions(nodes))

describe('spacePositions', () => {
  it('puts every node exactly where the canvas has it until something is moved in 3D', () => {
    expect(at(NODES)).toEqual({
      zone: { x: 100, y: 50, z: 0 },
      api: { x: 120, y: 90, z: 0 },
      inner: { x: 300, y: 90, z: 0 },
      svc: { x: 310, y: 100, z: 0 },
      db: { x: 600, y: 0, z: 0 },
    })
  })

  it('stands a placed node where it was put, whatever the canvas says', () => {
    const nodes = NODES.map((node) => (node.id === 'db' ? { ...node, position3d: { x: -40, y: 900, z: 120 } } : node))
    expect(at(nodes).db).toEqual({ x: -40, y: 900, z: 120 })
  })

  it('carries what a moved zone holds along with it, height included, at any depth', () => {
    const nodes = NODES.map((node) => (node.id === 'zone' ? { ...node, position3d: { x: 1000, y: 0, z: 80 } } : node))
    const placed = at(nodes)
    expect(placed.api).toEqual({ x: 1020, y: 40, z: 80 })
    expect(placed.svc).toEqual({ x: 1210, y: 50, z: 80 })
    // Not inside the zone, so not carried.
    expect(placed.db).toEqual({ x: 600, y: 0, z: 0 })
  })

  it('keeps a node placed on its own where it was put when its zone moves', () => {
    const nodes = NODES.map((node) =>
      node.id === 'zone'
        ? { ...node, position3d: { x: 1000, y: 0, z: 0 } }
        : node.id === 'api'
          ? { ...node, position3d: { x: 5, y: 5, z: 5 } }
          : node,
    )
    expect(at(nodes).api).toEqual({ x: 5, y: 5, z: 5 })
  })

  it('survives a parent cycle in a half-edited document', () => {
    const nodes = [n('a', 10, 0, { parent: 'b' }), n('b', 0, 10, { parent: 'a' })]
    const placed = at(nodes)
    expect(Number.isFinite(placed.a!.x) && Number.isFinite(placed.b!.y)).toBe(true)
  })
})

describe('moveInSpace', () => {
  const delta = { x: 50, y: -20, z: 30 }

  it('writes a moved node’s 3D place, starting from where the canvas has it', () => {
    expect(Object.fromEntries(moveInSpace(NODES, ['db'], delta))).toEqual({ db: { x: 650, y: -20, z: 30 } })
  })

  it('moves a zone with one write and lets everything inside follow', () => {
    const writes = moveInSpace(NODES, ['zone'], delta)
    expect([...writes.keys()]).toEqual(['zone'])
    const after = at(NODES.map((node) => (writes.has(node.id) ? { ...node, position3d: writes.get(node.id)! } : node)))
    expect(after.svc).toEqual({ x: 360, y: 80, z: 30 })
  })

  it('shifts a node inside the zone that had been placed on its own, so it comes along too', () => {
    const nodes = NODES.map((node) => (node.id === 'svc' ? { ...node, position3d: { x: 0, y: 0, z: 0 } } : node))
    const writes = moveInSpace(nodes, ['zone'], delta)
    expect(Object.fromEntries(writes)).toEqual({
      zone: { x: 150, y: 30, z: 30 },
      svc: { x: 50, y: -20, z: 30 },
    })
  })

  it('moves a node once when its zone is moved with it', () => {
    const writes = moveInSpace(NODES, ['api', 'zone'], delta)
    expect([...writes.keys()]).toEqual(['zone'])
  })

  it('writes nothing for no movement or for nodes that do not exist', () => {
    expect(moveInSpace(NODES, ['zone'], { x: 0, y: 0, z: 0 }).size).toBe(0)
    expect(moveInSpace(NODES, ['ghost'], delta).size).toBe(0)
  })
})

describe('resetInSpace', () => {
  const moved = NODES.map((node) =>
    node.id === 'zone'
      ? { ...node, position3d: { x: 1000, y: 0, z: 40 } }
      : node.id === 'svc'
        ? { ...node, position3d: { x: 1300, y: 300, z: 40 } }
        : node,
  )

  it('sends a node back to the canvas’s place, and what it holds along with it', () => {
    const writes = resetInSpace(moved, ['zone'])
    expect(writes.get('zone')).toBeNull()
    // svc was 300/300/40 off the zone's moved place; it keeps that offset from the zone's canvas place.
    expect(writes.get('svc')).toEqual({ x: 400, y: 350, z: 0 })
  })

  it('writes nothing for nodes that were never moved in 3D', () => {
    expect(resetInSpace(NODES, ['zone', 'db']).size).toBe(0)
  })
})

describe('pinInSpace', () => {
  it('pins what follows a moved zone, and leaves what still follows the canvas', () => {
    const moved = NODES.map((node) => (node.id === 'zone' ? { ...node, position3d: { x: 1000, y: 0, z: 0 } } : node))
    expect(Object.fromEntries(pinInSpace(moved, ['api', 'inner']))).toEqual({
      api: { x: 1020, y: 40, z: 0 },
      inner: { x: 1200, y: 40, z: 0 },
    })
    expect(pinInSpace(NODES, ['api', 'inner']).size).toBe(0)
  })
})

describe('position3d in the file', () => {
  const file = (nodes: object[]) =>
    parse({ baugraph: '1.0', meta: { title: 'Space' }, nodes, edges: [] })

  it('is left out until a node is moved in 3D, so a 2D diagram’s file does not change', () => {
    const text = stringify(file([{ id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } }]))
    expect(text).not.toContain('position3d')
  })

  it('is written on one line, rounded, beside the plane', () => {
    const text = stringify(
      file([
        {
          id: 'a',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 60 },
          position3d: { x: 12.3456, y: -4, z: 80.001 },
        },
      ]),
    )
    expect(text).toContain('"position3d": { "x": 12.35, "y": -4, "z": 80 }')
  })

  it('round-trips, and is rejected when it is not a point', () => {
    const doc = file([
      { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, position3d: { x: 1, y: 2, z: 3 } },
    ])
    expect(parse(stringify(doc)).nodes[0]!.position3d).toEqual({ x: 1, y: 2, z: 3 })
    expect(() =>
      file([{ id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, position3d: { x: 1, y: 2 } }]),
    ).toThrow()
  })
})
