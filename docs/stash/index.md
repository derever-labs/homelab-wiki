---
title: Stash
description: Media Organizer und Metadata Manager mit zwei getrennten Instanzen
tags:
  - service
  - media
  - nomad
  - linstor
---

# Stash

## Uebersicht

Stash ist ein selbstgehosteter Media Organizer fuer Videos und Bilder. Er bietet automatisches Tagging, Metadaten-Management, Szenen-Erkennung und eine durchsuchbare Mediathek. Es laufen zwei getrennte Instanzen mit identischer Storage-Strategie (Linstor CSI fuer Config/Cache/Metadaten, NFS fuer Medien-Daten).

| Attribut | stash | stash-secure |
| :--- | :--- | :--- |
| **Status** | Produktion | Produktion |
| **URL** | [s.ackermannprivat.ch](https://s.ackermannprivat.ch) | [secure.ackermannprivat.ch](https://secure.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`media/stash.nomad`) | Nomad Job (`media/stash-secure.nomad`) |
| **Image** | `stashapp/stash:latest` | `stashapp/stash:latest` |
| **Prioritaet** | 95 (kritisch) | 95 (kritisch) |
| **Config-Storage** | Linstor CSI Volume (`stash-data`) | Linstor CSI Volume (`stash-secure-data`) |
| **Media-Storage** | NFS (shared mit Downloadern) | NFS (separates Verzeichnis) |
| **Auth** | Authentik ForwardAuth (`intern-auth`) | Authentik ForwardAuth (`intern-auth`) |
| **Node-Constraint** | `vm-nomad-client-05` oder `06` (Linstor) | `vm-nomad-client-05` oder `06` (Linstor) |

## Architektur

```d2
direction: down

Clients: Zugriff {
  style.stroke-dash: 4
  Browser: Browser { style.border-radius: 8 }
}

Traefik: "Traefik (10.0.2.20)" {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  R1: "Router: s.* intern-auth" { style.border-radius: 8 }
  R2: "Router: secure.* intern-auth" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  S1: "stash (Haupt-Instanz)" { style.border-radius: 8 }
  S2: "stash-secure (Separate Instanz)" { style.border-radius: 8 }
}

Storage: Storage {
  style.stroke-dash: 4
  LCSI: "Linstor CSI stash-data" { shape: cylinder }
  LCSI2: "Linstor CSI stash-secure-data" { shape: cylinder }
  NFS1: "NFS /nfs/.../data" { shape: cylinder }
  NFS2: "NFS /nfs/.../secure" { shape: cylinder }
}

Batch: Batch Jobs {
  style.stroke-dash: 4
  PH: ph-downloader { style.border-radius: 8 }
  RD: reddit-downloader { style.border-radius: 8 }
}

Clients.Browser -> Traefik.R1: HTTPS
Clients.Browser -> Traefik.R2: HTTPS
Traefik.R1 -> Nomad.S1
Traefik.R2 -> Nomad.S2
Nomad.S1 -> Storage.LCSI
Nomad.S1 -> Storage.NFS1
Nomad.S2 -> Storage.LCSI2
Nomad.S2 -> Storage.NFS2
Batch.PH -> Nomad.S1: "Stash API: Scan + Generate" { style.stroke-dash: 5 }
Batch.RD -> Nomad.S1: "Stash API: Scan + Generate" { style.stroke-dash: 5 }
```

## Rolle im Stack

Stash ist der zentrale Media Organizer fuer heruntergeladene Inhalte. Die Batch Jobs ([Content Pipeline](../content-pipeline/index.md)) laden neue Medien herunter und triggern anschliessend ueber die Stash GraphQL-API automatisch einen Library Scan und die Generierung von Vorschaubildern, Sprites und Thumbnails.

### Zwei Instanzen -- warum?

Die Haupt-Instanz (`stash`) verwaltet die primaere Mediathek und wird von den Batch Jobs automatisch aktualisiert. Die Instanz `stash-secure` ist eine separate Installation mit eigenem Storage, die keine automatische Integration mit den Downloadern hat. Beide Instanzen teilen sich das gleiche Docker-Image, sind aber vollstaendig voneinander isoliert.

## Konfiguration

### Ressourcen

Die Haupt-Instanz hat deutlich hoehere Ressourcen, da sie fuer Metadaten-Generierung (Previews, Sprites, Perceptual Hashes) rechenintensiv arbeitet:

- **stash:** 2000 MHz CPU, 4 GB RAM (Burst bis 8 GB), SQLite Cache 16 MiB
- **stash-secure:** 1024 MHz CPU, 128 MB RAM (Burst bis 256 MB)

### Linstor CSI Volumes

Beide Instanzen nutzen Linstor CSI Volumes fuer Konfiguration, Cache und Metadaten (`stash-data` bzw. `stash-secure-data`). Das erfordert, dass die Jobs auf einem Linstor Storage Node (`vm-nomad-client-05` oder `06`) laufen. Die Medien-Daten liegen weiterhin auf NFS. Siehe [Linstor](../linstor-storage/index.md) fuer Details zum CSI-Setup.

### Stash API

Stash bietet eine GraphQL-API, die von den Batch Jobs genutzt wird. Authentifizierung erfolgt ueber einen API-Key aus Vault (`kv/data/stash`).

| Endpunkt | Zweck |
| :--- | :--- |
| `POST /graphql` mit `metadataScan` | Library Scan nach neuen Dateien |
| `POST /graphql` mit `metadataGenerate` | Generierung von Covers, Previews, Sprites, Thumbnails |

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/stash` | `api_key` |

## Verwandte Seiten

- [Content Pipeline](../content-pipeline/index.md) -- Batch Jobs die Stash fuettern
- [Video-Download-Tools](../video-download/index.md) -- Manuelle Download-UIs
- [Arr-Stack](../arr-stack/index.md) -- Medien-Automatisierung (Sonarr, Radarr, etc.)
- [Jellyfin](../jellyfin/index.md) -- Media Player
- [Linstor](../linstor-storage/index.md) -- CSI Storage fuer beide Instanzen
