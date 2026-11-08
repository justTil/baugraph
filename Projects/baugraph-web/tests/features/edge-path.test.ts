import { describe, expect, it } from 'vitest'
import type { Box, Vec } from '@/features/diagram/lib/edge-path'
import {
  edgeGeometry,
  labelAnchor,
  labelFoot,
  moveSegment,
  pointAlong,
  projectOnto,
  tidyWaypoints,
} from '@/features/diagram/lib/edge-path'

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

describe('connection points slid along their side', () => {
  const a: Box = { x: 0, y: 0, width: 100, height: 100 }
  const b: Box = { x: 300, y: 0, width: 100, height: 100 }

  it('anchors on the evenly spread slot when nothing was moved', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      sourcePorts: { right: 3 },
      sourcePort: 1,
      route: 'straight',
    })
    // Point 1 of 3: a quarter of the way down, 2px clear of the side.
    expect(g.start).toEqual({ x: 102, y: 25 })
  })

  it('anchors where a moved point was slid to', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      sourcePorts: { right: 3 },
      sourcePortPositions: { right: { '1': 0.9 } },
      sourcePort: 1,
      route: 'straight',
    })
    expect(g.start).toEqual({ x: 102, y: 90 })
  })

  it('leaves the points that were not moved in their own slots', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      sourcePorts: { right: 3 },
      sourcePortPositions: { right: { '1': 0.9 } },
      sourcePort: 2,
      route: 'straight',
    })
    expect(g.start).toEqual({ x: 102, y: 50 })
  })

  it('does not pull a moved single point back into line with the other end', () => {
    // 20px off the target's middle is inside the tolerance that straightens an
    // unmoved pair — but this one was put there on purpose.
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      sourcePortPositions: { right: { '1': 0.7 } },
      route: 'orthogonal',
    })
    expect(g.start.y).toBe(70)
    expect(g.end.y).toBe(50)
  })

  it('still straightens an unmoved pair that is nearly in line', () => {
    const lower: Box = { x: 300, y: 20, width: 100, height: 100 }
    const g = edgeGeometry(a, lower, { sourceSide: 'right', targetSide: 'left', route: 'orthogonal' })
    expect(g.start.y).toBe(g.end.y)
  })

  it('lets an auto end pick the point that now sits nearest', () => {
    const below: Box = { x: 300, y: 400, width: 100, height: 100 }
    // Three points on the right; point 1 has been slid to the very bottom, so
    // it — not point 3 — is now the one facing a node far below.
    const g = edgeGeometry(a, below, {
      sourceSide: 'auto',
      targetSide: 'auto',
      sourcePorts: { bottom: 3 },
      sourcePortPositions: { bottom: { '1': 0.95 } },
      route: 'straight',
    })
    expect(g.start.x).toBe(95)
  })
})

describe('measuring along a connection', () => {
  const a: Box = { x: 0, y: 0, width: 100, height: 100 }
  const b: Box = { x: 300, y: 0, width: 100, height: 100 }
  const straight = edgeGeometry(a, b, { sourceSide: 'right', targetSide: 'left', route: 'straight' })

  it('walks a straight line by length', () => {
    // 102 → 298 along y = 50.
    expect(pointAlong(straight, 0)).toEqual({ x: 102, y: 50 })
    expect(pointAlong(straight, 0.25)).toEqual({ x: 151, y: 50 })
    expect(pointAlong(straight, 1)).toEqual({ x: 298, y: 50 })
  })

  it('clamps anything past either end', () => {
    expect(pointAlong(straight, -1)).toEqual(pointAlong(straight, 0))
    expect(pointAlong(straight, 2)).toEqual(pointAlong(straight, 1))
  })

  it('walks a polyline round its corners', () => {
    const lower: Box = { x: 300, y: 200, width: 100, height: 100 }
    const g = edgeGeometry(a, lower, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: [{ x: 200, y: 50 }, { x: 200, y: 250 }],
    })
    // 98 across, 200 down, 98 across: the middle is on the down leg.
    const p = pointAlong(g, 0.5)
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeGreaterThan(50)
    expect(p.y).toBeLessThan(250)
  })

  it('finds where a point projects onto the line, as the inverse of pointAlong', () => {
    const { t, point } = projectOnto(straight, { x: 151, y: 10 })
    expect(t).toBeCloseTo(0.25)
    expect(point).toEqual({ x: 151, y: 50 })
    for (const at of [0, 0.1, 0.5, 0.83, 1]) {
      expect(projectOnto(straight, pointAlong(straight, at)).t).toBeCloseTo(at)
    }
  })

  it('follows a curve rather than its chord', () => {
    const below: Box = { x: 300, y: 300, width: 100, height: 100 }
    const g = edgeGeometry(a, below, { sourceSide: 'right', targetSide: 'top', route: 'curved' })
    expect(g.curve).toBeDefined()
    for (const at of [0.2, 0.5, 0.8]) {
      expect(projectOnto(g, pointAlong(g, at)).t).toBeCloseTo(at, 2)
    }
  })

  it('puts a label that was never moved exactly where labels always sat', () => {
    for (const route of ['straight', 'orthogonal', 'curved'] as const) {
      const g = edgeGeometry(a, { x: 300, y: 200, width: 100, height: 100 }, {
        sourceSide: 'auto',
        targetSide: 'auto',
        route,
      })
      expect(labelAnchor(g)).toEqual(g.mid)
    }
  })

  it('puts a moved label along the line, then off it', () => {
    expect(labelAnchor(straight, 0.25)).toEqual({ x: 151, y: 50 })
    expect(labelAnchor(straight, 0.25, { x: 0, y: -20 })).toEqual({ x: 151, y: 30 })
    expect(labelAnchor(straight, undefined, { x: 10, y: 0 })).toEqual({
      x: straight.mid.x + 10,
      y: straight.mid.y,
    })
  })

  it('ties a label pulled off the line back to its point on it, and only then', () => {
    expect(labelFoot(straight, 0.25, { x: 0, y: -20 })).toEqual({ x: 151, y: 50 })
    expect(labelFoot(straight, undefined, { x: 10, y: 0 })).toEqual(straight.mid)
    expect(labelFoot(straight, 0.25)).toBeNull()
    expect(labelFoot(straight, 0.25, { x: 0, y: 0 })).toBeNull()
    expect(labelFoot(straight)).toBeNull()
  })
})

describe('manual orthogonal routing', () => {
  const a: Box = { x: 0, y: 0, width: 100, height: 100 }
  const b: Box = { x: 300, y: 200, width: 100, height: 100 }
  const square = (points: Vec[]) =>
    points.every(
      (p, i) =>
        i === 0 || Math.abs(p.x - points[i - 1]!.x) < 0.5 || Math.abs(p.y - points[i - 1]!.y) < 0.5,
    )

  it('never draws a diagonal, however the bend points sit', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: [{ x: 180, y: 140 }],
    })
    expect(square(g.points!)).toBe(true)
    // Leaves along the source's normal, arrives along the target's.
    expect(g.points![1]!.y).toBe(g.start.y)
    expect(g.points!.at(-2)!.y).toBe(g.end.y)
  })

  it('turns at a corner rather than doubling back on itself', () => {
    // Up to the first point, then down to the second: carrying straight on
    // up first would have to come straight back down over the same line.
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: [{ x: 180, y: 20 }, { x: 240, y: 260 }],
    })
    expect(square(g.points!)).toBe(true)
    const ys = g.points!.slice(1, 4).map((p) => p.y)
    expect(ys).toEqual([20, 20, 260])
  })

  it('reads sub-pixel drift as lined up, without a corner too small to see', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: [{ x: 200, y: 50 }, { x: 200.6, y: 250.4 }],
    })
    expect(g.points).toHaveLength(4)
  })

  it('leaves straight and manual straight and curved lines exactly as placed', () => {
    for (const route of ['straight', 'curved'] as const) {
      const g = edgeGeometry(a, b, {
        sourceSide: 'right',
        targetSide: 'left',
        route,
        waypoints: [{ x: 180, y: 140 }],
      })
      expect(g.points).toHaveLength(3)
    }
  })

  it('slides a free end along its side to meet the first bend head-on', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: [{ x: 200, y: 30 }, { x: 200, y: 260 }],
    })
    expect(g.start.y).toBe(30)
    expect(g.end.y).toBe(260)
    expect(g.startSlide).toEqual({ axis: 'y', lo: 8, hi: 92 })
  })

  it('holds an end that sits on one of several points', () => {
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      sourcePorts: { right: 3 },
      sourcePort: 2,
      route: 'orthogonal',
      waypoints: [{ x: 200, y: 30 }, { x: 200, y: 250 }],
    })
    expect(g.startSlide).toBeUndefined()
    expect(g.start.y).toBe(50)
    expect(square(g.points!)).toBe(true)
  })

  it('slides only along the straight part of an outline', () => {
    const route = (sourceShape: 'circle' | 'pill' | 'round' | 'cylinder') =>
      edgeGeometry(a, b, {
        sourceSide: 'right',
        targetSide: 'left',
        sourceShape,
        route: 'orthogonal',
        waypoints: [{ x: 200, y: 30 }, { x: 200, y: 250 }],
      })
    // A circle and a pill's round end curve away from the box: the end stays
    // where the outline meets it, and the line jogs out to the bend instead.
    for (const shape of ['circle', 'pill'] as const) {
      const g = route(shape)
      expect(g.startSlide).toBeUndefined()
      expect(g.start.y).toBe(50)
    }
    // A rounded box is straight between its corners; a cylinder down its sides.
    expect(route('round').startSlide).toEqual({ axis: 'y', lo: 16, hi: 84 })
    expect(route('round').start.y).toBe(30)
    expect(route('cylinder').startSlide).toBeDefined()
  })

  it('offers no slide on a line that is not orthogonal', () => {
    const g = edgeGeometry(a, b, { sourceSide: 'right', targetSide: 'left', route: 'straight' })
    expect(g.startSlide).toBeUndefined()
  })
})

describe('moving a segment', () => {
  // s → across → down → across → t, the shape the router draws between two
  // nodes that are offset from each other.
  const points: Vec[] = [
    { x: 102, y: 50 },
    { x: 200, y: 50 },
    { x: 200, y: 250 },
    { x: 298, y: 250 },
  ]
  const start = { axis: 'y' as const, lo: 8, hi: 92 }
  const end = { axis: 'y' as const, lo: 208, hi: 292 }

  it('moves a middle leg sideways, taking both corners with it', () => {
    expect(moveSegment(points, 1, 240, { start, end })).toEqual([
      { x: 240, y: 50 },
      { x: 240, y: 250 },
    ])
  })

  it('lets a free end slide to follow a leg that leaves from it', () => {
    // Still on the side: only the corner moves; the end slides at render time.
    expect(moveSegment(points, 0, 70, { start, end })).toEqual([
      { x: 200, y: 70 },
      { x: 200, y: 250 },
    ])
  })

  it('puts a jog in by the node once the side runs out', () => {
    const next = moveSegment(points, 0, -40, { start, end })
    // Out from the end along the leg, over to the moved line, then on as before.
    expect(next).toEqual([
      { x: 124, y: 8 },
      { x: 124, y: -40 },
      { x: 200, y: -40 },
      { x: 200, y: 250 },
    ])
  })

  it('jogs straight away at an end that cannot slide', () => {
    const next = moveSegment(points, 2, 230, {})
    expect(next).toEqual([
      { x: 200, y: 50 },
      { x: 200, y: 230 },
      { x: 276, y: 230 },
      { x: 276, y: 250 },
    ])
  })

  it('keeps a single straight leg manual when both ends just slide', () => {
    const line: Vec[] = [
      { x: 102, y: 50 },
      { x: 298, y: 50 },
    ]
    const both = { axis: 'y' as const, lo: 8, hi: 92 }
    expect(moveSegment(line, 0, 60, { start: both, end: both })).toEqual([{ x: 200, y: 60 }])
  })

  it('stays square end to end once drawn', () => {
    const a: Box = { x: 0, y: 0, width: 100, height: 100 }
    const b: Box = { x: 300, y: 200, width: 100, height: 100 }
    const g = edgeGeometry(a, b, {
      sourceSide: 'right',
      targetSide: 'left',
      route: 'orthogonal',
      waypoints: moveSegment(points, 0, -40, { start, end }),
    })
    for (let i = 1; i < g.points!.length; i++) {
      const p = g.points![i]!
      const q = g.points![i - 1]!
      expect(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5).toBe(true)
    }
    expect(g.start.y).toBe(8)
  })
})

describe('tidying bend points', () => {
  it('merges a leg dropped in line with its neighbour', () => {
    const s = { x: 102, y: 50 }
    const t = { x: 298, y: 50 }
    const bends: Vec[] = [
      { x: 150, y: 50 },
      { x: 150, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 120 },
      { x: 260, y: 120 },
    ]
    expect(tidyWaypoints(s, bends, t)).toEqual([
      { x: 250, y: 50 },
      { x: 250, y: 120 },
      { x: 260, y: 120 },
    ])
  })

  it('never empties the list, which would hand the line back to the router', () => {
    const s = { x: 102, y: 50 }
    const t = { x: 298, y: 50 }
    expect(tidyWaypoints(s, [{ x: 200, y: 50 }], t)).toEqual([{ x: 200, y: 50 }])
  })
})
