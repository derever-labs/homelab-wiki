---
title: Jellyseerr
description: Media Request Management für Jellyfin mit Sonarr/Radarr-Integration
tags:
  - service
  - media
  - nomad
---

# Jellyseerr

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [wish.ackermannprivat.ch](https://wish.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`media/jellyseerr.nomad`) |
| **Image** | `fallenbagel/jellyseerr:latest` |
| **Datenbank** | PostgreSQL `jellyseerr` (Shared Cluster) |
| **Storage** | NFS `/nfs/docker/jellyseerr/config/` |
| **Auth** | `public-guest-chain-v2@file` |
| **Consul Service** | `jellyseerr` |

## Rolle im Stack

Jellyseerr ist die User-facing Oberfläche für Medienwünsche. Familie und Gäste können darüber Filme und Serien anfordern, ohne direkt mit Sonarr oder Radarr arbeiten zu müssen. Jellyseerr leitet Anfragen automatisch an die zuständigen Arr-Services weiter, die den Download und die Organisation übernehmen.

```mermaid
flowchart LR
    USER:::entry["User<br>(wish.ackermannprivat.ch)"] --> JS:::accent["Jellyseerr"]
    JS --> RAD:::svc["Radarr<br>(Filme)"]
    JS --> SON:::svc["Sonarr<br>(Serien)"]
    JS --> JF:::svc["Jellyfin<br>(Verfügbarkeit)"]
    RAD --> SAB:::svc["SABnzbd"]
    SON --> SAB
    JS --> PG:::db["PostgreSQL"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Datenbank

Jellyseerr nutzt die shared PostgreSQL-Instanz über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf die Verfügbarkeit von PostgreSQL bevor der Hauptcontainer startet.

### Storage-Pfade

| Mount | Pfad im Container | Pfad auf Host |
| :--- | :--- | :--- |
| Config | `/app/config` | `/nfs/docker/jellyseerr/config` |

### Netzwerk

Jellyseerr läuft im Host-Netzwerkmodus mit statischem Port `5055`. Das ist notwendig für die direkte Kommunikation mit den Arr-Services.

### Constraint

Der Job ist auf `vm-nomad-client-05/06` eingeschränkt (Constraint), mit Affinität für `client-05` (Nähe zum PostgreSQL).

### Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 256 MHz |
| Memory | 768 MB (max 1024 MB) |

::: warning Guest-Chain
Jellyseerr nutzt `public-guest-chain-v2` statt der üblichen Admin-Chain. Das ermöglicht Familienmitgliedern und Gästen den Zugriff über Keycloak ohne Admin-Berechtigung.
:::

## Abhängigkeiten

- [Arr Stack](../arr-stack/index.md) -- Sonarr, Radarr für die Mediensuche
- [Jellyfin](../jellyfin/index.md) -- Prüft Verfügbarkeit bereits vorhandener Medien
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster

## Verwandte Seiten

- [Media Services](./index.md)
- [Traefik Middlewares](../traefik/referenz.md)
