import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// The same build-time globals `vite.config.ts` defines, from the same source, so
// code that reads them (the citations, for one) is tested against the version
// that is actually being released.
const appVersion = readFileSync(new URL('./version.txt', import.meta.url), 'utf-8').trim()
const buildDate = new Date().toISOString().slice(0, 10)

// Kept separate from vite.config.ts so the test run does not pull in the Vue
// plugin, dev-tools and Tailwind — none of which the model/schema tests need.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __SELF_HOSTED__: JSON.stringify(false),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The extension host imports the editor's API, which only exists inside
      // VS Code's own process. `tests/extension/vscode.stub.ts` stands in for it.
      vscode: fileURLToPath(new URL('./tests/extension/vscode.stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
  },
})
