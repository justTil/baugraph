import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { EdgeGeometry, Vec } from '@/features/diagram/lib/edge-path'
import { routeEdges } from '@/features/diagram/lib/render-svg'
import type { GoldenRoute, RouteGoldens } from './routes'
import { goldenDocuments } from './routes'

/**
 * Backward compatibility of connection routing: a diagram saved by a released
 * Baugraph must be drawn the way that release drew it.
 *
 * `routes-<release>.json` is that release's router run over every diagram in
 * `goldenDocuments()` — see `generate-routes.ts`. Held against it:
 *
 *   - Automatic connections, and manual straight and curved ones, are drawn
 *     exactly as before — the same path, to the character.
 *   - Manual orthogonal connections are now kept square (the 1.35.0 change).
 *     Where the stored points already lined up, give or take the drift of a
 *     hand-dragged point, the line is where it was. Where they did not, the
 *     diagonal becomes a corner — but the line still runs through every point
 *     the file stores, and still leaves and meets the same side of each node.
 */

const here = dirname(fileURLToPath(import.meta.url))
const GOLDENS = ['1.34.0']

/** Matches `ALIGNED` in `edge-path`: the drift a hand-placed point is allowed. */
const DRIFT = 1

const close = (a: Vec, b: Vec, by = 0.01) => Math.abs(a.x - b.x) <= by && Math.abs(a.y - b.y) <= by
const square = (points: Vec[]) =>
  points.every(
    (p, i) =>
      i === 0 ||
      Math.abs(p.x - points[i - 1]!.x) < DRIFT ||
      Math.abs(p.y - points[i - 1]!.y) < DRIFT,
  )
/** Two ends on the same side of a box share the coordinate across that side. */
const sameSide = (a: Vec, b: Vec) => Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01

const documents = goldenDocuments()

for (const release of GOLDENS) {
  const goldens = JSON.parse(
    readFileSync(resolve(here, `routes-${release}.json`), 'utf-8'),
  ) as RouteGoldens

  describe(`connections saved by ${release} (routed by ${goldens.ref})`, () => {
    const all = Object.entries(goldens.documents).flatMap(([name, routes]) =>
      Object.entries(routes).map(([id, golden]) => ({ name, id, golden })),
    )
    const kind = ({ golden }: { golden: GoldenRoute }) =>
      `${golden.manual ? 'manual' : 'automatic'} ${golden.route}`

    it('covers every kind of connection', () => {
      // A golden that only ever saw automatic lines would pass whatever
      // happened to manual ones — the fixtures have to keep exercising both.
      const kinds = new Set(all.map(kind))
      for (const route of ['orthogonal', 'straight', 'curved']) {
        expect(kinds).toContain(`automatic ${route}`)
        expect(kinds).toContain(`manual ${route}`)
      }
    })

    it('still has every diagram it was recorded from', () => {
      expect([...documents.keys()]).toEqual(expect.arrayContaining(Object.keys(goldens.documents)))
    })

    for (const [name, routes] of Object.entries(goldens.documents)) {
      describe(name, () => {
        // Routed the way an export routes them, which is what the canvas draws.
        const doc = documents.get(name)
        const routed = doc ? routeEdges(doc) : new Map<string, EdgeGeometry>()

        for (const [id, golden] of Object.entries(routes)) {
          const drawn = () => {
            const g = routed.get(id)
            expect(g, `${id} is no longer in ${name}`).toBeDefined()
            return g!
          }

          if (!golden.manual || golden.route !== 'orthogonal') {
            it(`${id} (${kind({ golden })}) — drawn exactly as before`, () => {
              expect(drawn().path).toBe(golden.path)
            })
            continue
          }

          it(`${id} (manual orthogonal) — square, through every stored point`, () => {
            const g = drawn()
            const stored = doc!.edges.find((e) => e.id === id)!.waypoints!
            expect(square(g.points!)).toBe(true)
            for (const p of stored) {
              expect(
                g.points!.some((q) => close(p, q)),
                `passes through (${p.x}, ${p.y})`,
              ).toBe(true)
            }
            expect(sameSide(g.start, golden.start), 'leaves the same side').toBe(true)
            expect(sameSide(g.end, golden.end), 'meets the same side').toBe(true)
          })

          if (square(golden.points!)) {
            it(`${id} (manual orthogonal, already square) — drawn where it was`, () => {
              const g = drawn()
              expect(g.points).toHaveLength(golden.points!.length)
              g.points!.forEach((p, i) => expect(close(p, golden.points![i]!, DRIFT)).toBe(true))
            })
          }
        }
      })
    }

  })
}
