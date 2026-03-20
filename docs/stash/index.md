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
| **Auth** | OAuth2 via Keycloak (`admin-chain-v2`) | OAuth2 via Keycloak (`admin-chain-v2`) |
| **Node-Constraint** | `vm-nomad-client-05` oder `06` (Linstor) | `vm-nomad-client-05` oder `06` (Linstor) |

## Architektur

```mermaid
flowchart TD
    subgraph Clients["Zugriff"]
        Browser:::entry["Browser"]
    end

    subgraph Traefik["Traefik (10.0.2.1)"]
        R1:::svc["Router: s.*<br>admin-chain-v2"]
        R2:::svc["Router: secure.*<br>admin-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        S1:::accent["stash<br>(Haupt-Instanz)"]
        S2:::accent["stash-secure<br>(Separate Instanz)"]
    end

    subgraph Storage["Storage"]
        LCSI:::db["Linstor CSI<br>stash-data"]
        LCSI2:::db["Linstor CSI<br>stash-secure-data"]
        NFS1:::db["NFS<br>/nfs/logs/.../data"]
        NFS2:::db["NFS<br>/nfs/logs/.../secure"]
    end

    subgraph Batch["Batch Jobs"]
        PH:::svc["ph-downloader"]
        RD:::svc["reddit-downloader"]
    end

    Browser -->|HTTPS| R1
    Browser -->|HTTPS| R2
    R1 --> S1
    R2 --> S2
    S1 --> LCSI
    S1 --> NFS1
    S2 --> LCSI2
    S2 --> NFS2
    PH -.->|Stash API: Scan + Generate| S1
    RD -.->|Stash API: Scan + Generate| S1

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
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
