/**
 * Text measurement.
 *
 * The canvas and the SVG export must break lines identically, so both go through
 * these helpers rather than relying on CSS truncation in one place and guesswork
 * in the other.
 */

export const SANS =
  "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"

let context: CanvasRenderingContext2D | null | undefined

function measureContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  return context
}

/**
 * Resolves once the sans stack's own face has loaded.
 *
 * Text measured before the webfont arrives is measured in the fallback, and a
 * node sized from those numbers gets its caption clipped the moment the real
 * font swaps in — so anything that sizes itself from text waits for this first.
 */
export async function fontsReady(): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (!fonts) return
  try {
    await Promise.all([fonts.load('400 13px Geist'), fonts.load('600 13px Geist')])
    await fonts.ready
  } catch {
    // A webfont that never arrives just means the fallback metrics stand.
  }
}

export function measureText(text: string, fontSize: number, weight = 400): number {
  const ctx = measureContext()
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `${weight} ${fontSize}px ${SANS}`
  return ctx.measureText(text).width
}

/** Truncates with an ellipsis so the result fits `maxWidth`. */
export function fitText(text: string, maxWidth: number, fontSize: number, weight = 400): string {
  const value = String(text ?? '')
  if (!value || measureText(value, fontSize, weight) <= maxWidth) return value

  let lo = 0
  let hi = value.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measureText(`${value.slice(0, mid)}…`, fontSize, weight) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo ? `${value.slice(0, lo)}…` : ''
}

/**
 * Greedy word-wrap: breaks `text` into lines no wider than `maxWidth`, matching
 * the browser's own wrapping closely enough for the two to agree on a line
 * count. A single word wider than `maxWidth` still gets a line of its own
 * rather than being split mid-word.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, weight = 400): string[] {
  if (!text) return ['']
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || measureText(candidate, fontSize, weight) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  lines.push(current)
  return lines
}

/** Escapes a string for inclusion in SVG/XML markup. */
export function escapeXml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
