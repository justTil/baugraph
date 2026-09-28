import type { Vec2 } from '@/model'

/**
 * The chip a connection's label is drawn in, shared by the canvas
 * (`DiagramEdge.vue`) and the exporter (`render-svg.ts`) so the two cannot
 * disagree about where the text and the info icon sit.
 */

/** Label text size, in canvas units. */
export const EDGE_LABEL_FONT = 11
/** Height of the chip. */
export const EDGE_LABEL_HEIGHT = 18
/** Size of the info icon drawn when a label carries additional info. */
export const EDGE_LABEL_INFO_ICON = 11

/** Horizontal padding either side of the text, together. */
const PAD_X = 13
/** Room between the text and the info icon. */
const ICON_GAP = 4

export interface EdgeLabelBox {
  /** Top-left corner and size of the chip. */
  x: number
  y: number
  width: number
  height: number
  /** Where the text is anchored (`text-anchor="middle"`, baseline). */
  textX: number
  textY: number
  /** Top-left corner of the info icon, or `null` when there is no additional info. */
  icon: Vec2 | null
}

/**
 * Lays a connection's label out around the middle of its line.
 *
 * Nothing at all is drawn for a connection with neither a label nor additional
 * info. Info without a label still gets a chip — icon only — so text written on
 * an unlabelled connection is never invisible. Whitespace-only info counts as
 * none: it would be an icon promising something that is not there.
 */
export function edgeLabelBox(
  label: string | undefined,
  info: string | undefined,
  mid: Vec2,
  measure: (text: string, size: number) => number,
): EdgeLabelBox | null {
  const text = label ?? ''
  const hasInfo = !!info?.trim()
  if (!text && !hasInfo) return null

  const textWidth = text ? measure(text, EDGE_LABEL_FONT) : 0
  const width = text
    ? textWidth + PAD_X + (hasInfo ? ICON_GAP + EDGE_LABEL_INFO_ICON : 0)
    : EDGE_LABEL_HEIGHT
  const x = mid.x - width / 2
  const y = mid.y - EDGE_LABEL_HEIGHT / 2

  const iconY = mid.y - EDGE_LABEL_INFO_ICON / 2
  const icon = !hasInfo
    ? null
    : text
      ? { x: x + width - PAD_X / 2 - EDGE_LABEL_INFO_ICON, y: iconY }
      : { x: mid.x - EDGE_LABEL_INFO_ICON / 2, y: iconY }

  return {
    x,
    y,
    width,
    height: EDGE_LABEL_HEIGHT,
    textX: x + PAD_X / 2 + textWidth / 2,
    textY: mid.y + 4,
    icon,
  }
}
