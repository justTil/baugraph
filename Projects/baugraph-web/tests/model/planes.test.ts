import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, planeId, safeParse, stringify } from '@/model'

/**
 * The 3D view's planes, and a node's `plane` and `extrusion`, were added after
 * the format shipped and are optional on top of it. The cases that matter most
 * are the ones where a file says nothing about 3D: it has to read, and write
 * back, exactly as it did before any of this existed.
 */
const here = dirname(fileURLToPath(import.meta.url))
const fixtures = resolve(here, '../fixtures/1.28.0/valid')

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id.toUpperCase(),
  position: { x: 0, y: 0 },
  size: { width: 100, height: 60 },
  ...extra,
})

const file = (doc: Record<string, unknown>) =>
  JSON.stringify({
    baugraph: '1.0',
    meta: { title: 'Stack' },
    nodes: [node('a')],
    edges: [],
    ...doc,
  })

describe('a 2D diagram', () => {
  it('parses without any planes', () => {
    expect(parse(file({})).planes).toBeUndefined()
  })

  it('reads its nodes onto the ground at the regular height', () => {
    const [a] = parse(file({})).nodes
    expect(a!.plane).toBeNull()
    expect(a!.extrusion).toBe('regular')
  })

  it('writes none of the 3D keys', () => {
    const text = stringify(parse(file({})))
    expect(text).not.toContain('planes')
    expect(text).not.toContain('"plane"')
    expect(text).not.toContain('extrusion')
  })

  it('writes no key for an empty plane list', () => {
    expect(stringify(parse(file({ planes: [] })))).not.toContain('planes')
  })

  // Real files committed by earlier releases, so "nothing changes" is checked
  // against what people actually have rather than against a minimal stand-in.
  for (const name of ['order-processing.json', 'animation1.baugraph.json']) {
    it(`leaves ${name} exactly as it was written`, () => {
      const once = stringify(parse(readFileSync(join(fixtures, name), 'utf-8')))
      expect(stringify(parse(once))).toBe(once)
      expect(once).not.toMatch(/"planes"|"plane"|"extrusion"/)
    })
  }
})

describe('planes', () => {
  const planes = [
    { id: 'data', label: 'Data tier', color: 'green' },
    { id: 'app', label: 'Application tier' },
    { id: 'dmz', label: 'DMZ', color: 'amber' },
  ]

  it('keep the order they were written in, ground first', () => {
    // Deliberately not alphabetical: the order is the stacking.
    const doc = parse(stringify(parse(file({ planes }))))
    expect(doc.planes!.map((p) => p.id)).toEqual(['data', 'app', 'dmz'])
  })

  it('fill in a colour and drop it again when it is the default', () => {
    const doc = parse(file({ planes }))
    expect(doc.planes![1]!.color).toBe('slate')
    expect(stringify(doc)).toContain('{ "id": "app", "label": "Application tier" }')
  })

  it('are each written on one line, ahead of the nodes', () => {
    const text = stringify(parse(file({ planes })))
    expect(text).toContain('{ "id": "dmz", "label": "DMZ", "color": "amber" }')
    expect(text.indexOf('"planes"')).toBeLessThan(text.indexOf('"nodes"'))
  })

  it('reject a duplicate id', () => {
    const result = safeParse(file({ planes: [{ id: 'dmz' }, { id: 'dmz' }] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]!.path).toBe('planes.1.id')
  })

  it('are written the same way twice', () => {
    const once = stringify(parse(file({ planes })))
    expect(stringify(parse(once))).toBe(once)
  })
})

describe('a node in 3D', () => {
  const planes = [{ id: 'ground' }, { id: 'dmz', label: 'DMZ' }]

  it('keeps its plane and extrusion, next to its parent', () => {
    const doc = parse(
      file({
        planes,
        nodes: [
          node('zone', { kind: 'zone' }),
          node('gateway', { parent: 'zone', plane: 'dmz', extrusion: 'tall' }),
        ],
      }),
    )
    const text = stringify(doc)
    expect(text).toMatch(/"parent": "zone",\n\s+"plane": "dmz",\n\s+"extrusion": "tall"/)
    expect(parse(text).nodes.find((n) => n.id === 'gateway')).toMatchObject({
      plane: 'dmz',
      extrusion: 'tall',
    })
  })

  it('is rejected on a plane the file does not define', () => {
    const result = safeParse(file({ planes, nodes: [node('a', { plane: 'nowhere' })] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]!.message).toContain('"nowhere"')
  })

  it('is rejected on a plane when the file defines none', () => {
    expect(safeParse(file({ nodes: [node('a', { plane: 'dmz' })] })).ok).toBe(false)
  })

  it('is rejected at an extrusion that does not exist', () => {
    expect(safeParse(file({ nodes: [node('a', { extrusion: 'huge' })] })).ok).toBe(false)
  })
})

describe('planeId', () => {
  it('derives from the label and steps around ids already taken', () => {
    expect(planeId('Data tier', [])).toBe('data-tier')
    expect(planeId('DMZ', ['dmz'])).toBe('dmz-2')
    expect(planeId('', [])).toBe('plane')
  })
})
