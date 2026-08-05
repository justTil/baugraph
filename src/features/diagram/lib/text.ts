/**
 * Text measurement.
 *
 * The canvas and the SVG export must break lines identically, so both go through
 * these helpers rather than relying on CSS truncation in one place and guesswork
 * in the other.
 */

export const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"

let context: CanvasRenderingContext2D | null | undefined

function measureContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  return context
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

/** Escapes a string for inclusion in SVG/XML markup. */
export function escapeXml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
