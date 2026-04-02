---
title: Vaultwarden
description: Selbstgehosteter Passwort-Manager (Bitwarden API kompatibel) mit SQLite und Litestream-Replikation
tags:
  - service
  - security
  - nomad
---

# Vaultwarden

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [p.ackermannprivat.ch](https://p.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/vaultwarden.nomad`) |
| **Storage** | NFS `/nfs/docker/vaultwarden` |
| **Datenbank** | SQLite (`db.sqlite3`), repliziert via Litestream |
| **Auth** | `public-auth@file` |

## Rolle im Stack

Vaultwarden ist der zentrale Passwort-Manager im Homelab. Als leichtgewichtige, in Rust geschriebene Reimplementierung der Bitwarden-Server-API ist er vollständig kompatibel mit den offiziellen Bitwarden-Clients (Desktop, Mobile, Browser-Extension). Alle Passwörter, TOTP-Secrets und sichere Notizen werden hier verwaltet.

## Architektur

Vaultwarden nutzt SQLite als Datenbank -- kein PostgreSQL-Shared-Cluster. Die Datenbank wird via Litestream kontinuierlich auf das NAS repliziert, was eine Point-in-Time-Recovery ermöglicht.

```mermaid
flowchart LR
    subgraph Clients
        BRW:::entry["Browser Extension"]
        APP:::entry["Bitwarden App<br>(iOS/Android/Desktop)"]
    end

    subgraph Traefik["Traefik (10.0.2.20)"]
        R1:::svc["Router: p.*<br>public-auth"]
    end

    subgraph Nomad["Nomad Cluster"]
        VW:::accent["Vaultwarden"]
    end

    subgraph Storage
        NFS:::db["NFS<br>/nfs/docker/vaultwarden"]
    end

    BRW -->|HTTPS| R1
    APP -->|HTTPS| R1
    R1 --> VW
    VW --> NFS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Datenbank und Replikation

Vaultwarden speichert alle Daten in einer SQLite-Datei (`db.sqlite3`). Litestream repliziert diese Datei kontinuierlich auf das NAS, sodass bei einem Ausfall der letzte Stand wiederhergestellt werden kann.

### Sicherheit

- Traefik schützt den Zugang mit `public-auth@file` (CrowdSec + Authentik ForwardAuth)
- Die Kommunikation erfolgt ausschliesslich verschlüsselt via HTTPS
- Registrierung neuer Benutzer ist deaktiviert

## Backup

- **Litestream:** Kontinuierliche SQLite-Replikation auf das NAS
- **NFS-Verzeichnis:** `/nfs/docker/vaultwarden` wird zusätzlich durch die allgemeine [Backup-Strategie](../backup/index.md) abgedeckt
- Tägliche Snapshots des gesamten Verzeichnisses empfohlen als zusätzliche Absicherung

## Verwandte Seiten

- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- Litestream-Replikationsziel
