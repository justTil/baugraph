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

export function shapeElements(shape: ShapeKey, w: number, h: number): ShapeElement[] {
  switch (shape) {
    case 'pill':
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(0, 0, w, h, h / 2) } }]

    case 'round':
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(0, 0, w, h, 16) } }]

    case 'cylinder': {
      const ry = cylinderCap(h)
      const body =
        `M0,${ry}C0,${-ry * 0.333} ${w},${-ry * 0.333} ${w},${ry}` +
        `L${w},${h - ry}C${w},${h + ry * 0.333} 0,${h + ry * 0.333} 0,${h - ry}Z`
      const rim = `M0,${ry}C0,${ry + ry * 1.333} ${w},${ry + ry * 1.333} ${w},${ry}`
      return [
        { tag: 'path', role: 'body', attrs: { d: body } },
        { tag: 'path', role: 'detail', attrs: { d: rim } },
      ]
    }

    case 'queue':
      return [
        { tag: 'path', role: 'body', attrs: { d: roundedRect(0, 0, w, h, 6) } },
        ...QUEUE_TICKS.map((dx) => ({
          tag: 'path' as const,
          role: 'detail' as const,
          attrs: { d: `M${w - dx},8V${h - 8}` },
        })),
      ]

    case 'hexagon': {
      const i = Math.min(22, w * 0.16)
      return [
        {
          tag: 'path',
          role: 'body',
          attrs: { d: `M${i},0H${w - i}L${w},${h / 2}L${w - i},${h}H${i}L0,${h / 2}Z` },
        },
      ]
    }

    case 'diamond':
      return [
        {
          tag: 'path',
          role: 'body',
          attrs: { d: `M${w / 2},0L${w},${h / 2}L${w / 2},${h}L0,${h / 2}Z` },
        },
      ]

    case 'circle':
      return [
        {
          tag: 'ellipse',
          role: 'body',
          attrs: { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 },
        },
      ]

    case 'note': {
      const f = 18
      return [
        { tag: 'path', role: 'body', attrs: { d: `M0,0H${w - f}L${w},${f}V${h}H0Z` } },
        { tag: 'path', role: 'detail', attrs: { d: `M${w - f},0V${f}H${w}` } },
      ]
    }

    default:
      return [{ tag: 'path', role: 'body', attrs: { d: roundedRect(0, 0, w, h, 8) } }]
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
