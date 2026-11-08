/**
 * Records how a released router drew every connection in `goldenDocuments()`,
 * for `routes.test.ts` to hold today's router to.
 *
 *   npx vite-node tests/golden/generate-routes.ts <git-ref> <release>
 *   npx vite-node tests/golden/generate-routes.ts 0a3c8e3 1.34.0
 *
 * The router is taken from `<git-ref>`, not from the working tree — the whole
 * point is a record of what shipped. It is checked out next to the live one
 * just long enough to run, so it resolves `@/` imports the way it always did,
 * and is handed exactly the inputs the export gives today's (`routeEdges`).
 * Only regenerate a golden for a release that has actually shipped; an
 * existing one is never rewritten to make a failing test pass.
 */
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { routeEdges } from '@/features/diagram/lib/render-svg'
import type { RouteGoldens } from './routes'
import { goldenDocuments, toGolden } from './routes'

const [ref, release] = process.argv.slice(2)
if (!ref || !release) {
  console.error('usage: generate-routes.ts <git-ref> <release>')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const routerFile = 'src/features/diagram/lib/edge-path.ts'
const legacy = resolve(here, '../../src/features/diagram/lib/.edge-path.legacy.ts')
const source = execFileSync('git', ['show', `${ref}:./${routerFile}`], {
  cwd: resolve(here, '../..'),
  encoding: 'utf-8',
})

writeFileSync(legacy, source)
try {
  const { edgeGeometry: router } = (await import(legacy)) as {
    edgeGeometry: typeof import('@/features/diagram/lib/edge-path').edgeGeometry
  }
  const goldens: RouteGoldens = { ref, release, documents: {} }
  for (const [name, doc] of goldenDocuments()) {
    const routes: RouteGoldens['documents'][string] = {}
    for (const [id, g] of routeEdges(doc, undefined, router)) {
      routes[id] = toGolden(doc.edges.find((e) => e.id === id)!, g)
    }
    goldens.documents[name] = routes
  }
  const out = resolve(here, `routes-${release}.json`)
  writeFileSync(out, `${JSON.stringify(goldens, null, 2)}\n`)
  const count = Object.values(goldens.documents).reduce((n, d) => n + Object.keys(d).length, 0)
  console.log(`wrote ${count} routes from ${ref} to ${out}`)
} finally {
  rmSync(legacy, { force: true })
}
