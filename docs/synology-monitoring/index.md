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
- **Zone C -- Detail:** Disk Health und Kapazität (SMART Health Table, Disk-Utilization, Disk-Temperatur, SSD Cache I/O, Volume Trend) sowie eine collapsed RAID-Benchmark-Row

Die Dashboard-JSON wird via Git verwaltet und per NFS-Mount als File Provisioning bereitgestellt (read-only).

## Alerting

4 Synology Alert Rules in Grafana Unified Alerting, alle via Telegram:

| Rule | Bedingung | For | Schwere |
| :--- | :--- | :--- | :--- |
| RAID Degraded/Crashed | raidStatus != Normal | 2 min | Critical |
| Volume belegt | > 98% | 5 min | Warning |
| Disk Temperatur | > 55 C | 5 min | Warning |
| SMART Reallocated Sectors | > 0 | 5 min | Warning |

## RAID Benchmark

Ein optionales fio-Script auf dem NAS misst die RAID-Performance (Sequential Read und Random 4K Read) und schreibt die Ergebnisse direkt an InfluxDB. Die Ergebnisse erscheinen in zwei dedizierten Dashboard-Panels.

## Verwandte Seiten

- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports, Garage S3, Hardware-Details
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Alloy, Alerting-Architektur
- [CheckMK](../checkmk/index.md) -- Host-Level Monitoring (Agent-basiert)
- [Hardware-Inventar](../_referenz/hardware-inventar.md#nas) -- NAS-Hardware-Spezifikationen
