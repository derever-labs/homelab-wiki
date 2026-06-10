---
title: Profilarr
description: Quality-Profile- und Custom-Format-Sync für Sonarr und Radarr via dictionarry-hub
tags:
  - service
  - media
  - nomad
---

# Profilarr

Profilarr synchronisiert Quality Profiles und Custom Formats von einem zentralen Hub ([dictionarry-hub/trash-pcd](https://github.com/dictionarry-hub/trash-pcd)) in Sonarr und Radarr. Es löst damit die frühere manuelle Pflege über notifiarr ab, das am 2026-06-04 zurückgebaut wurde.

## Übersicht

- URL: [profilarr.ackermannprivat.ch](https://profilarr.ackermannprivat.ch)
- Deployment: `services/profilarr.nomad`
- Storage: Linstor CSI Volume `profilarr-data` (1 GiB, Single-Node-Writer)
- Auth: Traefik `intern-auth@file` + eigene Profilarr-Authentifizierung
- Constraint: Affinity auf `vm-nomad-client-05` oder `vm-nomad-client-06` (Linstor-Nodes)

## Rolle im Stack

Profilarr ist die Sync-Schicht für Qualitätsstandards im Arr-Stack. Es liest Profile-Definitionen aus dem konfigurierten Datenbank-Hub (TRaSH Guides via dictionarry-hub/trash-pcd) und schreibt sie in die verbundenen Sonarr- und Radarr-Instanzen. Das aktiv genutzte Profil ist **SQP-1** (1080p Bluray, details: [Radarr Qualitätsprofile](./referenz.md#sqp-profile-trash-guides-special-quality-profiles)).

Profilarr ist für den laufenden Betrieb nicht kritisch: die bereits synchronisierten Profile in Sonarr/Radarr bleiben aktiv, auch wenn Profilarr nicht erreichbar ist.

## Architektur-Einbettung

```
dictionarry-hub / trash-pcd (extern)
        │
        ▼
  Profilarr (profilarr.ackermannprivat.ch)
        │  Sync via HTTP-API
   ┌────┴────┐
   ▼         ▼
Sonarr     Radarr
```

Profilarr kommuniziert ausgehend über Traefik-URLs zu Sonarr und Radarr (kein Consul DNS -- musl libc Limitation, identisch wie bei den anderen Arr-Services).

::: warning Score-Overrides sind read-only

Manuell gesetzte Score-Anpassungen in Sonarr/Radarr werden von Profilarr bei jedem Sync überschrieben, auch wenn `tweaks: false` gesetzt ist. Das ist ein bekanntes Upstream-Verhalten von Profilarr. Anpassungen müssen direkt im konfigurierten Hub-Profil oder als Custom-Additions in Profilarr selbst gepflegt werden.

:::

## Verwandte Seiten

- [Medien-Verwaltung (Arr-Stack)](./index.md) -- Sonarr, Radarr, Prowlarr, SABnzbd
- [Radarr Qualitätsprofile](./referenz.md) -- SQP-Profile und Custom Format Konfiguration
- [Media-Hilfstools](../media-tools/index.md) -- Jellystat, Janitorr und weitere Ergänzungstools
