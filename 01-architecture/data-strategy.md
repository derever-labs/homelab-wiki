---
title: Datenstrategie & Replikation
description: Speicher-Konzepte, Litestream Replikation und Backups
published: true
date: 2025-12-26T20:00:00+00:00
tags: architecture, backup, sqlite, litestream, storage
editor: markdown
---

# Datenstrategie

Diese Seite beschreibt, wie persistente Daten im Cluster gespeichert, repliziert und gesichert werden.

## 1. Speicher-Ebenen

| Ebene | Technologie | Pfad | Verwendungszweck |
|-------|-------------|------|------------------|
| **Hot Storage** | Lokales SSD/ZFS | `/local-docker/` | Performance-kritische DBs (SQLite) |
| **Shared Storage** | NFS (Synology) | `/nfs/docker/` | Medien, Konfigurationsdateien, Backups |
| **Object Storage** | MinIO (S3) | `http://10.0.0.200:9000` | Backup-Targets, Terraform State |

## 2. Litestream Replikation (SQLite)

Um SQLite-Datenbanken (die lokal liegen müssen) hochverfügbar zu machen, nutzen wir Litestream für eine Echtzeit-Replikation.

## Architektur

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

## Komponenten

| Komponente | Endpoint | Zweck |
|------------|----------|-------|
| NAS MinIO | http://10.0.0.200:9000 | Langzeit-Backup (7 Tage Retention) |
| Node-05 MinIO | http://10.99.1.105:9100 | Peer-Replica via Thunderbolt |
| Node-06 MinIO | http://10.99.1.106:9100 | Peer-Replica via Thunderbolt |

## Services mit Litestream

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

## Credentials

Alle Credentials sind in Vault gespeichert:
- `kv/minio-nas`
- `kv/litestream-s3`
- `kv/minio-peer`

## Performance

| Metrik | Wert |
|--------|------|
| Peer Sync-Interval | 5 Sekunden |
| NAS Sync-Interval | 60 Sekunden |
| Restore-Zeit (15MB DB) | ~1-2 Sekunden |
| RPO (Recovery Point Objective) | 5 Sekunden (Peer) |
| Thunderbolt Bandbreite | ~11 Gbps |

---
*Letztes Update: 26.12.2025*
