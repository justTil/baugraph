import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DiagramDocument, DiagramEdge } from '@/model'
import { parse } from '@/model'
import type { EdgeGeometry, EdgeRouteOptions } from '@/features/diagram/lib/edge-path'
import { pipelineDocument, sampleDocument, webAppDocument } from '@/features/diagram/data/sample'

/**
 * Shared by `routes.test.ts` and `generate-routes.ts`: which diagrams the
 * route goldens cover, and what is kept of each route. Both route through
 * `routeEdges` — the export's own routing — so a golden is always compared
 * against the inputs it was recorded from.
 */

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = resolve(here, '../fixtures')

/** How the router drew one connection. */
export interface GoldenRoute {
  route: EdgeRouteOptions['route']
  manual: boolean
  path: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  points?: { x: number; y: number }[]
}

export interface RouteGoldens {
  /** The commit whose router drew these, and the release it shipped in. */
  ref: string
  release: string
  /** Diagram name (see `goldenDocuments`) → edge id → route. */
  documents: Record<string, Record<string, GoldenRoute>>
}

/**
 * Every diagram a released Baugraph could have on disk that we hold a copy of:
 * each release's valid schema fixtures, and the samples every new user opens.
 * Named by fixture path, or `sample:<name>`.
 */
export function goldenDocuments(): Map<string, DiagramDocument> {
  const docs = new Map<string, DiagramDocument>()
  const releases = existsSync(fixturesRoot)
    ? readdirSync(fixturesRoot).filter((n) => /^\d+\.\d+\.\d+$/.test(n))
    : []
  for (const release of releases.sort()) {
    for (const dir of [join(fixturesRoot, release), join(fixturesRoot, release, 'valid')]) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
        const file = join(dir, name)
        docs.set(relative(fixturesRoot, file), parse(readFileSync(file, 'utf-8')))
      }
    }
  }
  docs.set('sample:order-processing', sampleDocument())
  docs.set('sample:pipeline', pipelineDocument())
  docs.set('sample:web-app', webAppDocument())
  return docs
}

/** What a golden keeps of a drawn route. */
export function toGolden(edge: DiagramEdge, g: EdgeGeometry): GoldenRoute {
  return {
    route: edge.route,
    manual: !!edge.waypoints?.length,
    path: g.path,
    start: g.start,
    end: g.end,
    ...(g.points ? { points: g.points } : {}),
  }
}
