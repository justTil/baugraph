import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import type { DiagramDocument } from '@/model'
import { blankDocument, parse, safeParse, stringify } from '@/model'
import { toFileObject } from '@/model/serialize'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = resolve(here, '../fixtures')
const schemaFile = resolve(here, '../../public/schema/baugraph-v1.schema.json')

/** Every valid fixture from every release — the files that already exist in the wild. */
const existingFiles = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(fixturesRoot, e.name, 'valid'))
  .flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(dir, name)),
  )

function twoNodes(): DiagramDocument {
  return {
    ...blankDocument('Label info'),
    nodes: [
      {
        id: 'a',
        kind: 'shape',
        label: 'A',
        shape: 'rect',
        color: 'slate',
        position: { x: 0, y: 0 },
        size: { width: 140, height: 60 },
      },
      {
        id: 'b',
        kind: 'shape',
        label: 'B',
        shape: 'rect',
        color: 'slate',
        position: { x: 300, y: 0 },
        size: { width: 140, height: 60 },
      },
    ],
  }
}

function withEdge(edge: Record<string, unknown>): Record<string, unknown> {
  return {
    ...toFileObject(twoNodes()),
    edges: [{ id: 'a--b', source: 'a', target: 'b', ...edge }],
  }
}

describe('edge labelInfo', () => {
  describe('backward compatibility', () => {
    it('has fixtures to check against', () => {
      expect(existingFiles.length).toBeGreaterThan(0)
    })

    for (const file of existingFiles) {
      const name = file.slice(fixturesRoot.length + 1)

      it(`${name} — reads every edge as having no additional info`, () => {
        const doc = parse(readFileSync(file, 'utf-8'))
        for (const edge of doc.edges) expect(edge.labelInfo).toBe('')
      })

      it(`${name} — writes no labelInfo key`, () => {
        const text = stringify(parse(readFileSync(file, 'utf-8')))
        expect(text).not.toContain('labelInfo')
      })
    }

    it('accepts an edge without labelInfo', () => {
      const result = safeParse(withEdge({ label: 'HTTP' }))
      expect(result.ok).toBe(true)
    })
  })

  it('round-trips additional info, newlines included', () => {
    const info = 'POST /orders\nidempotent · retried 3×\n\n"quoted" <tags> & more'
    const doc = parse(withEdge({ label: 'HTTP', labelInfo: info }))
    expect(doc.edges[0]!.labelInfo).toBe(info)

    const again = parse(stringify(doc))
    expect(again.edges[0]!.labelInfo).toBe(info)
  })

  it('is written right after the label', () => {
    const doc = parse(withEdge({ label: 'HTTP', labelInfo: 'details', route: 'curved' }))
    const [edge] = toFileObject(doc).edges as Record<string, unknown>[]
    const keys = Object.keys(edge!)
    expect(keys.indexOf('labelInfo')).toBe(keys.indexOf('label') + 1)
  })

  it('is kept without a label', () => {
    const doc = parse(withEdge({ labelInfo: 'only info' }))
    const [edge] = toFileObject(doc).edges as Record<string, unknown>[]
    expect(edge).not.toHaveProperty('label')
    expect(edge!.labelInfo).toBe('only info')
  })

  it('is omitted when empty', () => {
    const doc = parse(withEdge({ label: 'HTTP', labelInfo: '' }))
    const [edge] = toFileObject(doc).edges as Record<string, unknown>[]
    expect(edge).not.toHaveProperty('labelInfo')
  })

  it('rejects a labelInfo that is not a string', () => {
    const result = safeParse(withEdge({ labelInfo: 42 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]!.path).toBe('edges.0.labelInfo')
  })

  it('is part of the published JSON Schema', () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true })
    const validate = ajv.compile(JSON.parse(readFileSync(schemaFile, 'utf-8')))
    expect(validate(withEdge({ label: 'HTTP', labelInfo: 'details' }))).toBe(true)
    expect(validate(withEdge({ label: 'HTTP' }))).toBe(true)
    expect(validate(withEdge({ label: 'HTTP', labelInfo: 42 }))).toBe(false)
  })
})
