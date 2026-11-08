import { describe, expect, it } from 'vitest'
import type { ShapeKey } from '@/model'
import { SHAPE_KEYS } from '@/model'
import { MIN_THIN_HEIGHT, fitNodeSize, minNodeSize } from '@/features/diagram/lib/auto-size'

describe('minNodeSize', () => {
  it('lets a label-only box be much thinner than it starts', () => {
    const node = { label: 'Order Service' }
    expect(fitNodeSize(node).height).toBe(60)
    expect(minNodeSize(node).height).toBe(30)
  })

  it('never narrows a node — only its height is freed', () => {
    const node = { label: 'Order Service', type: 'service', icon: 'package' }
    expect(minNodeSize(node).width).toBe(fitNodeSize(node).width)
  })

  it('is never taller than the size a node starts at', () => {
    for (const shape of SHAPE_KEYS) {
      const node = { label: 'Orders', type: 'database', sublabel: 'primary', shape, icon: 'database' }
      expect(minNodeSize(node).height, shape).toBeLessThanOrEqual(fitNodeSize(node).height)
    }
  })

  it('still makes room for every line the node draws', () => {
    const label = minNodeSize({ label: 'Order Service' }).height
    const withCaption = minNodeSize({ label: 'Order Service', type: 'service' }).height
    const withAll = minNodeSize({ label: 'Order Service', type: 'service', sublabel: 'Java 21' }).height
    expect(withCaption).toBeGreaterThan(label)
    expect(withAll).toBeGreaterThan(withCaption)
  })

  it('has a floor for a node with no text at all', () => {
    expect(minNodeSize({ label: '' }).height).toBe(MIN_THIN_HEIGHT)
    // The schema's own minimum; anything thinner would not reopen.
    expect(MIN_THIN_HEIGHT).toBeGreaterThanOrEqual(16)
  })

  it('keeps the room a shape’s outline takes', () => {
    const size = (shape: ShapeKey) => minNodeSize({ label: 'Orders', shape }).height
    // A cylinder's caps and a diamond's taper eat height a box does not need.
    expect(size('cylinder')).toBeGreaterThan(size('rect'))
    expect(size('diamond')).toBeGreaterThan(size('rect'))
  })

  it('lands on the grid', () => {
    for (const shape of SHAPE_KEYS) {
      expect(minNodeSize({ label: 'Orders', shape }).height % 10, shape).toBe(0)
    }
  })
})
