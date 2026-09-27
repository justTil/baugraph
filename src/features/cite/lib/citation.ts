/**
 * Ready-made references to Baugraph itself, for a thesis, paper or report that
 * shows a diagram drawn with it.
 *
 * Everything is built from plain arguments rather than the build-time globals,
 * so the formats can be tested without a Vite build — the view passes in
 * `__APP_VERSION__` and `__BUILD_DATE__`.
 */

export const citationAuthor = { given: 'Til', family: 'Schwarze' }
export const citationTitle = 'Baugraph'
export const citationUrl = 'https://github.com/justTil/baugraph'

export interface CitationInput {
  /** The Baugraph version, e.g. `1.30.0`. */
  version: string
  /** When this build was made (ISO `YYYY-MM-DD`); its year dates the software. */
  buildDate: string
  /** When the reader used it, cited as the access date. */
  accessed: Date
  /** The title of the figure being captioned; blank falls back to a placeholder. */
  figureTitle?: string
}

export type CitationStyle = 'apa' | 'harvard' | 'ieee' | 'bibtex' | 'caption'

export interface Citation {
  style: CitationStyle
  label: string
  /** Where the style is usually asked for, shown under the label. */
  hint: string
  text: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** IEEE abbreviates months to at most four letters — "Sept." included. */
const IEEE_MONTHS = [
  'Jan.',
  'Feb.',
  'Mar.',
  'Apr.',
  'May',
  'Jun.',
  'Jul.',
  'Aug.',
  'Sep.',
  'Oct.',
  'Nov.',
  'Dec.',
]

/**
 * Written out by hand rather than with `toLocaleDateString`, so a citation
 * reads the same in every browser language — the style decides the format,
 * not the reader's machine.
 */
function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function yearOf(buildDate: string, fallback: Date) {
  const year = /^\d{4}/.exec(buildDate)?.[0]
  return year ?? String(fallback.getFullYear())
}

export function citations(input: CitationInput): Citation[] {
  const { version, accessed } = input
  const year = yearOf(input.buildDate, accessed)
  const { given, family } = citationAuthor
  const initial = `${given[0]}.`
  const day = accessed.getDate()
  const month = accessed.getMonth()
  const figure = input.figureTitle?.trim() || 'Title of your figure'

  return [
    {
      style: 'apa',
      label: 'APA 7',
      hint: 'Social sciences, psychology, most business schools',
      text: `${family}, ${initial} (${year}). ${citationTitle} (Version ${version}) [Computer software]. ${citationUrl}`,
    },
    {
      style: 'harvard',
      label: 'Harvard',
      hint: 'Common at UK, Australian and many German universities',
      text:
        `${family}, ${initial} (${year}) ${citationTitle} (Version ${version}) [Computer program]. ` +
        `Available at: ${citationUrl} (Accessed: ${day} ${MONTHS[month]} ${accessed.getFullYear()}).`,
    },
    {
      style: 'ieee',
      label: 'IEEE',
      hint: 'Engineering and computer science',
      text:
        `${initial} ${family}, "${citationTitle}," version ${version}, ${year}. [Online]. ` +
        `Available: ${citationUrl} (accessed ${IEEE_MONTHS[month]} ${day}, ${accessed.getFullYear()}).`,
    },
    {
      style: 'bibtex',
      label: 'BibTeX / BibLaTeX',
      hint: 'LaTeX — @software needs BibLaTeX; with plain BibTeX change it to @misc',
      text: [
        `@software{${family.toLowerCase()}_${citationTitle.toLowerCase()}_${year},`,
        `  author  = {${family}, ${given}},`,
        `  title   = {${citationTitle}},`,
        `  version = {${version}},`,
        `  year    = {${year}},`,
        `  url     = {${citationUrl}},`,
        `  urldate = {${isoDate(accessed)}},`,
        `  note    = {Architecture diagram editor},`,
        `}`,
      ].join('\n'),
    },
    {
      style: 'caption',
      label: 'Figure caption',
      hint: 'Under the image itself, pointing to the full reference',
      text: `Figure 1: ${figure}. Own illustration, created with ${citationTitle} ${version} (${family}, ${year}).`,
    },
  ]
}
