---
title: VitePress Wiki - Referenz
description: Nomad-Tasks, VitePress-Konfiguration und Vault-Secrets
tags:
  - service
  - core
  - wiki
  - vitepress
  - referenz
---

# VitePress Wiki - Referenz

Technische Referenz für das VitePress Wiki. Für den Steckbrief siehe [VitePress Wiki](./index.md), für Build- und Webhook-Automatik siehe [Betrieb](./betrieb.md).

## Nomad Job (3-Task-Architektur)

| Task | Lifecycle | Funktion |
|------|-----------|----------|
| **build** | Prestart | Klont Repo, `npm ci`, `vitepress build docs` |
| **webhook** | Sidecar | Webhook-Empfänger + atomarer Rebuild |
| **vitepress** | Main | Serviert statische Dateien via `serve` auf Port 4173 |

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

## Verwandte Seiten

- [VitePress Wiki](./index.md) -- Steckbrief und Rolle im Stack
- [Betrieb](./betrieb.md) -- Build-, Webhook- und Deploy-Automatik
- [GitHub Runner](../github-runner/index.md) -- Self-Hosted Runner für den Wiki-Build
- [Traefik Reverse Proxy](../../edge/traefik/index.md) -- Ingress und SSL-Terminierung
