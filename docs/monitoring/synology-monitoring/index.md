---
title: Synology NAS Monitoring
description: Überwachung des Synology NAS mit CheckMK, lokalem Telegraf und Grafana Dashboard
tags:
  - monitoring
  - nas
  - infrastructure
  - checkmk
  - telegraf
  - grafana
---

# Synology NAS Monitoring

## Übersicht

Dreistufiges Monitoring des Synology NAS: Hardware-Health via CheckMK, lokaler Telegraf-Container für die Metriken, die SNMP nicht kennt, und ein NAS-autonomer Storage-Benchmark.

| Attribut | Wert |
|----------|------|
| Dashboard | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) (UID: `synology-nas-health`) \| Siehe [Web-Interfaces](../../_referenz/web-interfaces.md) |
| Hardware-Health | CheckMK-Site `homelab` (SNMPv3, agentenlos) |
| Ergänzende Metriken | Telegraf-Container auf dem NAS (Container Manager), Benchmark via DSM-Aufgabenplaner |
| Alarmierung | CheckMK -> Keep -> Telegram (alleinige Quelle für NAS-Hardware) |

## Rolle im Stack

Das NAS ist als zentraler Speicherknoten kritische Infrastruktur. [CheckMK](../checkmk/index.md) fragt beide NAS direkt via SNMPv3 ab und liefert die Hardware-Health (RAID, Disks inkl. Cache/M.2, Lüfter, Netzteil, Filesystem, CPU/RAM, Netzwerk-Durchsatz). Es ist damit die alleinige Alarmquelle für NAS-Hardware. Ergänzend sammelt ein lokaler Telegraf-Container die Metriken, die CheckMK nicht liefert, und ein NAS-autonomer Benchmark misst Disk-Performance und RAID-Reshape. Alle drei schreiben nach InfluxDB, Grafana visualisiert sie im Dashboard `synology-nas-health`.

::: info Cutover auf CheckMK (2026-06-05)
Bis 2026-06-05 fragte der zentrale Telegraf-Nomad-Job das NAS parallel via SNMPv3 ab. Mit dem Cutover wurden der SNMP-Block aus der Telegraf-Config, der MIBs-Mount aus `influx.nomad` und die vier Synology-Alert-Rules aus Grafana entfernt: Hardware-Health hat seither genau eine Quelle statt zwei parallele, und der Alarmpfad läuft einheitlich über Keep. Die Dashboard-Queries nutzen seither das CheckMK-Schema (`host_name` / `service_description`) statt der Telegraf-SNMP-Tags.
:::

## Architektur

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  db: { shape: cylinder }
}

nas: Synology NAS {
  class: container
  tel: "Telegraf lokal\n(Docker-Container)" {
    class: node
    tooltip: "diskio, nas_background_jobs, nfs_server_threads, cpu/mem/system/net"
  }
  bench: "Storage-Benchmark\n(DSM-Aufgabenplaner)" { class: node }
}

cmk: "CheckMK\n(Site homelab)" { class: node }
influx: InfluxDB { class: db }
graf: Grafana { class: node }
keep: Keep { class: node }
tg: Telegram { class: node }

nas -> cmk: "SNMPv3\nUDP 161"
cmk -> influx: "Forwarder\n(Service-Metriken)"
nas.tel -> influx: "diskio / Jobs / NFS"
nas.bench -> influx: "fio / mdstat / iostat"
influx -> graf
cmk -> keep: Notification
keep -> tg: Severity-Topic
```

## Datenquellen

Drei Quellen liefern unterschiedliche Metriken:

### CheckMK (remote, SNMPv3)

Die CheckMK-Site `homelab` fragt beide NAS agentenlos via SNMPv3 ab und erzeugt daraus die Hardware-Services (RAID-Zustand, Disks inkl. Cache/M.2, Lüfter, Netzteil, Filesystem-Auslastung, CPU/RAM, Netzwerk-Durchsatz). Ein Forwarder schreibt die Service-Performance-Werte zusätzlich nach InfluxDB, wo das Dashboard sie liest -- siehe [InfluxDB & Telegraf](../influxdb.md). Welche Service-Klassen behalten und welche per `ignored_services` ausgeschlossen sind, steht in der [CheckMK Discovery-Policy](../checkmk/discovery.md).

### Telegraf lokal (Docker Container auf NAS)

Ein separater Telegraf-Container läuft direkt auf dem NAS und sammelt Metriken, die CheckMK nicht liefert: `diskio` (I/O Await aus `/proc/diskstats`), `nas_background_jobs` (RAID Rebuild, Scrub, S.M.A.R.T. Tests), `nfs_server_threads` sowie die Standard-Plugins `cpu`, `mem`, `system`, `net`.

::: warning Privilegierter Container
Der lokale Telegraf-Container läuft als `--privileged` mit `/proc:/host/proc:ro`, da er `/proc/diskstats` direkt lesen muss.
:::

::: warning Nach NAS-Reboot
Container Manager und NFS müssen nach einem NAS-Reboot manuell gestartet werden (über DSM UI).
:::

## Grafana Dashboard

Das Dashboard `synology-nas-health` gliedert sich in fünf Rows, aufgebaut nach dem Prinzip "Alarm, Kontext, Detail":

- **Systemzustand** -- Status-Bar mit acht Panels (RAID-Status, Volume belegt, Max Disk Temp, IO Wait, Hintergrund-Jobs, Memory, Uptime, CPU-Last)
- **Performance** und **System** -- Timeseries für Disk-Latenz (await), Durchsatz, CPU, RAM und Load
- **Disk Health & Kapazität** (eingeklappt) -- Disk-Temperaturen als Tabelle und Timeseries sowie Volume-Trend
- **Storage-Benchmark & Reshape** -- acht Panels aus dem NAS-autonomen Benchmark (siehe unten)

Die Dashboard-JSON wird via Git verwaltet und per NFS-Mount als File Provisioning bereitgestellt (read-only).

## Alerting

NAS-Hardware alarmiert ausschliesslich CheckMK: die Notification geht an Keep, Keep korreliert sie zu einem Incident und routet nach Severity ins passende Telegram-Topic (siehe [Keep](../keep/index.md)). In Grafana existieren seit dem Cutover keine Synology-Alert-Rules mehr -- das Dashboard ist reine Visualisierung.

Welche Services CheckMK auf dem NAS überwacht und mit welcher Schwelle (Filesystem `/volume*` bei 95%, CPU-Last mit für die nächtlichen Backup- und Scrub-Spitzen angehobenen Schwellen), steht in der [CheckMK Discovery-Policy](../checkmk/discovery.md).

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

Der Reshape-Fortschritt (`pct`) kommt ausschliesslich aus `/proc/mdstat` -- CheckMK kann ihn nicht liefern. Im Dashboard: Row "Storage-Benchmark & Reshape" (Reshape-%-Gauge + ETA/Sync-Speed, fio-Durchsatz/IOPS/Latenz, iostat-Durchsatz/util), alle nach NAS getrennt.

::: tip DSM-Web-API zum Anlegen des Tasks
`dsm-schedule.py` legt den Task über `SYNO.Core.TaskScheduler.Root` an (Root-Tasks brauchen ein `SynoConfirmPWToken`; list/delete laufen über die normale API v3). Details in der README im Repo.
:::

## Verwandte Seiten

- [NAS-Speicher](../../storage/nas/index.md) -- NFS-Exports, Garage S3, Hardware-Details
- [Monitoring Stack](../index.md) -- Grafana, Loki, Alloy, Alerting-Architektur
- [CheckMK](../checkmk/index.md) -- Hardware-Health via SNMPv3, Alarmquelle für das NAS
- [Hardware-Inventar](../../_referenz/hardware-inventar.md#nas) -- NAS-Hardware-Spezifikationen
