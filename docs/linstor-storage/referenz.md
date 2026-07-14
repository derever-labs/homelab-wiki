---
title: Linstor Referenz
description: Nachschlagewerte für Linstor/DRBD -- CSI-Attribute, Performance, Grafana-Panels und Metriken
tags:
  - linstor
  - drbd
  - referenz
  - csi
---

# Linstor Referenz

Konsolidierte Nachschlage-Tabellen für den Linstor/DRBD-Storage. Architektur und HA-Design stehen in [Linstor & DRBD](./index.md), Failover und Troubleshooting in [Linstor Betrieb](./betrieb.md).

## Nomad CSI Plugin

Das CSI-Plugin (`system/linstor-csi.nomad`) bindet Linstor-Volumes als persistenten Speicher in Nomad-Jobs ein.

| Attribut | Wert |
|-------------|------|
| Job-Typ | System (läuft auf allen Storage Nodes) |
| Plugin-ID | `linstor.csi.linbit.com` |
| Plugin-Typ | Monolith (Controller + Node in einem Container) |
| Image | Siehe Nomad-Job `system/linstor-csi.nomad` |
| Constraint | `vm-nomad-client-05`, `vm-nomad-client-06` |
| Endpoint | `http://linstor-controller.service.consul:3370` |

## CSI-Boot-Reeval Dateien

Dateien des `nomad-csi-reeval`-Timers, der die [CSI Boot Race Condition](./betrieb.md#csi-boot-race-condition) nach einem Node-Reboot auflöst.

| Datei | Beschreibung |
|-------|--------------|
| `/usr/local/bin/nomad-csi-reeval.sh` | Poll-basiertes Re-Evaluation Script |
| `/etc/systemd/system/nomad-csi-reeval.service` | Oneshot Service |
| `/etc/systemd/system/nomad-csi-reeval.timer` | Boot-Timer (60s nach Start) |
| `/etc/nomad.d/nomad-csi-reeval.env` | Nomad Token (0600) |

## Performance-Kennwerte

Erwartete Kennwerte der DRBD-Replikation über das Thunderbolt-Netzwerk (10.99.1.0/24):

| Metrik | Erwarteter Wert |
|--------|-----------------|
| Latenz | < 0.1 ms |
| Throughput | > 1 GB/s |
| IOPS | > 100k (SSD) |

### PostgreSQL Benchmark (DRBD vs lokale SSD)

Benchmark durchgeführt am 2025-12-29 mit pgbench (Scale 10, 10 Clients, 2 Threads, 60 Sekunden).

| Metrik | DRBD (Netzwerk) | Lokal (SSD) | Differenz |
|--------|-----------------|-------------|-----------|
| TPS | 2,561 | 4,411 | +72% |
| Latenz | 3.91 ms | 2.27 ms | -42% |
| Transaktionen (60s) | 153,379 | 264,633 | +73% |
| Verbindungszeit | 117 ms | 10 ms | -91% |

Der DRBD-Performance-Overhead ist für den Anwendungsfall akzeptabel. Die Vorteile (automatisches Failover, keine manuelle Replikation) überwiegen die leicht höheren Latenzen. Die meisten Services benötigen < 100 TPS.

## Grafana-Panels

Dashboard: `https://graf.ackermannprivat.ch/d/linstor-storage/linstor-storage`

| Panel | Beschreibung |
|-------|--------------|
| Storage Pool Auslastung | Gauge mit Gesamtauslastung (Schwellwerte: 70% gelb, 90% rot) |
| Storage Pool Total/Frei | Absolute Werte in GB |
| Volumes | Anzahl der Resource Definitions |
| Volume Auslastung | Prozentuale Auslastung pro Volume |
| Volume Allocation | Tatsächlich belegter Speicher pro Volume |
| Node Status | Online/Offline Status aller Nodes |
| Resource Status | Sync-Status aller Ressourcen |

## Linstor-Metriken

| Metrik | Beschreibung |
|--------|--------------|
| `linstor_storage_pool_capacity_total_bytes` | Gesamtkapazität des Storage Pools |
| `linstor_storage_pool_capacity_free_bytes` | Freier Speicher im Pool |
| `linstor_volume_allocated_size_bytes` | Tatsächlich belegter Speicher pro Volume |
| `linstor_volume_definition_size_bytes` | Provisionierte Grösse pro Volume |
| `linstor_node_state` | Node Status (0=Offline, 1=Connected, 2=Online) |
| `linstor_resource_state` | Resource Status (0=UpToDate, 1=Syncing) |
| `linstor_resource_definition_count` | Anzahl der definierten Volumes |

## Verwandte Seiten

- [Linstor & DRBD](./index.md) -- Architektur, HA-Design, CSI-Integration
- [Linstor Betrieb](./betrieb.md) -- Failover, Troubleshooting, Monitoring
- [Split-Brain Recovery](./split-brain-runbook.md) -- Notfall-Runbook (destruktiv)
