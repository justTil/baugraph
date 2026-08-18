import type { ShapeKey } from '@/model'

/**
 * Shape geometry, in node-local coordinates (`0,0` = top-left, `w × h` = the box).
 *
 * Returned as element descriptors rather than markup so the same definitions
 * drive both the on-canvas Vue components and the SVG/PNG exporter.
 */

export interface ShapeElement {
  tag: 'path' | 'ellipse'
  attrs: Record<string, string | number>
  /** `body` is filled and stroked; `detail` is stroke-only trim on top of it. */
  role: 'body' | 'detail'
}

/** Rounded-rectangle path, clamped so the radius can never exceed half the box. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return (
    `M${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}` +
    `V${y + h - rr}A${rr},${rr} 0 0 1 ${x + w - rr},${y + h}` +
    `H${x + rr}A${rr},${rr} 0 0 1 ${x},${y + h - rr}` +
    `V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}Z`
  )
}

/** How far a cylinder's cap ever bulges, whatever the box is stretched to. */
export const CYLINDER_CAP_MAX = 15

/** Vertical offset of a cylinder's cap, also used to nudge its label down. */
export const cylinderCap = (h: number) => Math.min(CYLINDER_CAP_MAX, h * 0.22)

/** Width of the three tick marks on the right of a queue shape. */
export const QUEUE_TICKS = [10, 19, 28]

/**
 * The elements one shape is drawn from, in a box of `w × h`.
 *
 * `stroke` is the outline weight the caller is about to draw them with, and the
 * geometry is held half of it inside the box. A stroke straddles the line it
 * follows, so an outline drawn on the box edge itself loses its outer half — on
 * the flat sides, where the box clips it, but not where the shape curves back
 * inside, which is what made an uninset outline read as thicker at the corners.
 * Insetting also keeps a heavy border on the node rather than over its
 * neighbours, so the box a connection lands on is the box the reader sees.
 */
export function shapeElements(shape: ShapeKey, w: number, h: number, stroke = 0): ShapeElement[] {
  const i = stroke / 2
  // The box the outline itself runs through, and its far edges.
  const iw = Math.max(1, w - stroke)
  const ih = Math.max(1, h - stroke)
  const x1 = i + iw
  const y1 = i + ih

  switch (shape) {
    case 'pill':
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(i, i, iw, ih, ih / 2) } }]

    case 'round':
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(i, i, iw, ih, 16) } }]

    case 'cylinder': {
      const ry = cylinderCap(ih)
      const body =
        `M${i},${i + ry}C${i},${i - ry * 0.333} ${x1},${i - ry * 0.333} ${x1},${i + ry}` +
        `L${x1},${y1 - ry}C${x1},${y1 + ry * 0.333} ${i},${y1 + ry * 0.333} ${i},${y1 - ry}Z`
      const rim =
        `M${i},${i + ry}C${i},${i + ry + ry * 1.333} ${x1},${i + ry + ry * 1.333} ${x1},${i + ry}`
      return [
        { tag: 'path', role: 'body', attrs: { d: body } },
        { tag: 'path', role: 'detail', attrs: { d: rim } },
      ]
    }

    case 'queue':
      return [
        { tag: 'path', role: 'body', attrs: { d: roundedRect(i, i, iw, ih, 6) } },
        ...QUEUE_TICKS.map((dx) => ({
          tag: 'path' as const,
          role: 'detail' as const,
          attrs: { d: `M${x1 - dx},${i + 8}V${y1 - 8}` },
        })),
      ]

    case 'hexagon': {
      const c = Math.min(22, iw * 0.16)
      return [
        {
          tag: 'path',
          role: 'body',
          attrs: {
            d:
              `M${i + c},${i}H${x1 - c}L${x1},${i + ih / 2}L${x1 - c},${y1}` +
              `H${i + c}L${i},${i + ih / 2}Z`,
          },
        },
      ]
    }

    case 'diamond':
      return [
        {
          tag: 'path',
          role: 'body',
          attrs: {
            d: `M${i + iw / 2},${i}L${x1},${i + ih / 2}L${i + iw / 2},${y1}L${i},${i + ih / 2}Z`,
          },
        },
      ]

    case 'circle':
      return [
        {
          tag: 'ellipse',
          role: 'body',
          attrs: { cx: w / 2, cy: h / 2, rx: iw / 2, ry: ih / 2 },
        },
      ]

    case 'note': {
      const f = 18
      return [
        { tag: 'path', role: 'body', attrs: { d: `M${i},${i}H${x1 - f}L${x1},${i + f}V${y1}H${i}Z` } },
        { tag: 'path', role: 'detail', attrs: { d: `M${x1 - f},${i}V${i + f}H${x1}` } },
      ]
    }

    default:
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(i, i, iw, ih, 8) } }]
  }
}

/**
 * Shapes that taper or round away at their edges. Their content is centred as a
 * block — icon then text, the same order as everywhere else — because text run
 * up against the left edge of a circle or a diamond falls outside the outline.
 */
export const CENTERED_SHAPES = new Set<ShapeKey>(['circle', 'diamond', 'hexagon', 'pill'])

/** Extra top padding needed so text clears a shape's cap or fold. */
export function contentInset(shape: ShapeKey, h: number) {
  if (shape === 'cylinder') return { top: cylinderCap(h), right: 0 }
  if (shape === 'queue') return { top: 0, right: 34 }
  if (shape === 'note') return { top: 6, right: 18 }
  return { top: 0, right: 0 }
}
