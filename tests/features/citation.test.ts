import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { citationBuildDate, citationVersion, citations } from '@/features/cite/lib/citation'

/** What is being released — the citations must never name anything else. */
const version = readFileSync(new URL('../../version.txt', import.meta.url), 'utf-8').trim()

const input = {
  buildDate: '2026-09-18',
  accessed: new Date(2026, 8, 27),
}

function text(
  style: string,
  overrides: Partial<{ buildDate: string | undefined; accessed: Date; figureTitle: string }> = {},
) {
  return citations({ ...input, ...overrides }).find((c) => c.style === style)!.text
}

describe('citations', () => {
  it('cites the version this build is made from', () => {
    expect(citationVersion).toBe(version)
    for (const citation of citations(input)) expect(citation.text).toContain(version)
  })

  it('dates the software by the running build unless told otherwise', () => {
    const year = citationBuildDate.slice(0, 4)
    expect(citationBuildDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(text('apa', { buildDate: undefined })).toContain(`(${year})`)
  })

  it('writes APA with the version and the repository', () => {
    expect(text('apa')).toBe(
      `Schwarze, T. (2026). Baugraph (Version ${version}) [Computer software]. https://github.com/justTil/baugraph`,
    )
  })

  it('writes the access date in the form each style asks for', () => {
    expect(text('harvard')).toContain('(Accessed: 27 September 2026).')
    expect(text('ieee')).toContain('(accessed Sep. 27, 2026).')
    expect(text('bibtex')).toContain('urldate = {2026-09-27},')
  })

  it('dates the software by its build, not by when it was used', () => {
    const later = { buildDate: '2026-12-30', accessed: new Date(2027, 0, 5) }
    expect(text('apa', later)).toContain('(2026)')
    expect(text('bibtex', later)).toContain('year    = {2026},')
    expect(text('bibtex', later)).toContain('urldate = {2027-01-05},')
  })

  it('falls back to the access year when the build date is missing', () => {
    expect(text('apa', { buildDate: '' })).toContain('(2026)')
  })

  it('writes a BibTeX entry with a stable key', () => {
    const bib = text('bibtex')
    expect(bib.startsWith('@software{schwarze_baugraph_2026,\n')).toBe(true)
    expect(bib).toContain('  author  = {Schwarze, Til},')
    expect(bib.endsWith('\n}')).toBe(true)
  })

  it('puts the figure title into the caption, or a placeholder when blank', () => {
    expect(text('caption', { figureTitle: '  Order flow ' })).toBe(
      `Figure 1: Order flow. Own illustration, created with Baugraph ${version} (Schwarze, 2026).`,
    )
    expect(text('caption', { figureTitle: '   ' })).toContain('Figure 1: Title of your figure.')
  })
})
