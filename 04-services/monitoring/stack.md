---
title: Monitoring Stack
description: Übersicht der Überwachungswerkzeuge (Grafana, Uptime Kuma)
published: true
date: 2025-12-26T19:25:00+00:00
tags: service, monitoring, nomad
editor: markdown
---

# Monitoring Stack

## Übersicht
Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Grafana** | Dashboards & Metriken | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) |
| **Loki** | Zentrales Log-Storage | [loki.ackermannprivat.ch](https://loki.ackermannprivat.ch) |
| **Grafana Alloy** | Log-Collector (System-Job) | — (laeuft auf jedem Client-Node) |
| **Uptime Kuma** | Verfügbarkeits-Checks | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |

## Grafana
### Datenquellen
- **InfluxDB:** Speichert Metriken von Nomad, Consul und Proxmox.
- **Loki:** Container-Logs (via Grafana Alloy gesammelt).
- **CheckMK:** Integriert über das CheckMK-Plugin für Infrastruktur-Status.

### Authentifizierung
Erfolgt via OAuth2 (Keycloak). Nur Benutzer der Gruppe `admin` haben Zugriff.

### Deployment
Grafana laeuft mit persistentem Storage (Linstor CSI Volume `grafana-data`, 1 GiB) fuer Unified Alerting State:
- **Dashboards:** JSON Dateien unter `/nfs/docker/grafana/dashboards/` (aus Git).
- **Datasources:** Via Nomad Template aus Vault Secrets (`kv/grafana`, `kv/influxdb`, `kv/jellystat`) provisioniert.
- **Alerting:** Unified Alerting aktiv, Alert Rules via File Provisioning (siehe unten).
- **Constraint:** Nur auf client-05/06 (Linstor CSI Volume verfuegbar).

### Alerting (Unified Alerting)
Grafana Unified Alerting ist die zentrale Stelle fuer alle metrikbasierten Alerts.

**Contact Point:** Telegram (Bot-Token aus `kv/data/telegram` via Vault)
**Notification Policy:** Alle Alerts → Telegram, Group-Wait 30s, Repeat 4h

**Alert Rules (provisioniert via Nomad Template):**

| Rule | Bedingung | For | Severity |
| :--- | :--- | :--- | :--- |
| LVM Thin Pool > 75% | `data_percent > 75` | 5min | Warning |
| LVM Thin Pool > 85% | `data_percent > 85` | 2min | Critical |
| LVM Metadata > 75% | `metadata_percent > 75` | 5min | Warning |
| DRBD Out-of-Sync | `outofsync_bytes > 0` | 10min | Warning |
| DRBD Disconnected | `Connected != 1` | 5min | Critical |

**Hinweis:** Die Alert-Annotations verwenden Grafana Template-Variablen (`$labels`, `$values`), die fuer Nomads Template-Engine escaped werden muessen (`{{ "{{" }}` / `{{ "}}" }}`).

## Uptime Kuma
Überwacht alle externen und internen Endpunkte via HTTP/TCP-Checks.
- **Benachrichtigungen:** Bei Ausfall erfolgt eine Meldung via Telegram (konfiguriert in Vault).
- **Datenbank:** `kuma.db` (Repliziert via Litestream auf NAS).

## Backup-Monitoring

### Linstor Backup Monitor
Ein separates Script (`/usr/local/bin/linstor-backup-monitor.sh`) prueft um 06:00 Uhr den Status der S3-Backups und meldet via Uptime Kuma Push.

### PostgreSQL Backup
Der Nomad Batch-Job `postgres-backup` fuehrt taeglich ein `pg_dumpall` durch und sichert auf NFS (`/nfs/backup/postgres/`). Status wird via Uptime Kuma Push gemeldet.

## Zentrales Logging (Loki + Alloy)

### Architektur
```
Docker Container (je Node) → Grafana Alloy (System-Job) → Loki → Grafana
```

### Loki (Log-Storage)
- **Nomad Job:** `monitoring/loki.nomad` (Service-Job, Priority 100)
- **Storage:** Linstor CSI Volume `loki-data` (20 GiB, repliziert)
- **Port:** 3100 (statisch)
- **Retention:** 30 Tage (720h)
- **Zugang:** `loki.ackermannprivat.ch` (intern, `intern-admin-chain@file`)

### Grafana Alloy (Log-Collector)
- **Nomad Job:** `system/alloy.nomad` (System-Job, laeuft auf jedem Client-Node)
- **Docker-Socket:** `/var/run/docker.sock` (read-only) fuer Container-Discovery
- **Labels:** Extrahiert `nomad_task` aus Container-Name, `nomad_alloc_id` aus Docker-Labels
- **External Label:** `node` (Hostname des Client-Nodes)

### Log-Abfrage in Grafana
- Datasource: **Loki** (uid: `loki-logs`)
- Beispiel-Queries:
  - `{nomad_task="grafana"}` — Alle Grafana-Logs
  - `{node="vm-nomad-client-05"}` — Alle Logs von client-05
  - `{nomad_task="prowlarr"} |= "error"` — Prowlarr-Fehler

## Wartung
### Grafana Dashboards
Dashboards werden teilweise als JSON in `infra/nomad-jobs/monitoring/grafana-dashboards/` verwaltet oder direkt in der UI erstellt.

---
*Letztes Update: 21.02.2026*
