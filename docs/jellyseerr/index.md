---
title: Jellyseerr
description: Media Request Management für Jellyfin mit Sonarr/Radarr-Integration
tags:
  - service
  - media
  - nomad
---

# Jellyseerr

Jellyseerr ist die User-facing Oberfläche für Medienwünsche. Familie und Gäste können darüber Filme und Serien anfordern, ohne direkt mit Sonarr oder Radarr zu arbeiten.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [wish.ackermannprivat.ch](https://wish.ackermannprivat.ch) |
| Deployment | Nomad Job `media/jellyseerr.nomad` |
| Datenbank | PostgreSQL `jellyseerr` (Shared Cluster) |
| Storage | NFS `/nfs/docker/jellyseerr/config/` |
| Auth | `public-auth@file` |
| Consul Service | `jellyseerr` |

## Rolle im Stack

Jellyseerr ist die User-facing Oberfläche für Medienwünsche. Familie und Gäste können darüber Filme und Serien anfordern, ohne direkt mit Sonarr oder Radarr arbeiten zu müssen. Jellyseerr leitet Anfragen automatisch an die zuständigen Arr-Services weiter, die den Download und die Organisation übernehmen.

```d2
direction: right

USER: "User (wish.ackermannprivat.ch)" { style.border-radius: 8 }
JS: Jellyseerr { style.border-radius: 8 }
RAD: "Radarr (Filme)" { style.border-radius: 8 }
SON: "Sonarr (Serien)" { style.border-radius: 8 }
JF: "Jellyfin (Verfügbarkeit)" { style.border-radius: 8 }
SAB: SABnzbd { style.border-radius: 8 }
PG: PostgreSQL { shape: cylinder }

USER -> JS
JS -> RAD
JS -> SON
JS -> JF
RAD -> SAB
SON -> SAB
JS -> PG
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

::: warning Öffentliche Auth-Chain
Jellyseerr nutzt `public-auth` statt der internen Auth-Chain. Das ermöglicht Familienmitgliedern und Gästen den Zugriff über Authentik ForwardAuth ohne interne Netzwerkzugehörigkeit.
:::

## Request Sync Sidecar

Jellyseerr hat keinen eingebauten Retry-Mechanismus: Wenn ein approved Request nicht an Sonarr/Radarr übermittelt werden kann (z.B. Service kurzzeitig nicht erreichbar), bleibt der Request im Status "Processing" hängen und wird nie wiederholt.

Der Sidecar-Task `request-sync` prüft alle 6 Stunden die Jellyseerr-Datenbank auf hängende Requests und ruft für jeden den Jellyseerr `/retry`-Endpoint auf. Dadurch nutzt Jellyseerr seine eigene Logik für Qualitätsprofile, Tags, Root-Folder usw. beim Anlegen in Sonarr/Radarr.

| Attribut | Wert |
| :--- | :--- |
| **Task** | `request-sync` (Sidecar im Jellyseerr Job) |
| **Intervall** | 6 Stunden (konfigurierbar via `SYNC_INTERVAL_HOURS`) |
| **Script** | `nomad-jobs/media/scripts/jellyseerr-request-sync.py` |
| **Ressourcen** | Siehe Nomad-Job `media/jellyseerr.nomad` |

Der Sidecar kommuniziert ausschliesslich mit der Jellyseerr API (`/api/v1/request/{id}/retry`). Jellyseerr entscheidet selbst ob ein Film/Serie in Sonarr/Radarr hinzugefügt oder nur der Status aktualisiert werden muss.

## Service-Verbindungen

Jellyseerr verbindet sich intern über Consul DNS zu allen Diensten:

| Service | Adresse | Konfiguriert in |
| :--- | :--- | :--- |
| Sonarr | `sonarr.service.consul:8989` | `settings.json` |
| Radarr | `radarr.service.consul:7878` | `settings.json` |
| Jellyfin | `jellyfin.service.consul:8096` | `settings.json` |
| PostgreSQL | `postgres.service.consul:5432` | Nomad Job (env) |

::: warning Keine externen URLs verwenden
Jellyseerr darf nicht über externe URLs (`*.ackermannprivat.ch`) mit Sonarr/Radarr/Jellyfin kommunizieren. Die Verbindung über Traefik ist aus dem Cluster heraus unzuverlässig und führt zu stillen Sync-Ausfällen.
:::

## Abhängigkeiten

- [Arr Stack](../arr-stack/index.md) -- Sonarr, Radarr für die Mediensuche
- [Jellyfin](../jellyfin/index.md) -- Prüft Verfügbarkeit bereits vorhandener Medien
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster

## Verwandte Seiten

- [Arr Stack](../arr-stack/index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Jellyfin](../jellyfin/index.md) -- Medienserver, dessen Verfügbarkeit Jellyseerr abfragt
- [SuggestArr](../suggestarr/index.md) -- Erstellt automatisch Pending Requests in Jellyseerr
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
