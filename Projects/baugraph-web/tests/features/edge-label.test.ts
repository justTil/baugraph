import { describe, expect, it } from 'vitest'
import {
  EDGE_LABEL_HEIGHT,
  EDGE_LABEL_INFO_ICON,
  edgeLabelBox,
} from '@/features/diagram/lib/edge-label'

/** A fixed-width font: every character is 6 units wide. */
const measure = (text: string) => text.length * 6
const mid = { x: 100, y: 50 }

describe('edgeLabelBox', () => {
  it('draws nothing without a label or info', () => {
    expect(edgeLabelBox('', '', mid, measure)).toBeNull()
    expect(edgeLabelBox(undefined, undefined, mid, measure)).toBeNull()
  })

  it('treats whitespace-only info as none', () => {
    expect(edgeLabelBox('', '  \n ', mid, measure)).toBeNull()
    expect(edgeLabelBox('HTTP', '  \n ', mid, measure)!.icon).toBeNull()
  })

  it('lays a plain label out exactly as before', () => {
    const box = edgeLabelBox('HTTP', '', mid, measure)!
    // The chip that shipped before additional info existed.
    expect(box).toMatchObject({ x: 100 - 37 / 2, y: 41, width: 37, height: 18, icon: null })
    expect(box.textX).toBe(mid.x)
    expect(box.textY).toBe(mid.y + 4)
  })

  it('widens the chip for the info icon and keeps it centred on the line', () => {
    const plain = edgeLabelBox('HTTP', '', mid, measure)!
    const box = edgeLabelBox('HTTP', 'details', mid, measure)!
    expect(box.width).toBeGreaterThan(plain.width + EDGE_LABEL_INFO_ICON)
    expect(box.x + box.width / 2).toBeCloseTo(mid.x)
  })

  it('puts the icon inside the chip, right of the text', () => {
    const box = edgeLabelBox('HTTP', 'details', mid, measure)!
    const icon = box.icon!
    expect(icon).not.toBeNull()
    expect(icon.x).toBeGreaterThanOrEqual(box.textX + measure('HTTP') / 2)
    expect(icon.x + EDGE_LABEL_INFO_ICON).toBeLessThanOrEqual(box.x + box.width)
    expect(icon.y).toBeGreaterThanOrEqual(box.y)
    expect(icon.y + EDGE_LABEL_INFO_ICON).toBeLessThanOrEqual(box.y + box.height)
  })

  it('draws an icon-only chip for info without a label', () => {
    const box = edgeLabelBox('', 'details', mid, measure)!
    expect(box.width).toBe(EDGE_LABEL_HEIGHT)
    expect(box.icon!.x + EDGE_LABEL_INFO_ICON / 2).toBeCloseTo(mid.x)
    expect(box.icon!.y + EDGE_LABEL_INFO_ICON / 2).toBeCloseTo(mid.y)
  })
})
