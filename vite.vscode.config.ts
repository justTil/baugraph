import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * The editor, built to run inside the VS Code extension's webview.
 *
 * Same source as the web app, different entry (`src/vscode/main.ts`) and a few
 * constraints a webview brings with it:
 *
 *   - `base: './'` — the page is served from a `vscode-webview:` resource URI
 *     that is generated per session, so nothing may be addressed from the root.
 *     Chunks then load relative to the module that imports them, which works
 *     wherever the extension is installed.
 *   - a manifest, because the extension host builds the HTML itself and has to
 *     know which files to point it at.
 *   - Monaco's workers inlined (see `src/vscode/monaco-env.ts`).
 *
 * Output goes to `extension/media/`, which is the only directory the webview is
 * allowed to load from.
 */
const appVersion = readFileSync(new URL('./version.txt', import.meta.url), 'utf-8').trim()

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@\/lib\/monaco-env$/,
        replacement: fileURLToPath(new URL('./src/vscode/monaco-env.ts', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    // The extension is not a deployment, so there is no operator behind it and
    // nothing to show the self-hosted marker for.
    __SELF_HOSTED__: JSON.stringify(true),
  },
  build: {
    outDir: 'extension/media',
    emptyOutDir: true,
    manifest: true,
    // `public/` is the *web* app's: a favicon, a CNAME, the published schema.
    // The extension ships the schema from `extension/schema/` and has no use for
    // the rest, and everything in `media/` ends up inside the .vsix.
    copyPublicDir: false,
    // VS Code ships a current Chromium; nothing here has to reach further back
    // than the workbench itself does.
    target: 'chrome122',
    rollupOptions: {
      input: fileURLToPath(new URL('./src/vscode/main.ts', import.meta.url)),
    },
  },
})
