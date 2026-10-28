import { describe, expect, it } from 'vitest'
import type { Box, Vec } from '@/features/diagram/lib/edge-path'
import { edgeGeometry } from '@/features/diagram/lib/edge-path'

/** Two nodes stacked one above the other, with a gap of 60..140 between them. */
const start: Box = { x: 0, y: 0, width: 150, height: 60 }
const step: Box = { x: 0, y: 140, width: 170, height: 70 }

const route = (
  source: Box,
  target: Box,
  sourceSide: 'top' | 'right' | 'bottom' | 'left',
  targetSide: 'top' | 'right' | 'bottom' | 'left',
  obstacles: Box[] = [],
) =>
  edgeGeometry(source, target, { sourceSide, targetSide, route: 'orthogonal', obstacles }).points!

/** The one leg that runs across, from one side of the nodes to the other. */
const crossing = (points: Vec[]): [Vec, Vec] => {
  const i = points.findIndex((p, k) => k > 0 && k < points.length - 2 && p.y === points[k + 1]!.y)
  return [points[i]!, points[i + 1]!]
}

/** Whether any leg of the route goes through the inside of `box`. */
function crosses(points: Vec[], box: Box): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const xLo = Math.min(a.x, b.x)
    const xHi = Math.max(a.x, b.x)
    const yLo = Math.min(a.y, b.y)
    const yHi = Math.max(a.y, b.y)
    if (xHi > box.x && xLo < box.x + box.width && yHi > box.y && yLo < box.y + box.height) {
      return true
    }
  }
  return false
}

describe('edgeGeometry detours', () => {
  it('runs the crossing leg down the middle of the gap, not against the node it left', () => {
    const [a, b] = crossing(route(start, step, 'right', 'left'))
    expect(a.y).toBe(100)
    expect(b.y).toBe(100)
  })

  it('centres the crossing leg the other way round too', () => {
    const [a] = crossing(route(start, step, 'left', 'right'))
    expect(a.y).toBe(100)
  })

  it('gives the target end the same approach as the source end', () => {
    const points = route(start, step, 'right', 'left')
    const first = points[1]!.x - points[0]!.x
    const last = points.at(-1)!.x - points.at(-2)!.x
    expect(first).toBe(22)
    expect(last).toBe(22)
  })

  it('keeps a detour round the outside tight against the stubs', () => {
    // Both ends on the right: the line goes out, down and back in, and the leg
    // down sits just clear of the wider of the two nodes.
    const points = route(start, step, 'right', 'right')
    expect(points).toHaveLength(4)
    expect(points[1]!.x).toBe(step.x + step.width + 2 + 22)
    expect(points[2]!.x).toBe(points[1]!.x)
  })

  it('centres the leg in the lane it takes past an obstacle, and stays out of it', () => {
    const lower: Box = { ...step, y: 200 }
    const obstacle: Box = { x: -40, y: 110, width: 60, height: 40 }
    const points = route(start, lower, 'right', 'left', [obstacle])
    expect(crosses(points, obstacle)).toBe(false)
    // Below the obstacle: halfway between its bottom (150) and the node's top (200).
    expect(crossing(points)[0]!.y).toBe(175)
  })

  it('leaves a connection that needs no detour where it was', () => {
    const a: Box = { x: 0, y: 0, width: 100, height: 60 }
    const b: Box = { x: 200, y: 100, width: 100, height: 60 }
    const points = route(a, b, 'right', 'left')
    // Turns halfway between the two nodes, as it always has.
    expect(points.filter((p) => p.x === 150)).toHaveLength(2)
  })
})
