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
  Proxmox: "Proxmox (3 Hosts)"
}

NodeCron: "Node-Crons (Worker)\ncsi/lvm/nomad-health\n-> /var/lib/csi-metrics" { style.border-radius: 8 }
TELHOST: "Telegraf-Host-Agent\n(je Node, lokal)" { style.border-radius: 8 }
TEL: "Telegraf\n(Nomad Job)" { style.border-radius: 8 }
INFLUX: "InfluxDB" { shape: cylinder }
GRAF: Grafana { style.border-radius: 8 }

Sources.NAS -> TEL
Sources.Nomad -> TEL
Sources.Linstor -> TEL
Sources.DRBD -> TEL
Sources.Proxmox -> INFLUX: direkt (nativ)

NodeCron -> TELHOST: File-Input (lokal, NFS-frei)
TELHOST -> INFLUX: "Bucket telegraf\n(+ telegraf-host)"
TEL -> INFLUX
INFLUX -> GRAF
```

## Buckets

| Bucket | Schreibt wer | Retention | Inhalt |
| :--- | :--- | :--- | :--- |
| `telegraf` | Telegraf (Nomad) + Telegraf-Host-Agenten | 90 Tage | SNMP, Nomad-Prometheus, Linstor, DRBD, Media-Stats; via Node-Agenten: `lvm_thinpool`, `csi_mounts`/`csi_plugin`, `nomad_alloc_restarts`/`nomad_job_health` |
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
| `inputs.prometheus` | Nomad Clients + Servers (6x) | 30s | `prometheus` (Fields: `nomad_*`) |
| `inputs.prometheus` | Linstor (`linstor.ackermannprivat.ch/metrics`) | 60s | `prometheus` (Fields: `linstor_*`) |
| `inputs.prometheus` | DRBD Reactor (client-05/06, Port 9942) | 60s | `prometheus` (Fields: `drbd_*`) |
| `inputs.file` | Jellyfin Streams (Cron-Script) | 10s | `jellyfin_streams` |
| `inputs.exec` | Jellyfin Library Counts | 60s | `jellyfin` |
| `inputs.exec` | Radarr/Sonarr Queue | 60s | `arr_*` |

::: info Prometheus-Plugin-Schema (metric_version=2)
Telegraf-Inputs vom Typ `inputs.prometheus` mit `metric_version = 2` und **ohne `name_override`** schreiben die Prometheus-Metric-Namen als **Fields** in ein gemeinsames Measurement `prometheus`. Beispiel: `linstor_node_state` ist ein Field im Measurement `prometheus`, kein eigenes Measurement. Tags des Exporters bleiben als Tags erhalten (`node`, `name`, `conn_name`, …). Wer `name_override = "prometheus"` setzt, erhält dasselbe Layout. Für Alert-Queries entsprechend `FROM "prometheus" WHERE "_field" = "linstor_node_state"` (Flux) bzw. `SELECT last("linstor_node_state") FROM "prometheus"` (InfluxQL) verwenden.

Zusätzlich: drbd-reactor exportiert `drbd_connection_state` als **One-Hot-Encoding** mit Tag `drbd_connection_state` in `{StandAlone, Disconnecting, Unconnected, Timeout, BrokenPipe, NetworkFailure, ProtocolError, TearDown, Connecting, Connected}`. Pro Verbindung ist genau eine Series mit Wert=1 (= aktueller State), Rest=0. Alert-Logik filtert auf Tag `= 'Connected'` und alarmiert bei Wert `< 1`.
:::

## Node-Metriken ohne NFS (Telegraf-Host-Agent)

Die Node-Storage- und Job-Health-Measurements stammen **nicht** vom zentralen Telegraf-Job, sondern vom lokalen Telegraf-Host-Agent jeder Node (Ansible-Rolle `telegraf-host`, siehe [Secrets-Architektur Layer 2](../_querschnitt/secrets-architecture.md)). Drei Cron-Skripte schreiben jede Minute Line-Protocol nach dem **lokalen** Pfad `/var/lib/csi-metrics/*.influx`; der lokale Agent liest sie via `inputs.file` und routet die Measurements per zweitem `outputs.influxdb_v2` in den Bucket `telegraf` (alle übrigen Host-Metriken bleiben in `telegraf-host`).

| Cron-Skript | Nodes | Measurements | Datei |
| :--- | :--- | :--- | :--- |
| `csi-health-metrics.sh` | client-05/06 | `csi_mounts`, `csi_plugin` | `csi_health_<host>.influx` |
| `lvm-thinpool-metrics.sh` | client-05/06 | `lvm_thinpool` | `lvm_thinpool_<host>.influx` |
| `nomad-job-health-metrics.sh` | client-04/05/06 | `nomad_alloc_restarts`, `nomad_job_health` | `nomad_health_<host>.influx` |
| `csi-write-monitor.sh` | client-05/06 | `csi_write` | `csi_write_<host>.influx` (bleibt in `telegraf-host`) |

::: danger NFS-Selbstreferenz vermieden (2026-05-29)
Bis 2026-05-29 schrieben die drei Skripte nach `/nfs/docker/telegraf/metrics/` und der **zentrale** Telegraf las sie via `inputs.file`. Bei totem NAS-`nfsd` blockierten `stat` und `mv` im uninterruptiblen D-State; jede Minute starteten neue Crons, die nie endeten (~11k Prozesse, load ~12500, Node-Wedge). Der lokale Pfad plus idempotentes `mkdir -p` entkoppelt die Crons vom NFS -- ein NAS-Ausfall kann die Nodes nicht mehr lahmlegen. Routing pro Measurement steuern `namepass`/`namedrop` an den beiden `outputs.influxdb_v2` der `telegraf-host`-Konfiguration; so landet alles dashboard-stabil im gewohnten Bucket `telegraf` ohne Doppel-Write.
:::

## CheckMK als zusätzliche Quelle

Die CheckMK-Site `homelab` schreibt Service-Performance-Metriken aller monitored Hosts (`checkmk` selbst, Proxmox-Hosts, Nomad-Cluster, beide Synology-NAS) zusätzlich in den `telegraf`-Bucket. Damit landen Hardware-Metriken aus CheckMK (CPU/Mem/Filesystem/Disk-IO/Network) und Telegraf-SNMP-Metriken im selben Bucket und können in Grafana mit gleichen Datasources kombiniert werden.

| Forwarder | CheckMK-Connection | Bucket | Endpoint |
| :--- | :--- | :--- | :--- |
| `cmc_influxdb_service_metrics` | `InfluxDB_Ops_Privat` | `telegraf` | `influxdb.service.consul:8086` |

::: info Service-Discovery via vm-proxy-dns-01
vm-checkmk Homelab nutzt `10.0.2.1` (`vm-proxy-dns-01`) als DNS-Server, der `*.consul`-Anfragen an die Consul-Cluster weiterleitet. Damit folgt der Forwarder automatisch jedem Reschedule des Influx-Service.
:::

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
| `InfluxDB-InfluxQL-Hot` | `influxql-hot-telegraf` | `telegraf` |

`InfluxDB-InfluxQL` nutzt die schnellere InfluxQL-Abfragesprache (6-30x schneller als Flux für einfache Aggregationen). Empfohlen für Dashboards. Flux-Datasources bleiben für komplexe Queries mit `pivot()` oder `map()`.

::: warning Bucket-Wahl für Alert-Rules
Real-Time-Alerts mit Eval-Window unter 1h **müssen** gegen den Hot-Bucket (DS `InfluxDB-InfluxQL-Hot`) zeigen. `telegraf_1y` ist ein Downsample-Target (`every: 1h` Task, 5-Minuten-Aggregate) -- bei Eval-Window 10 Minuten gegen `telegraf_1y` entsteht ein Phantom-Storm-Cycle (`Pending → Alerting → MissingSeries` pro Volume pro Stunde), der wie ein echtes Cluster-Problem aussieht. Konvention: Dashboards mit Trends > 30d nutzen weiterhin `telegraf_1y` (1 Jahr Retention), Real-Time-Alerts holen aus `telegraf` (90d Retention, 60s-Auflösung).
:::

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
