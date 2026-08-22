import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const appVersion = readFileSync(new URL('./version.txt', import.meta.url), 'utf-8').trim()

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
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
