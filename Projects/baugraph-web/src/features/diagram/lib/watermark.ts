import type { DiagramTheme } from '@/features/diagram/lib/theme'
import { SANS, escapeXml, measureText } from '@/features/diagram/lib/text'

/**
 * A line of text repeated diagonally across the whole export, the way a PDF is
 * marked "DRAFT" or stamped with who it was issued to.
 *
 * Drawn as a single SVG `<pattern>` rotated with `patternTransform`, rather than
 * as a grid of individually placed `<text>` elements: a pattern tiles infinitely
 * in its own coordinate space before that space is rotated, so one rect filled
 * with it covers the picture edge to edge with no gaps at the corners, whatever
 * size the export turns out to be.
 */

export interface WatermarkOptions {
  text?: string
}

/** Whether these options ask for a watermark to be drawn. */
export function watermarked(options: WatermarkOptions | undefined): options is WatermarkOptions {
  return !!options?.text?.trim()
}

const ANGLE = -45

/** A short, shareable id for when a watermark is wanted but no particular text is. */
export function randomWatermarkId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function watermarkMarkup(
  box: { x: number; y: number; width: number; height: number },
  options: WatermarkOptions,
  theme: DiagramTheme,
  /** Distinguishes this render's pattern id from any other on the page. */
  key: string,
): string {
  const text = options.text!.trim()

  // Scaled off the export itself rather than fixed: a size picked for a small
  // diagram would be lost on a large one, and a size picked for a large one
  // would swallow a small one whole.
  const fontSize = Math.min(36, Math.max(14, Math.min(box.width, box.height) / 16))
  const textWidth = measureText(text, fontSize, 600)

  // Snug enough that the line repeats right after itself — a watermark tiles
  // densely, it doesn't leave a diagram's worth of gap between stamps.
  const tileWidth = textWidth + Math.max(20, textWidth * 0.3)
  const tileHeight = fontSize * 2.2
  const patternId = `watermark-${key}`
  const ink = theme.dark ? '#ffffff' : '#000000'

  return (
    `<defs><pattern id="${patternId}" width="${tileWidth}" height="${tileHeight}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(${ANGLE})">` +
    `<text x="${tileWidth / 2}" y="${tileHeight / 2}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-size="${fontSize}" font-weight="600" font-family="${SANS}" ` +
    `fill="${ink}" fill-opacity="0.12">${escapeXml(text)}</text>` +
    `</pattern></defs>` +
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" ` +
    `fill="url(#${patternId})" pointer-events="none"/>`
  )
}
