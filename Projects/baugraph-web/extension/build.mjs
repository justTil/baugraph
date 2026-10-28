/**
 * Builds the extension host bundle.
 *
 *   node build.mjs [--production] [--watch]
 *
 * The *editor* is not built here — it is the web app, built by Vite into
 * `media/` (see `vite.vscode.config.ts` in the repository root, and
 * `npm run extension:build`). This produces the other half: the small Node
 * bundle VS Code loads, which owns the file and the commands.
 *
 * esbuild rather than `tsc`: the host imports `@/model` straight out of the
 * app's source, so that the format is written by one module and not by two that
 * drift. A bundler crossing that directory boundary is a non-event; `tsc` would
 * need the whole repository restructured around its output layout.
 */
import { context } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

const watch = process.argv.includes('--watch')
const production = process.argv.includes('--production')

/**
 * Files the .vsix has to carry that live in the repository root: the published
 * JSON Schema (so the *text* editor validates diagrams too) and the licence.
 * Copied rather than referenced — a .vsix is built from this directory alone.
 */
async function copyShared() {
  await mkdir(resolve(here, 'schema'), { recursive: true })
  await copyFile(
    resolve(repo, 'public/schema/baugraph-v1.schema.json'),
    resolve(here, 'schema/baugraph-v1.schema.json'),
  )
  await copyFile(resolve(repo, 'LICENSE'), resolve(here, 'LICENSE'))
}

await copyShared()

const ctx = await context({
  entryPoints: [resolve(here, 'src/extension.ts')],
  outfile: resolve(here, 'dist/extension.js'),
  bundle: true,
  // `vscode` is provided by the runtime and must never be bundled.
  external: ['vscode'],
  platform: 'node',
  // The oldest Electron/Node pairing the supported VS Code range ships with.
  target: 'node20',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  alias: { '@': resolve(repo, 'src') },
  logLevel: 'info',
})

if (watch) {
  await ctx.watch()
  console.log('watching extension/src…')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
