---
title: VitePress Wiki - Betrieb
description: Build- und Deploy-Pipeline, Webhook-Mechanismus und lokale Entwicklung
tags:
  - service
  - core
  - wiki
  - vitepress
  - betrieb
---

# VitePress Wiki - Betrieb

Build-, Webhook- und Deploy-Automatik des VitePress Wikis. Für den Steckbrief siehe [VitePress Wiki](./index.md), für die technische Referenz siehe [Referenz](./referenz.md).

## Build- und Deploy-Pipeline

```d2
classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Push: git push main { class: node }
GHA: "GitHub Actions\n(Self-Hosted Runner)" {
  class: node
  tooltip: "Build-Validierung: npm ci + vitepress build, Dead-Link-Handling via Issue"
}
Sidecar: "webhook-Sidecar\n(BusyBox httpd, Port 9001)" {
  class: node
  tooltip: "CGI-Script: git pull + Rebuild, flock gegen parallele Builds"
}
Dist: dist/ { class: node }
Serve: "serve\n(Port 4173)" { class: node }
Traefik: "Traefik\n(wiki.ackermannprivat.ch)" { class: node }

Push -> GHA
GHA -> Sidecar: "curl Webhook\n(Token aus Vault)"
Sidecar -> Dist: "atomarer Swap"
Dist -> Serve: "statisch ausliefern"
Traefik -> Serve: "Reverse-Proxy"
```

## Webhook-Mechanismus

Der webhook Sidecar betreibt einen BusyBox httpd auf Port 9001 mit CGI-Script:
- **Endpoint:** `/_webhook/cgi-bin/pull?token=<token>`
- **Token:** Aus Vault (`kv/vitepress-wiki/webhook_token`)
- **Lock:** `flock` verhindert parallele Builds
- **Atomarer Swap:** Build in `dist-build/`, bei Erfolg Rename zu `dist/`
- **Status:** `/_webhook/status.json` zeigt `ready`/`degraded`/`failed` + Commit + Timestamp

## Build-Status-Anzeige

Die NavBar zeigt einen Timestamp ("Stand: DD.MM. HH:MM") der alle 10 Sekunden von `/_webhook/status.json` aktualisiert wird. Custom Vue-Komponente `BuildStatus.vue`.

## GitHub Actions Workflow

| Attribut | Wert |
|----------|------|
| **Trigger** | Push auf `main` |
| **Runner** | Self-hosted (`homelab-runner-<n>`) |
| **Node** | Siehe Nomad-Job |

### Ablauf

1. `npm ci` + `vitepress build docs`
2. Bei Dead Links: Fallback-Build mit `VITEPRESS_IGNORE_DEAD_LINKS=true`
3. GitHub Issue erstellt/aktualisiert bei Dead Links (Label: `dead-links`)
4. Issue wird geschlossen wenn nächster Build erfolgreich
5. Webhook-Trigger an `wiki.ackermannprivat.ch/_webhook/cgi-bin/pull`

## GitHub Runner

Der Build läuft auf dem org-weiten Self-Hosted Runner (`derever-labs`). Details: [GitHub Runner](../github-runner/index.md).

## Lokale Entwicklung

- `npm ci` im Wiki-Verzeichnis
- `npm run dev` für den Dev-Server (Port 5173) oder `npm run build` für einen Produktions-Build

## Verwandte Seiten

- [VitePress Wiki](./index.md) -- Steckbrief und Rolle im Stack
- [Referenz](./referenz.md) -- Nomad-Tasks, VitePress-Konfiguration und Vault-Secrets
- [GitHub Runner](../github-runner/index.md) -- Self-Hosted Runner für CI/CD des Wiki-Builds
- [Traefik Reverse Proxy](../edge/traefik/index.md) -- Ingress und SSL-Terminierung für wiki.ackermannprivat.ch
