---
title: NAS-Speicher
description: Synology NAS als zentraler NFS- und S3-Speicher im Homelab
tags:
  - infrastructure
  - storage
  - nfs
  - garage
  - nas
---

# NAS-Speicher

Das NAS ist der zentrale Shared-Storage-Knoten im Cluster für NFS-Exports, S3 (Garage) und Backup-Ziele.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Bare-metal (Synology DSM) |
| NFS-Clients | Ansible-Rolle `roles/nfs` (fstab-Mounts auf den VMs) |
| IPs | [Hosts und IPs](../../_referenz/hosts-und-ips.md) |
| Hardware | [Server-Hardware](../../_referenz/hardware-inventar.md#nas) |

## Rolle im Stack

Alle persistenten Daten, die nicht auf lokalen SSDs oder DRBD-Volumes liegen müssen, werden hier gespeichert. Die Nomad-Clients mounten die NFS-Shares und stellen sie als Docker-Volumes bereit. Zusätzlich bietet das NAS über Garage einen S3-kompatiblen Object Store für Backups.

## Architektur

Die Exports kommen vom HomeServer (DS1825+, 10.0.0.200, `/volume1`); das alte Blech (DS2419+, 10.0.0.210, `/volume2`) serviert separat die Jellyfin-Mediathek von USB-Shares an die Media-Worker. Garage läuft als Single-Node-Container auf dem HomeServer und ist nur intern erreichbar -- kein Public-Routing über Traefik.

Die konkreten Export-Pfade und Mounts, die Garage-Endpunkte und -Buckets sowie die DSM-Konfiguration stehen in der [NAS-Storage: Referenz](./referenz.md). Troubleshooting, SSH-Hardening und Wartungsprozeduren in [NAS-Storage: Betrieb](./betrieb.md).

## Monitoring

Hardware-Health (CheckMK), Grafana-Dashboard und Alerting: [Synology NAS Monitoring](../../monitoring/synology-monitoring/index.md).

## Verwandte Seiten

- [NAS-Storage: Referenz](./referenz.md) -- NFS-Exports, Garage-Endpunkte/Buckets, DSM-Konfiguration
- [NAS-Storage: Betrieb](./betrieb.md) -- Troubleshooting, SSH-Hardening, Wartung
- [Server-Hardware](../../_referenz/hardware-inventar.md) -- NAS-Hardware-Details
- [Datenstrategie](../../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Replikation
- [Backup-Strategie](../backup/index.md) -- pg_dumpall auf NFS und PBS-VM-Backups
- [Datenbank-Architektur](../../_querschnitt/datenbank-architektur.md) -- PostgreSQL Backup-Ziele
- [Proxmox Cluster](../../infrastruktur/proxmox/index.md) -- Nomad-Client-VMs, die NFS mounten
- [Synology NAS Monitoring](../../monitoring/synology-monitoring/index.md) -- CheckMK-Hardware-Health, Grafana Dashboard, Alerting
