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

    mermaid: {
      theme: 'base',
      themeVariables: {
        primaryColor: '#f1f5f9',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#94a3b8',
        secondaryColor: '#e2e8f0',
        secondaryTextColor: '#334155',
        secondaryBorderColor: '#94a3b8',
        tertiaryColor: '#f8fafc',
        tertiaryTextColor: '#475569',
        tertiaryBorderColor: '#cbd5e1',
        lineColor: '#64748b',
        textColor: '#334155',
        clusterBkg: '#f8fafc',
        clusterBorder: '#cbd5e1',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        actorBkg: '#f1f5f9',
        actorBorder: '#94a3b8',
        actorTextColor: '#1e293b',
        actorLineColor: '#64748b',
        noteBkgColor: '#fef9c3',
        noteTextColor: '#713f12',
        noteBorderColor: '#eab308',
        activationBkgColor: '#dbeafe',
        activationBorderColor: '#3b82f6',
        signalColor: '#64748b',
        signalTextColor: '#334155',
      },
      flowchart: {
        curve: 'basis',
        padding: 15,
      },
      sequence: {
        mirrorActors: false,
      },
    }
  })
)
