---
title: InfluxDB & Telegraf
description: InfluxDB 2.x als Metriken-Backend mit Telegraf als zentralem Collector
tags:
  - monitoring
  - influxdb
  - telegraf
  - nomad
---

# InfluxDB & Telegraf

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **InfluxDB** | v2.x (Nomad Job `monitoring/influx.nomad`) |
| **Telegraf** | Im selben Nomad-Job als zweite Task-Group |
| **URL** | [influx.ackermannprivat.ch](https://influx.ackermannprivat.ch) |
| **Storage** | Linstor CSI Volume `influxdb-data` (10 GiB, repliziert) |
| **Secrets** | Vault `kv/data/shared/influxdb` (username, password, url, token) |
| **Organisation** | `ackermann` |

## Architektur

```
Synology NAS ─── SNMP ───────┐
Nomad (6 Nodes) ─ Prometheus ─┤
Linstor ────────── Prometheus ─┼──→ Telegraf ──→ InfluxDB ──→ Grafana
DRBD Reactor ──── Prometheus ─┤
LVM Thin Pools ── File-Input ─┤
Proxmox (3 Hosts) ──────────────────── direkt ──→ InfluxDB
```

## Buckets

| Bucket | Schreibt wer | Retention | Inhalt |
| :--- | :--- | :--- | :--- |
| `telegraf` | Telegraf (Nomad) | 90 Tage | SNMP, Nomad-Prometheus, Linstor, DRBD, LVM, Media-Stats |
| `proxmox` | Proxmox VE (nativ) | 90 Tage | VM/Container CPU, RAM, Disk, Netzwerk |
| `telegraf_1y` | InfluxDB Task | 1 Jahr | 5-Min Durchschnitte (Downsampling) |
| `telegraf_5y` | InfluxDB Task | 5 Jahre | 1h Durchschnitte (Downsampling) |
| `proxmox_1y` | InfluxDB Task | 1 Jahr | 5-Min Durchschnitte (Downsampling) |
| `proxmox_5y` | InfluxDB Task | 5 Jahre | 1h Durchschnitte (Downsampling) |

::: warning Retention Policies
Retention Policies muessen manuell via InfluxDB CLI oder UI gesetzt werden. Ohne explizite Policy behält InfluxDB Daten unbegrenzt.
:::

## Telegraf Inputs

| Plugin | Quelle | Interval | Measurement |
| :--- | :--- | :--- | :--- |
| `inputs.snmp` | Synology NAS (10.0.0.200, SNMPv3) | 30s | `snmp.Synology.*` |
| `inputs.prometheus` | Nomad Clients + Servers (6x) | 30s | `prometheus` |
| `inputs.prometheus` | Linstor (`linstor.ackermannprivat.ch/metrics`) | 60s | `linstor_*` |
| `inputs.prometheus` | DRBD Reactor (client-05/06, Port 9942) | 60s | `drbd_*` |
| `inputs.file` | LVM Thin Pool Metriken (Cron-Script) | 10s | `lvm_thinpool` |
| `inputs.file` | Jellyfin Streams (Cron-Script) | 10s | `jellyfin_streams` |
| `inputs.exec` | Jellyfin Library Counts | 60s | `jellyfin` |
| `inputs.exec` | Radarr/Sonarr Queue | 60s | `arr_*` |

## Secrets-Verwaltung

Alle Secrets werden via Vault injiziert:

- **InfluxDB Token:** `kv/data/shared/influxdb` (Key: `token`)
- **SNMP Credentials:** `kv/data/shared/telegraf-snmp` (Keys: `sec_name`, `auth_password`, `priv_password`)

Die Telegraf-Config (`telegraf.conf`) verwendet Umgebungsvariablen (`${INFLUXDB_TOKEN}`, `${SNMP_SEC_NAME}` etc.), die via Nomad-Template aus Vault geladen werden.

::: info Config-Deployment
Die Telegraf-Config ist Single Source of Truth im Git-Repo (`nomad-jobs/monitoring/telegraf/telegraf.conf`). Änderungen muessen nach NFS kopiert werden (`/nfs/docker/telegraf/config/`).
:::

## Grafana Datasources

| Name | UID | Bucket |
| :--- | :--- | :--- |
| `InfluxDB-Flux` | `cf7vieensej28c` | `telegraf` |
| `InfluxDB-Proxmox` | `cf7vogqv7xyiod` | `proxmox` |
| `InfluxDB-InfluxQL` | `PAD860D6E340F6174` | `telegraf_1y` |

`InfluxDB-InfluxQL` nutzt die schnellere InfluxQL-Abfragesprache (6-30x schneller als Flux für einfache Aggregationen). Empfohlen für Dashboards. Flux-Datasources bleiben für komplexe Queries mit `pivot()` oder `map()`.

## Performance Tuning

InfluxDB Nomad Job (`monitoring/influx.nomad`) enthält folgende Optimierungen:

**Resources:**
- Memory: 2048 MB guaranteed, 6144 MB burst (InfluxDB empfiehlt min. 2 GB)

**Env-Variablen:**
- `INFLUXD_QUERY_CONCURRENCY=5` -- Max 5 parallele Queries (Default 10)
- `INFLUXD_QUERY_QUEUE_SIZE=20` -- Queue für wartende Queries
- `INFLUXD_STORAGE_CACHE_MAX_MEMORY_SIZE=512000000` -- 512 MB Storage Cache
- `INFLUXD_STORAGE_COMPACT_THROUGHPUT_BURST=104857600` -- 100 MB/s Compaction

::: tip DBRP Mappings
Für InfluxQL-Zugriff existieren DBRP-Mappings (Database Retention Policy) für alle Buckets. Diese werden automatisch von InfluxDB 2.x erstellt. Der v1-Kompatibilitäts-Endpoint `/query` ist standardmässig aktiv.
:::

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Grafana, Alerting, Loki
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- SNMP-Details und Dashboard
- [USV (APC)](../ups/index.md) -- Geplant: `inputs.upsd` via NUT (noch nicht eingerichtet)
- [Linstor/DRBD](../linstor-storage/index.md) -- Prometheus-Exporter fuer Linstor-Metriken
