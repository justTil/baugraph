import type { ShapeKey } from '@/model'
import type { CaptionSource } from '@/features/diagram/lib/node-caption'
import { nodeCaption } from '@/features/diagram/lib/node-caption'
import { CYLINDER_CAP_MAX, STACKED_SHAPES, contentInset } from '@/features/diagram/lib/shapes'
import { measureText } from '@/features/diagram/lib/text'

/**
 * How big a node has to be for what it draws.
 *
 * A box that cuts its own label in half says nothing useful, so sizes are worked
 * out from the text rather than guessed: a new node arrives at the size its name,
 * caption and icon need, and any later edit grows it rather than truncating.
 *
 * The numbers mirror what `ShapeNode.vue` and `render-svg.ts` actually draw —
 * same font sizes, same paddings, same shape insets — so a fitted node is snug on
 * the canvas and in an export, and neither has to guess about the other.
 */

/* Text metrics, matching the three lines a node can carry. */
const LABEL_SIZE = 13
const LABEL_WEIGHT = 600
const CAPTION_SIZE = 10
const CAPTION_TECH_WEIGHT = 600
const SUBLABEL_SIZE = 11
/** Leading added to every line, matching the exporter's `size + 4`. */
const LEADING = 4

const ICON_SIZE = 20
/** Icon-to-text gap: `gap-2.5` beside the text, `gap-1.5` stacked above it. */
const ICON_GAP_X = 10
const ICON_GAP_Y = 6

/** The `px-3` on the content row, and the breathing room above and below it. */
const PAD_X = 12
const PAD_Y = 11

/** Fitted sizes land on the grid, so auto-sized nodes still line up. */
const STEP = 10

/**
 * A hair of slack per line. Measuring a string and laying it out are two
 * different code paths — sub-pixel rounding, letter-spacing, the `truncate`
 * ellipsis deciding early — and a caption one pixel over is a caption cut off.
 */
const SLACK = 2

/**
 * Floors per shape. A node never fits so tightly that it stops looking like the
 * thing it is — a two-letter label still gets a cylinder worth calling one.
 */
const MIN_SIZE: Partial<Record<ShapeKey, { width: number; height: number }>> = {
  cylinder: { width: 150, height: 90 },
  circle: { width: 100, height: 100 },
  diamond: { width: 150, height: 100 },
  hexagon: { width: 150, height: 64 },
  pill: { width: 130, height: 56 },
  queue: { width: 160, height: 62 },
  note: { width: 160, height: 70 },
}

const MIN_DEFAULT = { width: 140, height: 60 }

export interface FitSource extends CaptionSource {
  sublabel?: string
  shape?: ShapeKey
  icon?: string
}

export interface FitSize {
  width: number
  height: number
}

/** The block of text a node draws, before any padding or shape allowance. */
function textBlock(node: FitSource): FitSize {
  const widths: number[] = [0]
  let height = 0

  const line = (width: number, size: number) => {
    widths.push(width + SLACK)
    height += size + LEADING
  }

  if (node.label) line(measureText(node.label, LABEL_SIZE, LABEL_WEIGHT), LABEL_SIZE)

  const caption = nodeCaption(node)
  if (caption) {
    let width = 0
    if (caption.type) width += measureText(caption.type, CAPTION_SIZE)
    if (caption.type && caption.tech) width += measureText(' · ', CAPTION_SIZE)
    if (caption.tech) width += measureText(caption.tech, CAPTION_SIZE, CAPTION_TECH_WEIGHT)
    line(width, CAPTION_SIZE)
  }

  if (node.sublabel) line(measureText(node.sublabel, SUBLABEL_SIZE), SUBLABEL_SIZE)

  return { width: Math.max(...widths), height }
}

const roundUp = (value: number) => Math.ceil(value / STEP) * STEP

/** Grows a size to the grid and to its shape's floor. */
function clamp(size: FitSize, shape: ShapeKey): FitSize {
  const min = MIN_SIZE[shape] ?? MIN_DEFAULT
  return {
    width: Math.max(min.width, roundUp(size.width)),
    height: Math.max(min.height, roundUp(size.height)),
  }
}

/**
 * The smallest box that holds a node's icon and text without clipping either.
 *
 * Shapes that taper — a diamond, a circle — get the extra room their outline
 * eats; a cylinder gets both of its caps, which is why a database is taller than
 * a plain box carrying the same two lines.
 */
export function fitNodeSize(node: FitSource): FitSize {
  const shape = node.shape ?? 'rect'
  const hasIcon = !!node.icon
  const stacked = STACKED_SHAPES.has(shape) || !hasIcon
  const text = textBlock(node)

  // The icon sits above the text on shapes with little usable width at the
  // edges, and beside it everywhere else — exactly as `ShapeNode` lays it out.
  const content = stacked
    ? {
        width: Math.max(text.width, hasIcon ? ICON_SIZE : 0),
        height: text.height + (hasIcon ? ICON_SIZE + ICON_GAP_Y : 0),
      }
    : {
        width: ICON_SIZE + ICON_GAP_X + text.width,
        height: Math.max(text.height, ICON_SIZE),
      }

  // Trim drawn inside the box — a queue's ticks, a note's fold — is width the
  // text cannot use.
  const inset = contentInset(shape, 0)
  let width = content.width + PAD_X * 2 + inset.right
  let height = content.height + PAD_Y * 2

  switch (shape) {
    case 'cylinder': {
      // The top rim is drawn a full cap below the top edge and the bottom cap
      // bulges out again, so three caps' worth of the box is unusable.
      height += CYLINDER_CAP_MAX * 3
      break
    }
    case 'note':
      // Clearance under the folded corner.
      height += inset.top
      break
    case 'pill':
      // The ends are half-circles; text has to stay clear of the curve.
      width += height * 0.35
      break
    case 'hexagon':
      // Both points taper in by up to 22px.
      width += 36
      break
    case 'diamond':
      // Usable width shrinks towards the top and bottom points, so the box has
      // to be wider and taller than the text it carries.
      width = content.width / 0.55 + PAD_X * 2
      height = content.height * 1.8 + PAD_Y * 2
      break
    case 'circle': {
      // Square, sized by whichever axis the content strains harder.
      const side = Math.max(content.width / 0.72 + PAD_X, content.height / 0.62 + PAD_Y)
      width = side
      height = side
      break
    }
  }

  return clamp({ width, height }, shape)
}

/* -------------------------------------------------------------------- zones */

/** Room left around a zone's contents, and above them for its header. */
export const ZONE_PADDING = 34
export const ZONE_HEADROOM = 16

/** The smallest a zone is allowed to get: its header, and room to drop into. */
export function fitZoneMinSize(zone: FitSource): FitSize {
  return { width: Math.max(120, fitZoneHeaderWidth(zone)), height: 90 }
}

/** How wide a zone has to be for its own header, whatever it contains. */
export function fitZoneHeaderWidth(zone: FitSource): number {
  const caption = nodeCaption(zone)
  const widths = [
    measureText((zone.label ?? '').toUpperCase(), 12, 700),
    caption ? measureText([caption.type, caption.tech].filter(Boolean).join(' · '), CAPTION_SIZE) : 0,
    zone.sublabel ? measureText(zone.sublabel, SUBLABEL_SIZE) : 0,
  ]
  // The header sits `left-13 right-13` inside the frame.
  return roundUp(Math.max(...widths) + 26)
}
