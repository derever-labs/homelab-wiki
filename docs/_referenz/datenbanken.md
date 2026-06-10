---
title: Datenbanken
description: Zentrale Referenz für die Zuordnung von Services zu Datenbanken, Vault-Pfaden und Nomad Jobs
tags:
  - referenz
  - postgresql
  - datenbank
  - vault
---

# Datenbanken

::: info SSOT
Diese Seite ist die zentrale Referenz für die Zuordnung von Services zu Datenbanken.
:::

## Shared PostgreSQL Cluster

Alle folgenden Services nutzen `postgres.service.consul:5432` mit eigenen Datenbanken und Benutzern.

| Service | Datenbank(en) | DB-User | Vault-Pfad | Nomad Job |
| :--- | :--- | :--- | :--- | :--- |
| Radarr | `radarr_main`, `radarr_log` | `radarr` | `kv/data/radarr` | `media/radarr.nomad` |
| Sonarr | `sonarr_main`, `sonarr_log` | `sonarr` | `kv/data/sonarr` | `media/sonarr.nomad` |
| Prowlarr | `prowlarr_main`, `prowlarr_log` | `prowlarr` | `kv/data/prowlarr` | `media/prowlarr.nomad` |
| Jellyseerr | `jellyseerr` | `jellyseerr` | `kv/data/jellyseerr` | `media/jellyseerr.nomad` |
| JellyStat | via Vault | via Vault | `kv/data/jellystat` | `media/jellystat.nomad` |
| Vaultwarden | `vaultwarden` | `vaultwarden` | `kv/data/vaultwarden` | `services/vaultwarden.nomad` |
| Paperless | via Vault | via Vault | `kv/data/paperless` | `services/paperless-simple.nomad` |
| Gitea | via Vault | via Vault | `kv/data/gitea` | `services/gitea.nomad` |
| Tandoor | `djangodb` | `djangouser` | `kv/data/tandoor` | `services/tandoor.nomad` |
| solidtime | via Vault | via Vault | `kv/data/solidtime` | `services/solidtime.nomad` |
| n8n | `n8n` | `n8n` | `kv/data/n8n` | `services/n8n.nomad` |
| Metabase | via Vault | via Vault | `kv/data/metabase` | `services/metabase.nomad` |
| Grafana | `grafana` | `grafana` | `kv/data/grafana` (`db_password`) | `monitoring/grafana.nomad` |
| Directus Gravel | `gravel_recherche` | `directus_gravel` | `kv/data/directus-gravel` | `services/directus-gravel.nomad` |
| Authentik | `authentik` | `authentik` | `kv/data/authentik` | `identity/authentik.nomad` |
| Keep | `keep` | `keep` | `kv/data/shared/postgres` (`keep_password`) | `monitoring/keep.nomad` |
| immo-monitor | `immo` | `immo` | `kv/data/immo-monitor` | `services/immo-monitor.nomad` |
| immoscraper | `immo` | `immo` | `kv/data/immoscraper` | `services/immoscraper.nomad` |

## Shared MariaDB Cluster

Services die einen MySQL-/MariaDB-Backend benötigen, nutzen `mariadb.service.consul:3306` mit eigenen Datenbanken und Benutzern.

| Service | Datenbank | DB-User | Vault-Pfad | Nomad Job |
| :--- | :--- | :--- | :--- | :--- |
| Uptime Kuma | `uptime_kuma` | `uptime_kuma` | `kv/data/shared/mariadb` (`uptime_kuma_password`) | `monitoring/uptime-kuma.nomad` |

## Sidecar-Datenbanken

Services die nicht mit den Shared-Clustern kompatibel sind.

| Service | DB-Engine | Grund | Nomad Job |
| :--- | :--- | :--- | :--- |
| Obsidian LiveSync | CouchDB (Sidecar) | Benötigt CouchDB für Sync-Protokoll | `services/obsidian-livesync.nomad` |

## Keine Datenbank

| Service | Speicher | Nomad Job |
| :--- | :--- | :--- |
| Jellyfin | SQLite auf NFS | `media/jellyfin.nomad` |
| AudioBookShelf | SQLite auf NFS | `media/audiobookshelf.nomad` |

## PostgreSQL Cluster Details

| Attribut | Wert |
| :--- | :--- |
| **Nomad Job** | `databases/postgres-drbd.nomad` |
| **Consul Service** | `postgres.service.consul:5432` |
| **Storage** | Linstor CSI Volume `postgres-data` |
| **Replikation** | DRBD via Thunderbolt (pve01/pve02) |
| **Superuser** | `postgres` |
| **Vault Secret** | `kv/data/postgres` (Key: `password`) |

## MariaDB Cluster Details

| Attribut | Wert |
| :--- | :--- |
| **Nomad Job** | `databases/mariadb-drbd.nomad` |
| **Consul Service** | `mariadb.service.consul:3306` |
| **Storage** | Linstor CSI Volume `mariadb-data` (rg-replicated) |
| **Replikation** | DRBD via Thunderbolt (client-05/06) |
| **Superuser** | `root` |
| **Vault Secret** | `kv/data/shared/mariadb` (Key: `admin_password`) |
| **Setup-Job** | `databases/mariadb-setup.nomad` (idempotent, neue DBs/User) |
| **Backup-Job** | `batch-jobs/mariadb-backup.nomad` (täglich 03:15, GFS) |

Performance-Tuning ist auf DRBD-Storage abgestimmt: `innodb_flush_log_at_trx_commit=2`, `innodb_doublewrite=OFF` (DRBD garantiert atomare Block-Writes), und `innodb_*_buffering=OFF` (entspricht O_DIRECT in 11.x).

## Verwaltung

DbGate (`dbgate.ackermannprivat.ch`) steht als Web-UI für die Datenbankverwaltung zur Verfügung. Nomad Job: `databases/dbgate.nomad`.

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- Architekturkonzept und DRBD-Replikation
- [Backup](../backup/) -- PostgreSQL Dumps, DRBD Snapshots und Retention
