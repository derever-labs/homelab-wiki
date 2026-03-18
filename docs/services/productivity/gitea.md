---
title: Gitea
description: Self-hosted Git Server mit PostgreSQL und SSH-Zugang
tags:
  - service
  - productivity
  - nomad
  - git
---

# Gitea

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [gitea.ackermannprivat.ch](https://gitea.ackermannprivat.ch) |
| **SSH** | `ssh://git@gitea:2222` |
| **Deployment** | Nomad Job (`services/gitea.nomad`) |
| **Storage** | Linstor CSI (`gitea-data`, 5 GiB replicated) |
| **Datenbank** | PostgreSQL `gitea` (Shared Cluster via `postgres.service.consul`) |
| **Auth** | Keycloak OIDC (konfiguriert via Gitea UI) + `intern-admin-chain-v2@file` |

## Rolle im Stack

Gitea ist der zentrale Git-Server für private und interne Repositories. Er ergänzt GitHub für Repos, die ausschliesslich intern bleiben sollen (z.B. Konfigurationen, Automatisierungen). Über den integrierten SSH-Server (Port 2222) kann direkt mit Git gearbeitet werden, ohne den Webzugang zu nutzen.

## Architektur

```mermaid
flowchart LR
    subgraph Clients
        GIT:::entry["Git CLI<br>(SSH Port 2222)"]
        WEB:::entry["Browser"]
    end

    subgraph Traefik["Traefik (10.0.2.1)"]
        R1:::svc["Router: gitea.*<br>intern-admin-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        GT:::accent["Gitea<br>(Port 3003)"]
        PG:::db["PostgreSQL 16<br>(postgres.service.consul)"]
    end

    subgraph Storage
        CSI:::db["Linstor CSI<br>gitea-data (5 GiB)"]
    end

    WEB -->|HTTPS| R1
    R1 --> GT
    GIT -->|SSH| GT
    GT --> PG
    GT --> CSI

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Storage

Gitea verwendet ein Linstor CSI Volume (`gitea-data`, 5 GiB, replicated) anstatt NFS. Das Volume wird unter `/data` im Container gemountet und enthält Repositories, Konfiguration und Logs.

### Datenbank

PostgreSQL-Datenbank `gitea` auf dem Shared Cluster, Zugriff über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf PostgreSQL-Verfügbarkeit bevor Gitea startet.

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/gitea` | `postgres_password` |

### SSH

Der integrierte SSH-Server lauscht auf Port 2222 (static). Registriert als separater Consul Service (`gitea-ssh`) mit TCP Health Check.

### Sicherheit

- Registrierung ist deaktiviert (`DISABLE_REGISTRATION=true`)
- Anmeldung erforderlich zum Browsen (`REQUIRE_SIGNIN_VIEW=true`)
- OpenID Sign-in und Sign-up deaktiviert

## Abhängigkeiten

- **PostgreSQL** -- Shared Cluster (`postgres.service.consul`)
- **Traefik** -- HTTPS-Routing und Middleware
- **Linstor** -- CSI Volume für Daten-Persistenz
- **Keycloak** -- OIDC-Provider (konfiguriert in Gitea UI)
- **Consul** -- Service Discovery und DNS

## Verwandte Seiten

- [Traefik](../core/traefik.md)
- [Backup-Strategie](../core/backup-strategy.md)
