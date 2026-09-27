import { describe, expect, it } from 'vitest'
import { parse, safeParse, stringify } from '@/model'

/**
 * `meta.authors` is optional and was added after the format shipped, so the
 * cases that matter are the ones where a file says nothing about authorship:
 * it has to come back out exactly as it went in.
 */
const file = (meta: Record<string, unknown>) =>
  JSON.stringify({
    baugraph: '1.0',
    meta: { title: 'Order processing', ...meta },
    nodes: [{ id: 'a', label: 'A', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } }],
    edges: [],
  })

describe('meta.authors', () => {
  it('is absent from a document that does not credit anyone', () => {
    const doc = parse(file({}))
    expect(doc.meta.authors).toBeUndefined()
    expect(stringify(doc)).not.toContain('authors')
  })

  it('writes no key for an empty list', () => {
    expect(stringify(parse(file({ authors: [] })))).not.toContain('authors')
  })

  it('keeps a name-only author', () => {
    const doc = parse(file({ authors: [{ name: 'Ada Lovelace' }] }))
    expect(doc.meta.authors).toEqual([{ name: 'Ada Lovelace' }])
  })

  it('round-trips every field, in the order given', () => {
    const authors = [
      { name: 'Ada Lovelace', email: 'ada@example.com', website: 'https://example.com' },
      { name: 'Grace Hopper' },
    ]
    const doc = parse(stringify(parse(file({ authors }))))
    expect(doc.meta.authors).toEqual(authors)
  })

  it('writes each author on one line', () => {
    const text = stringify(parse(file({ authors: [{ name: 'Ada', email: 'ada@example.com' }] })))
    expect(text).toContain('{ "name": "Ada", "email": "ada@example.com" }')
  })

  it('drops a blank contact field rather than writing it', () => {
    const doc = parse(file({ authors: [{ name: 'Ada', email: '', website: '  ' }] }))
    expect(doc.meta.authors).toEqual([{ name: 'Ada' }])
    expect(stringify(doc)).not.toContain('email')
  })

  it('rejects an author without a name', () => {
    const result = safeParse(file({ authors: [{ email: 'ada@example.com' }] }))
    expect(result.ok).toBe(false)
  })

  it('is written the same way twice', () => {
    const once = stringify(parse(file({ authors: [{ name: 'Ada', website: 'https://example.com' }] })))
    expect(stringify(parse(once))).toBe(once)
  })
})
