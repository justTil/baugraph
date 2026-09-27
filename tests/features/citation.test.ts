import { describe, expect, it } from 'vitest'
import { citations } from '@/features/cite/lib/citation'

const input = {
  version: '1.30.0',
  buildDate: '2026-09-18',
  accessed: new Date(2026, 8, 27),
}

function text(style: string, overrides: Partial<typeof input & { figureTitle: string }> = {}) {
  return citations({ ...input, ...overrides }).find((c) => c.style === style)!.text
}

describe('citations', () => {
  it('writes APA with the version and the repository', () => {
    expect(text('apa')).toBe(
      'Schwarze, T. (2026). Baugraph (Version 1.30.0) [Computer software]. https://github.com/justTil/baugraph',
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
      'Figure 1: Order flow. Own illustration, created with Baugraph 1.30.0 (Schwarze, 2026).',
    )
    expect(text('caption', { figureTitle: '   ' })).toContain('Figure 1: Title of your figure.')
  })
})
