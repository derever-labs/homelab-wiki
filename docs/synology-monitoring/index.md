---
title: Synology NAS Monitoring
description: Überwachung des Synology NAS mit Telegraf SNMP, lokalem Telegraf und Grafana Dashboard
tags:
  - monitoring
  - nas
  - infrastructure
  - telegraf
  - grafana
---

# Synology NAS Monitoring

## Übersicht

Dreistufiges Monitoring des Synology NAS: SNMP-Metriken via Telegraf, lokaler Container für Systemmetriken und Grafana-Alerting.

| Attribut | Wert |
|----------|------|
| Dashboard | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) (UID: `synology-nas-health`) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Task `telegraf` im Job `influxdb` (`monitoring/influx.nomad`) |

## Rolle im Stack

Das NAS ist als zentraler Speicherknoten kritische Infrastruktur. Deshalb wird es auf drei Ebenen überwacht: Telegraf sammelt Hardware-Metriken via SNMP (remote) und System-Metriken via lokalem Container, Grafana visualisiert alles in einem dedizierten Dashboard mit 21 Panels, und 4 Alert Rules benachrichtigen via Telegram bei Problemen. Ergänzend überwacht [CheckMK](../checkmk/index.md) den Host-Level-Status.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

direction: right

NAS: Synology NAS
TEL_REMOTE: "Telegraf\n(Nomad Job)"
TEL_LOCAL: "Telegraf lokal\n(Docker auf NAS)"
INFLUX: InfluxDB { shape: cylinder }
GRAF: Grafana
TG: Telegram

NAS -> TEL_REMOTE: "SNMPv3\nUDP 161"
TEL_REMOTE -> INFLUX
TEL_LOCAL -> TEL_LOCAL: "Exec Scripts\n(diskio, services, jobs)"
TEL_LOCAL -> INFLUX: Consul DNS
INFLUX -> GRAF
GRAF -> TG: Alert Rules
```

## Datenquellen

Das Monitoring nutzt zwei Telegraf-Instanzen, die unterschiedliche Metriken sammeln:

### SNMP (remote, via bestehender Telegraf Nomad Job)

Der zentrale Telegraf Nomad Job fragt das NAS via SNMPv3 (authPriv) ab und schreibt die Measurements `snmp.Synology.*` (Disk, RAID, Storage-I/O, SMART, Volume-I/O, Services, Netzwerk, System). Die Telegraf-Config wird in Git verwaltet (`nomad-jobs/monitoring/telegraf/telegraf.conf`) und via NFS bereitgestellt -- dort stehen die einzelnen Measurements und Felder.

### Telegraf lokal (Docker Container auf NAS)

Ein separater Telegraf-Container läuft direkt auf dem NAS und sammelt Metriken, die via SNMP nicht zugänglich sind: `diskio` (I/O Await aus `/proc/diskstats`), `nas_background_jobs` (RAID Rebuild, Scrub, S.M.A.R.T. Tests), `nfs_server_threads` sowie die Standard-Plugins `cpu`, `mem`, `system`, `net`.

::: warning Privilegierter Container
Der lokale Telegraf-Container läuft als `--privileged` mit `/proc:/host/proc:ro`, da er `/proc/diskstats` direkt lesen muss.
:::

::: warning Nach NAS-Reboot
Container Manager und NFS müssen nach einem NAS-Reboot manuell gestartet werden (über DSM UI).
:::

## Grafana Dashboard

Das Dashboard `synology-nas-health` ist in drei Zonen aufgebaut, nach dem Prinzip "Alarm, Kontext, Detail":

- **Zone A -- Alarm:** Status-Bar mit 8 Stat-Panels (RAID, Volume, Bad Sectors, IO Wait, Hintergrund-Jobs, System-Temperatur, Uptime, SSD Remaining Life)
- **Zone B -- Kontext:** Performance-Timeseries (Disk Latenz, Throughput, CPU, RAM, Load, Netzwerk und Service Connections)
- **Zone C -- Detail:** Disk Health und Kapazität (SMART Health Table, Disk-Utilization, Disk-Temperatur, SSD Cache I/O, Volume Trend) sowie die Row "Storage-Benchmark & Reshape" (siehe unten)

Die Dashboard-JSON wird via Git verwaltet und per NFS-Mount als File Provisioning bereitgestellt (read-only).

## Alerting

4 Synology Alert Rules in Grafana Unified Alerting, alle via Telegram:

| Rule | Bedingung | For | Schwere |
| :--- | :--- | :--- | :--- |
| RAID Degraded/Crashed | raidStatus != Normal | 2 min | Critical |
| Volume belegt | > 98% | 5 min | Warning |
| Disk Temperatur | > 55 C | 5 min | Warning |
| SMART Reallocated Sectors | > 0 | 5 min | Warning |

## Storage-Benchmark & Reshape

Ein stündlicher, **NAS-autonomer** Benchmark misst die echte Disk-Performance beider NAS und schreibt direkt an InfluxDB. Ein DSM-Aufgabenplaner-Task führt lokal `fio --direct=1 --fallocate=none` aus (seq write/read + random 4K), liest den RAID-Reshape-Fortschritt aus `/proc/mdstat` und den realen Durchsatz via `iostat`. Kein Nomad-Job, kein SSH-Inbound, kein Vault-Key zur Laufzeit -- die NAS pusht selbst.

Quelle: `nomad-jobs/monitoring/nas-storage-benchmark/` (Script, Deploy-Tool `dsm-schedule.py`, README).

Mess-Physik (empirisch belegt):

- `--direct=1` umgeht den Page-Cache. Eine Messung über NFS wäre eine Cache-Illusion (NAS-async-Export puffert auch bei client-seitigem `--direct=1`).
- `--fallocate=none` ist kritisch: sonst präallokiert fio die Testdatei und read/randread lesen leere Blöcke statt echte Daten (gemessen: 1006 MB/s read auf reshapender RAID5 -- physikalisch unmöglich).

Measurements (Tag `target` = `media-210` / `docker-200`):

- `raid_benchmark` -- `bw_bytes`, `iops`, `lat_us` pro Test (seqwrite/seqread/randread)
- `reshape_status` -- `pct`, `sync_speed_kbs`, `eta_min`, `degraded`, `disks_active/total`
- `disk_io` -- `read_mb_s`, `write_mb_s`, `util_pct`, `r_await_ms`, `w_await_ms`

Der Reshape-Fortschritt (`pct`) kommt ausschliesslich aus `/proc/mdstat` -- SNMP/CheckMK können ihn nicht liefern. Im Dashboard: Row "Storage-Benchmark & Reshape" (Reshape-%-Gauge + ETA/Sync-Speed, fio-Durchsatz/IOPS/Latenz, iostat-Durchsatz/util), alle nach NAS getrennt.

::: tip DSM-Web-API zum Anlegen des Tasks
`dsm-schedule.py` legt den Task über `SYNO.Core.TaskScheduler.Root` an (Root-Tasks brauchen ein `SynoConfirmPWToken`; list/delete laufen über die normale API v3). Details in der README im Repo.
:::

## Verwandte Seiten

- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports, Garage S3, Hardware-Details
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Alloy, Alerting-Architektur
- [CheckMK](../checkmk/index.md) -- Host-Level Monitoring (Agent-basiert)
- [Hardware-Inventar](../_referenz/hardware-inventar.md#nas) -- NAS-Hardware-Spezifikationen
