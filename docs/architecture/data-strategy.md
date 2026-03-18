---
title: Datenstrategie & Replikation
description: Speicher-Konzepte, Litestream Replikation und Backups
tags:
  - architecture
  - backup
  - sqlite
  - litestream
  - storage
---

# Datenstrategie

Diese Seite beschreibt, wie persistente Daten im Cluster gespeichert, repliziert und gesichert werden.

## 1. Speicher-Ebenen

| Ebene | Technologie | Pfad | Verwendungszweck |
|-------|-------------|------|------------------|
| **Hot Storage** | Lokales SSD/ZFS | `/local-docker/` | Performance-kritische DBs (SQLite) |
| **Shared Storage** | NFS (Synology) | `/nfs/docker/` | Medien, Konfigurationsdateien, Backups |
| **Object Storage** | MinIO (S3) | `http://10.0.0.200:9000` | Backup-Targets, Terraform State |

## 2. Aktuelle Datenbank-Strategie

Alle datenbank-gestützten Services nutzen den **PostgreSQL 16 Shared Cluster** auf einem DRBD-replizierten Linstor CSI Volume. Details zur Architektur, Service-Zuordnung und Backup: [Datenbank-Architektur](./database-architecture.md) | [Backup-Strategie](../services/core/backup-strategy.md)

## 3. Litestream Replikation (SQLite) -- Nicht umgesetzt

::: danger Veraltet -- Nicht in Produktion
Dieses Konzept wurde geplant, aber **nie produktiv umgesetzt**. Alle hier gelisteten Services (Radarr, Sonarr, Prowlarr, Jellyseerr, Vaultwarden, etc.) nutzen de facto **PostgreSQL** via `postgres.service.consul:5432`. Die Litestream-Architektur und MinIO-Peer-Replicas auf Node-05/06 sind nicht aktiv. Die zugehörigen Vault-Credentials wurden gelöscht (18.03.2026).

Dieser Abschnitt bleibt als historische Referenz erhalten. Für die aktuelle Strategie siehe [Datenbank-Architektur](./database-architecture.md).
:::

Um SQLite-Datenbanken (die lokal liegen müssen) hochverfügbar zu machen, war Litestream für eine Echtzeit-Replikation vorgesehen.

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                     Litestream Replikation                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Node-05 ◄───── Thunderbolt ─────► Node-06                     │
│   MinIO:9100      (11 Gbps)         MinIO:9100                  │
│   10.99.1.105                       10.99.1.106                 │
│        │                                 │                       │
│        └──────► Peer Replica ◄───────────┘                      │
│                   (sync: 5s)                                     │
│                       │                                          │
│                       ▼                                          │
│                  NAS MinIO                                       │
│               10.0.0.200:9000                                    │
│                (sync: 60s)                                       │
│              (retention: 7d)                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Komponenten

| Komponente | Endpoint | Zweck |
|------------|----------|-------|
| NAS MinIO | http://10.0.0.200:9000 | Langzeit-Backup (7 Tage Retention) |
| Node-05 MinIO | http://10.99.1.105:9100 | Peer-Replica via Thunderbolt |
| Node-06 MinIO | http://10.99.1.106:9100 | Peer-Replica via Thunderbolt |

### Services mit Litestream

| Service | DB-Pfad | Job-Datei |
|---------|---------|-----------|
| uptime-kuma | `/data/kuma.db` | monitoring/uptime-kuma-litestream.nomad |
| jellyseerr | `/data/db/db.sqlite3` | media/jellyseerr.nomad |
| maintainerr | `/data/maintainerr.sqlite` | media/maintainerr.nomad |
| radarr | `/data/radarr.db` | media/radarr.nomad |
| sonarr | `/data/sonarr.db` | media/sonarr.nomad |
| prowlarr | `/data/prowlarr.db` | media/prowlarr.nomad |
| vaultwarden | `/data/db.sqlite3` | services/vaultwarden.nomad |

**Hinweis:** Alle Jobs können auf `vm-nomad-client-05` oder `vm-nomad-client-06` laufen.
Bei Job-Start wird automatisch von der Peer-Replica (schnell) oder NAS (Fallback) restored.

### Credentials

::: warning Veraltet
Die Litestream-Credentials wurden aus Vault entfernt, da dieses Konzept nie produktiv ging:
- `kv/litestream-s3` — gelöscht (18.03.2026)
- `kv/minio-nas` — nach 1Password migriert (18.03.2026)
- `kv/minio-peer` — nach 1Password migriert (18.03.2026)
:::

### Performance

| Metrik | Wert |
|--------|------|
| Peer Sync-Interval | 5 Sekunden |
| NAS Sync-Interval | 60 Sekunden |
| Restore-Zeit (15MB DB) | ~1-2 Sekunden |
| RPO (Recovery Point Objective) | 5 Sekunden (Peer) |
| Thunderbolt Bandbreite | ~11 Gbps |

