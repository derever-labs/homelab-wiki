import { defineConfig } from 'vitepress'
import { generateSidebar } from 'vitepress-sidebar'
import d2 from 'vitepress-plugin-d2'
import { Theme, Layout, FileType } from 'vitepress-plugin-d2/dist/config'

export default defineConfig({
  ignoreDeadLinks: process.env.VITEPRESS_IGNORE_DEAD_LINKS === 'true',

  vite: {
    server: {
      allowedHosts: ['wiki.ackermannprivat.ch'],
    },
  },
  title: 'Homelab Wiki',
  description: 'Architektur, Infrastruktur, Services',
  lang: 'de-CH',
  lastUpdated: true,

  themeConfig: {
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'Auf dieser Seite' },
    lastUpdated: { text: 'Zuletzt aktualisiert' },
    editLink: {
      pattern: 'https://github.com/derever/homelab-wiki/edit/main/docs/:path',
      text: 'Seite bearbeiten'
    },

    nav: [
      { text: 'Systeme', link: '/traefik/' },
      { text: 'Referenz', link: '/_referenz/hosts-und-ips' },
      { text: 'Richtlinien', link: '/wiki-richtlinien' },
    ],

    sidebar: generateSidebar({
      documentRootPath: '/docs',
      useTitleFromFrontmatter: true,
      useFolderTitleFromIndexFile: true,
      useFolderLinkFromIndexFile: true,
      includeFolderIndexFile: false,
      collapsed: true,
      collapseDepth: 1,
      sortMenusByName: true,
    }).map(item => item.items ? item : { ...item, items: [] })
  },

  markdown: {
    config: (md) => {
      md.use(d2, {
        theme: Theme.NEUTRAL_GREY,
        layout: Layout.ELK,
        fileType: FileType.SVG,
        padding: 40,
      })
    },
  },
})
