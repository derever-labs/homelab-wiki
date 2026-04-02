---
title: Obsidian LiveSync
description: Selbstgehosteter Obsidian Sync Server mit CouchDB-Backend
tags:
  - service
  - productivity
  - nomad
  - obsidian
---

# Obsidian LiveSync

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [obsidian-sync.ackermannprivat.ch](https://obsidian-sync.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/obsidian-livesync.nomad`) |
| **Storage** | Linstor CSI (`obsidian-livesync-data`) |
| **Datenbank** | CouchDB 3.3.3 (integriert) |
| **Auth** | `intern-noauth@file` + CouchDB Basic Auth |

## Rolle im Stack

Obsidian LiveSync ersetzt den kostenpflichtigen Obsidian Sync Service durch eine selbstgehostete Alternative. Ein CouchDB-Server synchronisiert Obsidian-Vaults in Echtzeit zwischen mehreren Geräten (Desktop, Mobile). Die Synchronisation läuft über das CouchDB-Replikationsprotokoll.

## Architektur

```mermaid
flowchart LR
    subgraph Clients
        MAC:::entry["Obsidian<br>(macOS)"]
        IOS:::entry["Obsidian<br>(iOS)"]
    end

    subgraph Traefik["Traefik (10.0.2.20)"]
        R1:::svc["Router: obsidian-sync.*<br>intern-noauth + CORS"]
    end

    subgraph Nomad["Nomad Cluster"]
        CDB:::accent["CouchDB 3.3.3<br>(Port 5984)"]
    end

    subgraph Storage
        LINSTOR:::db["Linstor CSI<br>obsidian-livesync-data"]
    end

    MAC -->|HTTPS + Basic Auth| R1
    IOS -->|HTTPS + Basic Auth| R1
    R1 --> CDB
    CDB --> LINSTOR

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Storage

CouchDB-Daten liegen auf einem replizierten Linstor-CSI-Volume (`obsidian-livesync-data`) mit DRBD-Replikation. CouchDB verwendet die eingebauten Defaults -- eine separate `local.ini` wird nicht eingebunden.

Der Job ist auf `vm-nomad-client-05` / `vm-nomad-client-06` eingeschränkt (Constraint), da nur diese Nodes Linstor-Storage bereitstellen.

### CORS

Für die Kommunikation zwischen Obsidian-Clients und CouchDB sind spezielle CORS-Header nötig. Diese werden über eine Traefik-Middleware (`obsidian-cors`) konfiguriert:

- Erlaubte Origins: `app://obsidian.md`, `capacitor://localhost`, `http://localhost`
- Erlaubte Methoden: GET, PUT, POST, HEAD, DELETE
- Credentials: Erlaubt

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/obsidian-livesync` | `couchdb_password` |

### Authentifizierung

Doppelte Absicherung: Traefik schützt den Zugang mit `intern-noauth@file` (IP-Whitelist). CouchDB selbst authentifiziert zusätzlich mit Basic Auth (Benutzer `obsidian`).

::: warning Nur interner Zugriff
Der Service ist bewusst nur intern erreichbar (`intern-noauth@file`). Obsidian-Clients müssen sich im lokalen Netzwerk oder über VPN befinden.
:::

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing, CORS-Middleware und IP-Whitelist
- **Linstor CSI** -- Replizierter Block-Storage für CouchDB-Daten

## Verwandte Seiten

- [Traefik Middlewares](../traefik/referenz.md) -- CORS-Middleware und IP-Whitelist
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor CSI](../linstor-storage/index.md) -- Replizierter Block-Storage (DRBD)
