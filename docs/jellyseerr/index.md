---
title: Seerr (Jellyseerr)
description: Media Request Management für Jellyfin mit Sonarr/Radarr-Integration
tags:
  - service
  - media
  - nomad
---

# Seerr (Jellyseerr)

Seerr (bis Version 2.x unter dem Namen Jellyseerr, seit 3.0 umbenannt zu `seerr-team/seerr`) ist die User-facing Oberfläche für Medienwünsche. Familie und Gäste können darüber Filme und Serien anfordern, ohne direkt mit Sonarr oder Radarr zu arbeiten.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [wish.ackermannprivat.ch](https://wish.ackermannprivat.ch) |
| Deployment | Nomad Job `media/jellyseerr.nomad` |
| Image | `ghcr.io/seerr-team/seerr` via ZOT (`ghcr.io`-Pfad-Präfix) |
| Storage | Linstor CSI Volume `jellyseerr-data` |
| Auth | `public-auth@file` |

::: warning Seerr 3.x läuft non-root
Seit 3.0 läuft der Container als User UID 1000 (PUID/PGID werden ignoriert, der Job setzt `init = true`). Das Config-Volume muss `1000:1000` gehören -- läuft zwischenzeitlich eine 2.x-Version (root), legen deren Log-Dateien den 3.x-Start mit einem EACCES-Crash-Loop lahm.
:::

::: warning pgloader-konvertierte Datenbank
Die PostgreSQL-Datenbank `jellyseerr` wurde historisch per pgloader aus SQLite konvertiert. Constraint-/Index-Namen und Spaltentypen (bigint statt integer) weichen vom TypeORM-Schema ab -- vor Major-Upgrades die Migrations-Dateien im neuen Image gegen das Ist-Schema prüfen, sonst bricht die automatische DB-Migration.
:::

## Rolle im Stack

Seerr leitet Anfragen automatisch an die zuständigen Arr-Services weiter, die den Download und die Organisation übernehmen.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

USER: "User (wish.ackermannprivat.ch)" { style.border-radius: 8 }
JS: Seerr { style.border-radius: 8 }
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

Seerr nutzt die Datenbank `jellyseerr` der shared PostgreSQL-Instanz über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf die Verfügbarkeit von PostgreSQL bevor der Hauptcontainer startet. Details zur Cluster-Zuordnung: [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md).

### Netzwerk

Seerr läuft im Host-Netzwerkmodus mit statischem Port `5055`. Das ist notwendig für die direkte Kommunikation mit den Arr-Services.

### Constraint

Der Job ist auf `vm-nomad-client-05/06` eingeschränkt (Constraint), mit Affinität für `client-05` (Nähe zum PostgreSQL).

::: warning Öffentliche Auth-Chain
Seerr nutzt `public-auth` statt der internen Auth-Chain. Das ermöglicht Familienmitgliedern und Gästen den Zugriff über Authentik ForwardAuth ohne interne Netzwerkzugehörigkeit.
:::

Passwort-Recovery: Authentik-Login erscheint via ForwardAuth bereits vor Seerr und enthält den nativen Recovery-Link. Zusätzlich rendert Seerr auf der "Sign in with Jellyfin"-Maske einen Forgot-Link auf den Authentik-Recovery-Flow -- aktiviert via Settings → Jellyfin: External URL (`externalHostname`) **plus** Forgot Password URL (`jellyfinForgotPasswordUrl`). Beide URLs ohne trailing slash. Native OIDC fehlt auch in Seerr 3.x. Details: [Authentik Betrieb -- Recovery-Eingangspfade aus Apps](../authentik/betrieb.md#recovery-eingangspfade-aus-apps).

## Request Sync Sidecar

Seerr hat keinen eingebauten Retry-Mechanismus: Wenn ein approved Request nicht an Sonarr/Radarr übermittelt werden kann (z.B. Service kurzzeitig nicht erreichbar), bleibt der Request im Status "Processing" hängen und wird nie wiederholt.

Der Sidecar-Task `request-sync` (definiert im Job `media/jellyseerr.nomad`, Script `media/scripts/jellyseerr-request-sync.py`) prüft alle 6 Stunden (konfigurierbar via `SYNC_INTERVAL_HOURS`) die Seerr-Datenbank auf hängende Requests und ruft für jeden den Seerr-`/retry`-Endpoint auf. Dadurch nutzt Seerr seine eigene Logik für Qualitätsprofile, Tags, Root-Folder usw. beim Anlegen in Sonarr/Radarr.

Der Sidecar kommuniziert ausschliesslich mit der Seerr-API (`/api/v1/request/{id}/retry`). Seerr entscheidet selbst ob ein Film/Serie in Sonarr/Radarr hinzugefügt oder nur der Status aktualisiert werden muss.

## Service-Verbindungen

Seerr verbindet sich intern über Consul DNS zu allen Diensten:

| Service | Adresse |
| :--- | :--- |
| Sonarr | `sonarr.service.consul:8989` |
| Radarr | `radarr.service.consul:7878` |
| Jellyfin | `jellyfin.service.consul:8096` |
| PostgreSQL | `postgres.service.consul:5432` |

::: warning Keine externen URLs verwenden
Seerr darf nicht über externe URLs (`*.ackermannprivat.ch`) mit Sonarr/Radarr/Jellyfin kommunizieren. Die Verbindung über Traefik ist aus dem Cluster heraus unzuverlässig und führt zu stillen Sync-Ausfällen.
:::

## Verwandte Seiten

- [Arr Stack](../arr-stack/index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Jellyfin](../jellyfin/index.md) -- Medienserver, dessen Verfügbarkeit Seerr abfragt
- [SuggestArr](../suggestarr/index.md) -- Erstellt automatisch Pending Requests in Seerr
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
