import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the test run does not pull in the Vue
// plugin, dev-tools and Tailwind — none of which the model/schema tests need.
export default defineConfig({
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
