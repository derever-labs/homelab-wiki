---
title: InfluxDB & Telegraf
description: InfluxDB als Metriken-Backend mit Telegraf als zentralem Collector
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
| **Status** | Produktion |
| **URL** | [influx.ackermannprivat.ch](https://influx.ackermannprivat.ch) |
| **Deployment** | Nomad Job `monitoring/influx.nomad` (InfluxDB + Telegraf als zweite Task-Group) |
| **Storage** | Linstor CSI Volume `influxdb-data` (repliziert) |
| **Secrets** | Vault `kv/data/shared/influxdb` (username, password, url, token) |
| **Organisation** | `ackermann` |

## Architektur

```d2
direction: right

Sources: Quellen {
  style.stroke-dash: 4
  NAS: "Synology NAS\n(SNMP)"
  Nomad: "Nomad (6 Nodes)\n(Prometheus)"
  Linstor: "Linstor\n(Prometheus)"
  DRBD: "DRBD Reactor\n(Prometheus)"
  LVM: "LVM Thin Pools\n(File-Input)"
  Proxmox: "Proxmox (3 Hosts)"
}

TEL: "Telegraf\n(Nomad Job)" { style.border-radius: 8 }
INFLUX: "InfluxDB" { shape: cylinder }
GRAF: Grafana { style.border-radius: 8 }

Sources.NAS -> TEL
Sources.Nomad -> TEL
Sources.Linstor -> TEL
Sources.DRBD -> TEL
Sources.LVM -> TEL
Sources.Proxmox -> INFLUX: direkt (nativ)

TEL -> INFLUX
INFLUX -> GRAF
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
Retention Policies müssen manuell via InfluxDB UI gesetzt werden. Ohne explizite Policy behält InfluxDB Daten unbegrenzt.
:::

## Telegraf Inputs

| Plugin | Quelle | Interval | Measurement |
| :--- | :--- | :--- | :--- |
| `inputs.snmp` | Synology NAS (SNMPv3) | 30s | `snmp.Synology.*` |
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
Die Telegraf-Config ist Single Source of Truth im Git-Repo (`nomad-jobs/monitoring/telegraf/telegraf.conf`). Änderungen müssen nach NFS kopiert werden (`/nfs/docker/telegraf/config/`).
:::

## Grafana Datasources

| Name | UID | Bucket |
| :--- | :--- | :--- |
| `InfluxDB-Flux` | `cf7vieensej28c` | `telegraf` |
| `InfluxDB-Proxmox` | `cf7vogqv7xyiod` | `proxmox` |
| `InfluxDB-InfluxQL` | `PAD860D6E340F6174` | `telegraf_1y` |

`InfluxDB-InfluxQL` nutzt die schnellere InfluxQL-Abfragesprache (6-30x schneller als Flux für einfache Aggregationen). Empfohlen für Dashboards. Flux-Datasources bleiben für komplexe Queries mit `pivot()` oder `map()`.

## Performance Tuning

Der Nomad Job `monitoring/influx.nomad` enthält Optimierungen für Memory-Limits (guaranteed/burst) sowie InfluxDB-Env-Variablen für Query-Concurrency, Queue-Grösse, Storage-Cache und Compaction-Durchsatz. Die konkreten Werte sind im Job selbst dokumentiert.

::: tip DBRP Mappings
Für InfluxQL-Zugriff existieren DBRP-Mappings (Database Retention Policy) für alle Buckets. Diese werden automatisch von InfluxDB 2.x erstellt. Der v1-Kompatibilitäts-Endpoint `/query` ist standardmässig aktiv.
:::

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Grafana, Alerting, Loki
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- SNMP-Details und Dashboard
- [USV (APC)](../ups/index.md) -- USV-Metriken via `inputs.upsd` und NUT
- [Linstor/DRBD](../linstor-storage/index.md) -- Prometheus-Exporter für Linstor-Metriken
