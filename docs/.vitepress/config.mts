import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { generateSidebar } from 'vitepress-sidebar'

export default withMermaid(
  defineConfig({
    ignoreDeadLinks: process.env.VITEPRESS_IGNORE_DEAD_LINKS === 'true',

    vite: {
      server: {
        allowedHosts: ['wiki.ackermannprivat.ch'],
      },
      optimizeDeps: {
        include: ['mermaid'],
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
        { text: 'Architektur', link: '/architecture/' },
        { text: 'Infrastruktur', link: '/infrastructure/' },
        { text: 'Plattformen', link: '/platforms/' },
        { text: 'Services', link: '/services/' },
        { text: 'Runbooks', link: '/runbooks/' },
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
        sortMenusByFrontmatterOrder: true,
        sortMenusOrderByDescending: false,
      }).map(item => item.items ? item : { ...item, items: [] })
    },

    mermaid: {}
  })
)
