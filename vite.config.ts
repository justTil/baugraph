import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const appVersion = readFileSync(new URL('./version.txt', import.meta.url), 'utf-8').trim()
const selfHosted = process.env.SELF_HOSTED === 'true'

// https://vite.dev/config/
export default defineConfig({
  // Served from the custom domain baugraph.com at the root, so the base stays /.
  base: '/',
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // In dev, /docs is its own VitePress dev server (see `npm run docs:dev`,
    // launched alongside this one by `npm run dev`) rather than a build
    // output — proxy through to it so the Docs link works without a build.
    // VitePress applies the same `base: '/docs/'` in dev, so the path needs
    // no rewrite.
    proxy: {
      '/docs': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    // Set by the self-hosted Docker build (see Dockerfile / build_docker_image_self_hosted.sh)
    // to drop the operator-specific Impressum/Legal links and show a "self-hosted" marker instead.
    __SELF_HOSTED__: JSON.stringify(selfHosted),
  },
})
