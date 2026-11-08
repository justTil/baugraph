import { describe, expect, it } from 'vitest'
import type { LayerItem } from '@/features/diagram/lib/layers'
import { canMoveInto, layerRows } from '@/features/diagram/lib/layers'
import { diagramStore, disposeDiagramStore } from '@/features/diagram/composables/useDiagram'
import type { DiagramDocument, DiagramNode } from '@/model'
import { DEFAULT_CANVAS } from '@/model'

const item = (id: string, kind: LayerItem['kind'], parent: string | null = null, name = id): LayerItem => ({
  id,
  kind,
  name,
  parent,
})

/**
 *   zone "Backend"
 *     zone "Data"
 *       db
 *     api
 *   web
 *   note (annotation)
 */
const tree: LayerItem[] = [
  item('web', 'shape', null, 'Web'),
  item('note', 'annotation', null, 'Note'),
  item('api', 'shape', 'backend', 'API'),
  item('db', 'shape', 'data', 'Postgres'),
  item('data', 'zone', 'backend', 'Data'),
  item('backend', 'zone', null, 'Backend'),
]

const ids = (rows: { item: LayerItem }[]) => rows.map((row) => row.item.id)

describe('layerRows', () => {
  it('nests nodes under their zones, zones first at every level', () => {
    const rows = layerRows(tree)
    expect(ids(rows)).toEqual(['backend', 'data', 'db', 'api', 'web', 'note'])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 1, 0, 0])
    expect(rows[0]).toMatchObject({ childCount: 2, expanded: true })
  })

  it('orders names the way a person counts', () => {
    const rows = layerRows([item('a', 'shape', null, 'Worker 10'), item('b', 'shape', null, 'Worker 9')])
    expect(ids(rows)).toEqual(['b', 'a'])
  })

  it('hides what is inside a collapsed zone', () => {
    const rows = layerRows(tree, { collapsed: new Set(['backend']) })
    expect(ids(rows)).toEqual(['backend', 'web', 'note'])
    expect(rows[0]).toMatchObject({ childCount: 2, expanded: false })
  })

  it('lists a match with the zones it sits in, opened even if collapsed', () => {
    const rows = layerRows(tree, { collapsed: new Set(['backend', 'data']), query: 'postgres' })
    expect(ids(rows)).toEqual(['backend', 'data', 'db'])
    expect(rows.map((row) => row.match)).toEqual([false, false, true])
  })

  it('searches the extra terms too', () => {
    const items = [{ ...item('db', 'shape'), terms: ['Database', 'PostgreSQL'] }]
    expect(ids(layerRows(items, { query: 'postgresql' }))).toEqual(['db'])
  })

  it('still lists a node whose parent is missing or circular, at the top', () => {
    const rows = layerRows([
      item('orphan', 'shape', 'gone'),
      item('a', 'zone', 'b'),
      item('b', 'zone', 'a'),
    ])
    expect(ids(rows).sort()).toEqual(['a', 'b', 'orphan'])
    expect(rows.every((row) => row.depth === 0)).toBe(true)
  })
})

describe('canMoveInto', () => {
  it('lets a node into a zone, or out to the top level', () => {
    expect(canMoveInto(tree, ['web'], 'data')).toBe(true)
    expect(canMoveInto(tree, ['db'], null)).toBe(true)
  })

  it('refuses a zone dropped into itself or into a zone inside it', () => {
    expect(canMoveInto(tree, ['backend'], 'backend')).toBe(false)
    expect(canMoveInto(tree, ['backend'], 'data')).toBe(false)
  })

  it('refuses anything that is not a zone, and a move that changes nothing', () => {
    expect(canMoveInto(tree, ['web'], 'api')).toBe(false)
    expect(canMoveInto(tree, ['api'], 'backend')).toBe(false)
    expect(canMoveInto(tree, [], null)).toBe(false)
  })
})

/* --------------------------------------------------------- moving nodes */

const node = (
  id: string,
  kind: DiagramNode['kind'],
  x: number,
  y: number,
  width: number,
  height: number,
  parent: string | null = null,
  locked = false,
): DiagramNode => ({
  id,
  kind,
  label: id,
  shape: 'rect',
  color: 'slate',
  position: { x, y },
  size: { width, height },
  parent,
  locked,
})

let counter = 0

/** A fresh store holding `nodes`, plus a way to read where each one now is. */
function storeWith(nodes: DiagramNode[]) {
  const id = `layers-test-${++counter}`
  const store = diagramStore(id)
  const doc: DiagramDocument = {
    baugraph: '1.0',
    meta: { title: 'Layers' },
    canvas: { ...DEFAULT_CANVAS },
    nodes,
    edges: [],
    flows: [],
  }
  store.loadDocument(doc)

  const get = (nodeId: string) => store.toDocument().nodes.find((n) => n.id === nodeId)!
  /** Canvas position, walking the zones the node sits in. */
  const at = (nodeId: string) => {
    let n = get(nodeId)
    let { x, y } = n.position
    while (n.parent) {
      n = get(n.parent)
      x += n.position.x
      y += n.position.y
    }
    return { x, y }
  }
  return { store, get, at, dispose: () => disposeDiagramStore(id) }
}

describe('moveToGroup', () => {
  const zone = node('zone', 'zone', 0, 0, 300, 200)
  const inside = node('inside', 'shape', 34, 50, 100, 60, 'zone')

  it('leaves a node that already sits inside the zone where it is', () => {
    const { store, get, at, dispose } = storeWith([zone, inside, node('b', 'shape', 100, 100, 100, 60)])
    expect(store.moveToGroup(['b'], 'zone')).toBe(true)
    expect(get('b').parent).toBe('zone')
    expect(at('b')).toEqual({ x: 100, y: 100 })
    dispose()
  })

  it('sets a node from elsewhere down inside the zone, under its contents, and grows the zone', () => {
    const { store, get, at, dispose } = storeWith([zone, inside, node('b', 'shape', 800, 600, 100, 60)])
    store.moveToGroup(['b'], 'zone')
    expect(get('b').parent).toBe('zone')
    // Lined up with what is there, one gap below it.
    expect(at('b')).toEqual({ x: 34, y: 50 + 60 + 40 })
    expect(get('zone').size.height).toBe(50 + 60 + 40 + 60 + 34)
    dispose()
  })

  it('moves several nodes as one block', () => {
    const { store, at, get, dispose } = storeWith([
      zone,
      inside,
      node('b', 'shape', 800, 600, 100, 60),
      node('c', 'shape', 950, 620, 100, 60),
    ])
    store.moveToGroup(['b', 'c'], 'zone')
    expect(at('c').x - at('b').x).toBe(150)
    expect(at('c').y - at('b').y).toBe(20)
    expect(get('zone').size.width).toBeGreaterThanOrEqual(at('c').x + 100 + 34)
    dispose()
  })

  it('grows every zone around the one that grew', () => {
    const { store, get, dispose } = storeWith([
      node('outer', 'zone', 0, 0, 380, 280),
      node('zone', 'zone', 34, 50, 300, 200, 'outer'),
      node('inside', 'shape', 34, 50, 100, 60, 'zone'),
      node('b', 'shape', 900, 900, 100, 60),
    ])
    store.moveToGroup(['b'], 'zone')
    const inner = get('zone')
    expect(get('outer').size.height).toBe(inner.position.y + inner.size.height + 34)
    dispose()
  })

  it('takes a node out to just clear of its zone', () => {
    const { store, get, at, dispose } = storeWith([zone, inside])
    store.moveToGroup(['inside'], null)
    expect(get('inside').parent).toBeNull()
    expect(at('inside')).toEqual({ x: 300 + 40, y: 50 })
    dispose()
  })

  it('leaves nothing for the canvas to regroup afterwards', () => {
    const { store, dispose } = storeWith([
      zone,
      inside,
      node('other', 'zone', 360, 0, 200, 200),
      node('b', 'shape', 800, 600, 100, 60),
    ])
    store.moveToGroup(['b'], 'zone')
    store.moveToGroup(['inside'], null)
    // `inside` first lands in `other`, right beside its old zone, and has to
    // be moved on past it.
    expect(store.regroup(['b', 'inside'])).toBe(false)
    dispose()
  })

  it('will not put a zone inside itself, or move a locked node', () => {
    const { store, get, dispose } = storeWith([
      zone,
      node('nested', 'zone', 20, 40, 120, 100, 'zone'),
      node('pinned', 'shape', 600, 600, 100, 60, null, true),
    ])
    expect(store.moveToGroup(['zone'], 'nested')).toBe(false)
    expect(store.moveToGroup(['pinned'], 'zone')).toBe(false)
    expect(get('pinned').parent ?? null).toBeNull()
    dispose()
  })
})
