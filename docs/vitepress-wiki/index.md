---
title: VitePress Wiki
description: Homelab-Dokumentation mit automatischem Deployment
tags:
  - service
  - core
  - wiki
  - vitepress
---

# VitePress Wiki

Das Homelab-Wiki wird mit VitePress gebaut und via Nomad als statische Seite serviert, mit automatischem Deployment über GitHub Webhooks.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [wiki.ackermannprivat.ch](https://wiki.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/vitepress-wiki.nomad` |
| Auth | Authentik ForwardAuth (`intern-auth@file`) |

## Rolle im Stack

Das VitePress Wiki ist die zentrale Dokumentations-Plattform des Homelabs. Es wird bei jedem Push auf `main` automatisch via Self-Hosted Runner gebaut und per Webhook neu deployt.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

classes: {
  node: {
    style: { border-radius: 8 }
  }
}

Push: git push main { class: node }
GHA: "GitHub Actions\n(Self-Hosted Runner)" { class: node }
WH: "Webhook\n(Port 9001)" { class: node }
Sync: webhook Sidecar { class: node }
Dist: dist/ { class: node }
Serve: "serve\n(Port 4173)" { class: node }
Traefik: "Traefik\n(wiki.ackermannprivat.ch)" { class: node }

Push -> GHA
GHA -> GHA: Build-Validierung
GHA -> WH: curl webhook
WH -> Sync: git pull + rebuild
Sync -> Dist: atomarer Swap
Dist -> Serve
Serve -> Traefik
```

## Nomad Job (3-Task-Architektur)

| Task | Lifecycle | Funktion |
|------|-----------|----------|
| **build** | Prestart | Klont Repo, `npm ci`, `vitepress build docs` |
| **webhook** | Sidecar | Webhook-Empfänger + atomarer Rebuild |
| **vitepress** | Main | Serviert statische Dateien via `serve` auf Port 4173 |

### Webhook-Mechanismus

Der webhook Sidecar betreibt einen BusyBox httpd auf Port 9001 mit CGI-Script:
- **Endpoint:** `/_webhook/cgi-bin/pull?token=<token>`
- **Token:** Aus Vault (`kv/vitepress-wiki/webhook_token`)
- **Lock:** `flock` verhindert parallele Builds
- **Atomarer Swap:** Build in `dist-build/`, bei Erfolg Rename zu `dist/`
- **Status:** `/_webhook/status.json` zeigt `ready`/`degraded`/`failed` + Commit + Timestamp

### Build-Status-Anzeige

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

## VitePress-Konfiguration

| Feature | Details |
|---------|---------|
| **Sidebar** | Auto-generiert via `vitepress-sidebar` (Frontmatter `order` für Sortierung) |
| **Suche** | Lokale Suche (eingebaut) |
| **Diagramme** | D2 via `vitepress-plugin-d2` |
| **Edit-Links** | Jede Seite hat "Seite bearbeiten" Link zu GitHub |
| **Last Updated** | Automatisch aus Git-History |

## Vault Secrets

| Pfad | Keys | Beschreibung |
|------|------|--------------|
| `kv/vitepress-wiki` | `ssh_key` | Ed25519 Deploy Key (read-only) |
| `kv/vitepress-wiki` | `webhook_token` | Token für Webhook-Authentifizierung |
| `kv/github-runner` | `access_token` | GitHub Token für Runner-Registrierung |

## Lokale Entwicklung

- `npm ci` im Wiki-Verzeichnis
- `npm run dev` für den Dev-Server (Port 5173) oder `npm run build` für einen Produktions-Build

## Richtlinien

Inhaltliche Regeln und Formatierungs-Konventionen: [Wiki-Richtlinien](../wiki-richtlinien.md)

## Verwandte Seiten

- [GitHub Runner](../github-runner/index.md) -- Self-Hosted Runner für CI/CD des Wiki-Builds
- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress und SSL-Terminierung für wiki.ackermannprivat.ch
- [Wiki-Richtlinien](../wiki-richtlinien.md) -- Formatierungs- und Inhaltskonventionen
