import { afterEach, describe, expect, it } from 'vitest'
import type { LayerItem } from '@/features/diagram/lib/layers'
import { planeGroups } from '@/features/diagram/lib/layers'
import { diagramStore, disposeDiagramStore } from '@/features/diagram/composables/useDiagram'
import type { DiagramDocument, DiagramNode, DiagramPlane } from '@/model'
import { DEFAULT_CANVAS, nodePlane } from '@/model'

/**
 * Building a stack from the 2D canvas: the planes tab's tree, and putting
 * nodes on planes the way the tab, the canvas's menu and the 3D legend do.
 */

const PLANES: DiagramPlane[] = [
  { id: 'data', label: 'Data' },
  { id: 'app', label: 'App' },
  { id: 'edge', label: 'Edge' },
]

const node = (
  id: string,
  kind: DiagramNode['kind'],
  parent: string | null = null,
  plane: string | null = null,
): DiagramNode => ({
  id,
  kind,
  label: id,
  shape: 'rect',
  color: 'slate',
  position: { x: 0, y: 0 },
  size: { width: 100, height: 60 },
  parent,
  plane,
})

/**
 *   zone "core"   on app
 *     api
 *     ledger      set apart, on data
 *   db
 *   cdn          on edge
 */
const NODES: DiagramNode[] = [
  node('core', 'zone', null, 'app'),
  node('api', 'shape', 'core'),
  node('ledger', 'shape', 'core', 'data'),
  node('db', 'shape'),
  node('cdn', 'shape', null, 'edge'),
]

describe('planeGroups', () => {
  const items: LayerItem[] = NODES.map((n) => ({ id: n.id, kind: n.kind, name: n.id, parent: n.parent ?? null }))
  const byId = new Map(NODES.map((n) => [n.id, n]))
  const planeOf = (id: string) => nodePlane(id, (n) => byId.get(n), PLANES)

  it('lists the planes top of the stack first, each with what stands on it', () => {
    const groups = planeGroups(items, PLANES, planeOf)
    expect(groups.map((g) => g.plane)).toEqual(['edge', 'app', 'data'])
    expect(groups.map((g) => g.members.sort())).toEqual([['cdn'], ['api', 'core'], ['db', 'ledger']])
  })

  it('keeps a node under its zone on the zone’s plane, and at the top of its own when set apart', () => {
    const [, app, data] = planeGroups(items, PLANES, planeOf)
    expect(app!.rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['core', 0],
      ['api', 1],
    ])
    expect(data!.rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['db', 0],
      ['ledger', 0],
    ])
  })

  it('stands anything it cannot place on the ground', () => {
    const groups = planeGroups(items, PLANES, () => 'gone')
    expect(groups.at(-1)!.members).toHaveLength(NODES.length)
  })

  it('has nothing to list without planes', () => {
    expect(planeGroups(items, [], planeOf)).toEqual([])
  })
})

let counter = 0
let dispose: (() => void) | null = null
afterEach(() => {
  dispose?.()
  dispose = null
})

function storeWith(nodes: DiagramNode[] = NODES) {
  const id = `planes-test-${++counter}`
  const store = diagramStore(id)
  const doc: DiagramDocument = {
    baugraph: '1.0',
    meta: { title: 'Planes' },
    canvas: { ...DEFAULT_CANVAS },
    planes: PLANES,
    nodes,
    edges: [],
    flows: [],
  }
  store.loadDocument(doc)
  dispose = () => disposeDiagramStore(id)
  /** The plane each node names in the file — `null` where it names none. */
  const written = () =>
    Object.fromEntries(store.toDocument().nodes.map((n) => [n.id, n.plane ?? null]))
  return { store, written }
}

describe('moveNodesToPlane', () => {
  it('writes the plane on a node that stands apart from its zone', () => {
    const { store, written } = storeWith()
    expect(store.moveNodesToPlane(['api'], 'edge')).toBe(true)
    expect(written().api).toBe('edge')
    expect(store.planeOfNode('api')).toBe('edge')
  })

  it('writes nothing for a node moved onto the plane it would stand on anyway', () => {
    const { store, written } = storeWith()
    // Back onto its zone's plane: it follows the zone again.
    store.moveNodesToPlane(['ledger'], 'app')
    expect(written().ledger).toBeNull()
    expect(store.planeOfNode('ledger')).toBe('app')
    // Onto the ground, from outside every zone.
    store.moveNodesToPlane(['cdn'], 'data')
    expect(written().cdn).toBeNull()
  })

  it('takes a zone’s contents along without writing a word for them', () => {
    const { store, written } = storeWith()
    store.moveNodesToPlane(['core', 'api'], 'edge')
    expect(written()).toMatchObject({ core: 'edge', api: null, ledger: 'data' })
    expect(store.planeOfNode('api')).toBe('edge')
  })

  it('brings a set-apart node back under its zone when both move together', () => {
    const { store, written } = storeWith()
    store.moveNodesToPlane(['ledger', 'core'], 'edge')
    expect(written()).toMatchObject({ core: 'edge', ledger: null })
  })

  it('refuses a plane the diagram does not have, and reports when nothing changed', () => {
    const { store } = storeWith()
    expect(store.moveNodesToPlane(['api'], 'nowhere')).toBe(false)
    expect(store.moveNodesToPlane(['api'], 'app')).toBe(false)
  })
})

describe('shiftNodesPlane', () => {
  it('moves each node one plane from wherever it stands', () => {
    const { store } = storeWith()
    expect(store.shiftNodesPlane(['db', 'api'], 1)).toBe(true)
    expect(store.planeOfNode('db')).toBe('app')
    expect(store.planeOfNode('api')).toBe('edge')
  })

  it('stops at the top and bottom of the stack', () => {
    const { store } = storeWith()
    expect(store.shiftNodesPlane(['cdn'], 1)).toBe(false)
    expect(store.shiftNodesPlane(['db'], -1)).toBe(false)
  })

  it('lets a zone’s contents ride along with it', () => {
    const { store, written } = storeWith()
    store.shiftNodesPlane(['core', 'api'], 1)
    expect(written()).toMatchObject({ core: 'edge', api: null })
  })
})
