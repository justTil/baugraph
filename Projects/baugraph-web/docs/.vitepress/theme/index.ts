import type { Theme } from 'vitepress'
// Without VitePress's bundled Inter: the docs use the app's own Geist (see brand.css).
import DefaultTheme from 'vitepress/theme-without-fonts'
import { h } from 'vue'
import LegalFooter from './LegalFooter.vue'
import './brand.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'layout-bottom': () => h(LegalFooter),
  }),
} satisfies Theme
