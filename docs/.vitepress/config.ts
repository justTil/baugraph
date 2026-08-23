import { defineConfig } from 'vitepress'

// Deployed at baugraph.com/docs (and at /docs behind self-hosted nginx), as
// its own static site next to the app rather than an in-app dockview panel —
// see `docs:build` in package.json, which writes here after the app build so
// the two never race for `dist/`.
export default defineConfig({
  outDir: '../dist/docs',
  base: '/docs/',

  title: 'Baugraph',
  description: 'Architecture diagrams — flows, queues, integrations — that live in your repository.',
  cleanUrls: false,

  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  themeConfig: {
    logo: '/favicon.svg',

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'File format', link: '/file-format' },
      { text: 'Open the app', link: 'https://baugraph.com' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'The editor', link: '/editor' },
          { text: 'Message flows', link: '/message-flows' },
          { text: 'Exporting', link: '/exports' },
          { text: 'Keyboard shortcuts', link: '/shortcuts' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'The .baugraph.json format', link: '/file-format' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/justTil/baugraph' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Baugraph',
    },
  },
})
