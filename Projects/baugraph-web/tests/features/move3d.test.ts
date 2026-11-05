import { afterEach, describe, expect, it } from 'vitest'
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import type { DiagramDocument, DiagramNode } from '@/model'
import { DEFAULT_CANVAS, parse } from '@/model'
import { diagramStore, disposeDiagramStore } from '@/features/diagram/composables/useDiagram'
import { stackLayout } from '@/features/diagram/lib/scene3d'
import {
  constrain,
  constraintPoint,
  numericDelta,
  snapDelta,
  typeNumber,
} from '@/features/diagram/lib/transform3d'

/**
 * Moving nodes in the 3D view. The promise under test: the 3D layout can part
 * ways with the 2D one completely, and the 2D one never notices.
 */

/* ------------------------------------------------------------------ store */

const node = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id,
  kind: 'shape',
  label: id,
  shape: 'rect',
  color: 'slate',
  position: { x, y },
  size: { width: 100, height: 60 },
  ...extra,
})

/**
 *   zone  at (100, 100), 400×300
 *     api   (40, 60) inside it
 *   db    at (700, 100)
 */
const NODES: DiagramNode[] = [
  node('zone', 100, 100, { kind: 'zone', size: { width: 400, height: 300 } }),
  node('api', 40, 60, { parent: 'zone' }),
  node('db', 700, 100),
]

let counter = 0
let dispose: (() => void) | null = null
afterEach(() => {
  dispose?.()
  dispose = null
})

function storeWith(nodes: DiagramNode[] = NODES) {
  const id = `move3d-test-${++counter}`
  const store = diagramStore(id)
  store.loadDocument({
    baugraph: '1.0',
    meta: { title: 'Move' },
    canvas: { ...DEFAULT_CANVAS },
    nodes,
    edges: [{ id: 'api--db', source: 'api', target: 'db', sourceSide: 'auto', targetSide: 'auto', route: 'orthogonal', line: 'solid', arrows: 'target' }],
    flows: [],
  })
  dispose = () => disposeDiagramStore(id)
  const doc = () => store.toDocument()
  /** Everything the 2D canvas reads, by node. */
  const canvas = () =>
    Object.fromEntries(doc().nodes.map((n) => [n.id, { position: n.position, size: n.size, parent: n.parent ?? null }]))
  const select = (...ids: string[]) => {
    store.nodes.value = store.nodes.value.map((n) => ({ ...n, selected: ids.includes(n.id) }))
  }
  return { store, doc, canvas, select }
}

describe('moving in 3D', () => {
  it('never changes anything the 2D canvas reads', () => {
    const { store, canvas } = storeWith()
    const before = canvas()
    store.moveNodes3D(['zone'], { x: 500, y: -200, z: 120 })
    store.moveNodes3D(['db'], { x: -50, y: 0, z: 0 })
    store.setNodePosition3D('api', { x: 0, y: 0, z: 0 })
    expect(canvas()).toEqual(before)
  })

  it('writes only position3d, and only for what does not follow its zone', () => {
    const { store, doc } = storeWith()
    store.moveNodes3D(['zone'], { x: 500, y: 0, z: 40 })
    const written = Object.fromEntries(doc().nodes.map((n) => [n.id, n.position3d ?? null]))
    expect(written).toEqual({ zone: { x: 600, y: 100, z: 40 }, api: null, db: null })
    expect(store.positions3D().get('api')).toEqual({ x: 640, y: 160, z: 40 })
  })

  it('leaves a locked node where it is unless its zone carries it', () => {
    const { store } = storeWith(NODES.map((n) => (n.id === 'db' ? { ...n, locked: true } : n)))
    expect(store.moveNodes3D(['db'], { x: 10, y: 0, z: 0 })).toBe(false)
  })

  it('goes back to the canvas’s layout, and diagram without 3D places writes none', () => {
    const { store, doc } = storeWith()
    store.moveNodes3D(['zone', 'db'], { x: 30, y: 30, z: 30 })
    expect(store.placedCount.value).toBe(2)
    store.resetNodes3D(['db'])
    expect(store.placedCount.value).toBe(1)
    store.resetLayout3D()
    expect(doc().nodes.every((n) => !n.position3d)).toBe(true)
  })

  it('undoes in one step', () => {
    const { store, doc } = storeWith()
    store.commit()
    store.moveNodes3D(['zone'], { x: 30, y: 0, z: 0 })
    store.undo()
    expect(doc().nodes.every((n) => !n.position3d)).toBe(true)
  })
})

describe('2D edits keep what was placed in 3D where it is', () => {
  it('a node moved on the canvas does not move in 3D once it has been placed there', () => {
    const { store, select } = storeWith()
    store.moveNodes3D(['db'], { x: 0, y: 0, z: 50 })
    const placed = store.positions3D().get('db')
    select('db')
    store.nudgeSelection(200, 200)
    expect(store.positions3D().get('db')).toEqual(placed)
  })

  it('deleting a zone moved in 3D leaves what it held where it stood', () => {
    const { store, doc, select } = storeWith()
    store.moveNodes3D(['zone'], { x: 500, y: 0, z: 40 })
    const api = store.positions3D().get('api')
    select('zone')
    store.removeSelection()
    expect(doc().nodes.find((n) => n.id === 'api')!.parent).toBeNull()
    expect(store.positions3D().get('api')).toEqual(api)
  })

  it('ungrouping a zone moved in 3D does the same', () => {
    const { store, select } = storeWith()
    store.moveNodes3D(['zone'], { x: 500, y: 0, z: 0 })
    const api = store.positions3D().get('api')
    select('zone')
    store.ungroupSelection()
    expect(store.positions3D().get('api')).toEqual(api)
  })

  it('a zone that grows up and left on the canvas keeps what it holds still in 3D', () => {
    const { store } = storeWith()
    store.moveNodes3D(['zone'], { x: 1000, y: 0, z: 0 })
    const api = store.positions3D().get('api')
    // Pulled out of the zone's top-left corner on the canvas, then fitted around:
    // the zone's frame moves up and left, and every child's offset into it changes.
    store.nodes.value = store.nodes.value.map((n) => (n.id === 'api' ? { ...n, position: { x: -80, y: -60 } } : n))
    const apiAfterDrag = store.positions3D().get('api')!
    store.autoSizeNodes(['zone'])
    expect(store.positions3D().get('api')).toEqual(apiAfterDrag)
    expect(apiAfterDrag).not.toEqual(api)
  })

  it('a copy of a node placed in 3D lands beside it in 3D', () => {
    const { store, doc, select } = storeWith()
    store.moveNodes3D(['db'], { x: 0, y: 0, z: 90 })
    select('db')
    store.duplicateSelection()
    const copy = doc().nodes.find((n) => n.id !== 'db' && n.label === 'db')!
    expect(copy.position3d).toEqual({ x: 724, y: 124, z: 90 })
  })
})

/* ------------------------------------------------------------------ scene */

const docOf = (body: Record<string, unknown>): DiagramDocument =>
  parse({ baugraph: '1.0', meta: { title: 'Stack' }, nodes: [], edges: [], ...body })

const box = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id,
  label: id,
  position: { x, y },
  size: { width: 120, height: 60 },
  ...extra,
})

describe('the 3D layout with nodes moved in 3D', () => {
  it('stands a placed node at its 3D place, lifted by its height', () => {
    const layout = stackLayout(docOf({ nodes: [box('a', 0, 0, { position3d: { x: 300, y: 400, z: 70 } })] }))
    expect(layout.nodes[0]).toMatchObject({ box: { x: 300, y: 400 }, canvas: { x: 0, y: 0 }, elevation: 70 })
  })

  it('runs a connection between two heights as a cable, even on one plane', () => {
    const layout = stackLayout(
      docOf({
        nodes: [box('a', 0, 0, { position3d: { x: 0, y: 0, z: 200 } }), box('b', 300, 0)],
        edges: [{ id: 'a--b', source: 'a', target: 'b' }],
      }),
    )
    expect(layout.edges[0]).toMatchObject({ from: 0, to: 0, route: null })
  })

  it('keeps hand-placed bend points with ends that moved together, and drops them for ends that parted', () => {
    const edges = [
      {
        id: 'a--b',
        source: 'a',
        target: 'b',
        sourceSide: 'right',
        targetSide: 'left',
        waypoints: [
          { x: 200, y: 30 },
          { x: 200, y: 200 },
        ],
      },
    ]
    const zone = { id: 'z', kind: 'zone', label: 'z', position: { x: 0, y: 0 }, size: { width: 600, height: 400 } }
    const together = stackLayout(
      docOf({
        nodes: [{ ...zone, position3d: { x: 1000, y: 0, z: 0 } }, box('a', 0, 0, { parent: 'z' }), box('b', 400, 200, { parent: 'z' })],
        edges,
      }),
    ).edges[0]!.route!
    // The bend is carried 1000 to the right with the zone: its upright leg runs at x = 1200.
    const upright = (route: { x: number; y: number }[], x: number) =>
      route.some((p) => Math.abs(p.x - x) < 1 && p.y > 80 && p.y < 160)
    expect(upright(together, 1200)).toBe(true)

    const parted = stackLayout(
      docOf({ nodes: [box('a', 0, 0, { position3d: { x: 0, y: 500, z: 0 } }), box('b', 400, 200)], edges }),
    ).edges[0]!.route!
    expect(upright(parted, 200)).toBe(false)
  })

  it('never moves the planes because a node was moved in 3D', () => {
    const planes = [{ id: 'ground' }, { id: 'up' }]
    const nodes = [box('a', 0, 0), box('b', 300, 0, { plane: 'up' })]
    const flat = stackLayout(docOf({ planes, nodes }))
    const far = stackLayout(
      docOf({ planes, nodes: nodes.map((n) => (n.id === 'a' ? { ...n, position3d: { x: 9000, y: 9000, z: 0 } } : n)) }),
    )
    expect(far.gap).toBe(flat.gap)
    // The plates still take in everything.
    expect(far.footprint.x + far.footprint.width).toBeGreaterThan(9000)
  })
})

/* -------------------------------------------------------------- transform */

describe('constraining a move', () => {
  it('locks to an axis, to the plane of the other two with ⇧, and lets go on the same key', () => {
    expect(constrain([], 'x', false)).toEqual(['x'])
    expect(constrain(['x'], 'x', false)).toEqual([])
    expect(constrain(['x'], 'z', false)).toEqual(['z'])
    expect(constrain([], 'z', true)).toEqual(['x', 'y'])
    expect(constrain(['x', 'y'], 'z', true)).toEqual([])
  })
})

describe('typing a distance', () => {
  const type = (keys: string[]) => keys.reduce((text, key) => typeNumber(text, key) ?? text, '')

  it('builds a number from digits, a decimal point, a sign and backspace', () => {
    expect(type(['1', '2', '0'])).toBe('120')
    expect(type(['-', '4', ',', '5'])).toBe('-4.5')
    expect(type(['.', '5'])).toBe('0.5')
    expect(type(['3', '0', 'Backspace'])).toBe('3')
    expect(type(['3', '-'])).toBe('-3')
    expect(typeNumber('', 'q')).toBeNull()
  })

  it('goes along the constraint’s axis, or x', () => {
    expect(numericDelta('120', ['z'])).toEqual({ x: 0, y: 0, z: 120 })
    expect(numericDelta('-30', [])).toEqual({ x: -30, y: 0, z: 0 })
    expect(numericDelta('-', ['y'])).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('snaps to the grid', () => {
    expect(snapDelta({ x: 14, y: -6, z: 25.1 }, 10)).toEqual({ x: 10, y: -10, z: 30 })
  })
})

describe('following the pointer', () => {
  // Looking straight down at the origin, the way the top view does.
  const camera = new PerspectiveCamera(40, 1, 1, 10000)
  camera.position.set(0, 1000, 0.001)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const ray = (x: number, y: number) => {
    const caster = new Raycaster()
    caster.setFromCamera(new Vector2(x, y), camera)
    return caster.ray
  }
  const pivot = new Vector3(0, 0, 0)
  const facing = new Vector3(0, 1, 0)

  it('meets the floor where the pointer is, for a move across it', () => {
    const hit = constraintPoint(ray(0.5, 0), pivot, ['x', 'y'], facing)!
    expect(hit.y).toBeCloseTo(0)
    expect(hit.x).toBeGreaterThan(0)
  })

  it('stays on its axis', () => {
    const hit = constraintPoint(ray(0.5, 0.5), pivot, ['x'], facing)!
    expect(hit.y).toBeCloseTo(0)
    expect(hit.z).toBeCloseTo(0)
    expect(hit.x).toBeGreaterThan(0)
  })

  it('gives up on an axis pointing straight at the camera rather than fling the selection away', () => {
    expect(constraintPoint(ray(0, 0), pivot, ['z'], facing)).toBeNull()
  })
})
