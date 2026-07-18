---
title: Monitoring Referenz
description: Referenz-Tabellen des Monitoring Stacks -- Alert-Regeln, Log-Quellen und Log-Levels
tags:
  - service
  - monitoring
  - referenz
---

# Monitoring Referenz

Diese Seite bündelt die Referenz-Tabellen des Monitoring Stacks: die metrik- und log-basierten Alert-Regeln, die Zuordnung der Log-Quellen und die Log-Levels je Komponente. Architektur und Alert-Routing stehen im [Monitoring Stack](./index.md), Betriebs-Prozeduren im [Monitoring Betrieb](./betrieb.md).

## Alert-Regeln

Grafana Unified Alerting wertet die folgenden metrik- und log-basierten Alert-Rules aus. Architektur und Routing der Alerts beschreibt der [Monitoring Stack](./index.md#alerting-unified-alerting).

### Metrik-basierte Alert Rules (InfluxDB)

| Rule | Bedingung | For | Severity |
| :--- | :--- | :--- | :--- |
| LVM Thin Pool > 75% | `data_percent > 75` | 5min | Warning |
| LVM Thin Pool > 85% | `data_percent > 85` | 2min | Critical |
| LVM Metadata > 75% | `metadata_percent > 75` | 5min | Warning |
| DRBD Verbindung getrennt | `drbd_connection_state` nicht mehr `Connected` | 10min | Critical |
| DRBD Replica Disk degradiert | `drbd_device_state` = `Failed` oder `Outdated` | 10min | Critical |
| DRBD Node unbeabsichtigt Diskless | Replica ungewollt `Diskless` | 10min | Critical |
| DRBD Degraded Replica | weniger als 2 Replicas `UpToDate` je Ressource | 5min | Critical |
| DRBD Split-Brain | mehr als eine Replica `Primary` je Ressource | sofort | Critical |
| CSI Stale Mounts | `csi_mounts.stale_count > 0` | 10min | Warning |
| CSI-Plugin-Socket weg | `csi_plugin.socket_alive == 0` | 5min | Critical |
| Nomad Restart-Storm | `non_negative_difference(nomad_alloc_restarts.count) > 5` in 10min (per Alloc) | 2min | Warning |
| Nomad Reschedule-Storm | `nomad_job_health.failed_10m > 5` (per Job, Host) | 5min | Critical |

Die metrik-basierten Regeln laufen auf der InfluxQL-Datasource. Drei Alerts bleiben bewusst auf der parallel bestehenden Flux-Datasource: `nomad-memory-warn`, `nomad-memory-crit` und `synology-volume-warn`. Ihre arithmetische Verknüpfung zwischen verschiedenen `last()`-Aggregaten scheitert in InfluxQL, sobald die Felder unterschiedliche Tag-Strukturen haben, und eine Umstellung würde zu viel Grafana-Transformations-Komplexität in die Alerting-YAML einführen (HART-Budget).

Die DRBD-Überwachung ist seit 2026-07-05 zustandsbasiert: Alarmiert wird auf die One-Hot-kodierten Zustände von Verbindung, Disk und Rolle (`drbd_connection_state`, `drbd_device_state`, `drbd_resource_role`), nicht mehr auf Out-of-Sync-Bytes. Der frühere byteweise Out-of-Sync-Alarm wurde entfernt: Der periodische `drbd-verify` erzeugt auf aktiven Thin-LVM-Volumes systembedingt Out-of-Sync-Spikes, obwohl die Replica `UpToDate` ist -- jede Byte-Schwelle löste dabei falsch aus. Echte Degradierung deckt die zustandsbasierte Regel `DRBD Degraded Replica` ab.

### Log-basierte Alert Rules (Loki)

| Rule | Bedingung | For | Severity |
| :--- | :--- | :--- | :--- |
| Failed SSH Logins | `>5 "Failed password" in 5min` | sofort | Warning |
| Traefik 5xx Spike | `>20 HTTP-5xx in 5min` | sofort | Warning |
| Nomad Alloc Failed | `"alloc failed" in 10min` | sofort | Critical |
| Vault Permission Denied | `>10 "permission denied" in 5min` | sofort | Warning |
| EXT4 Filesystem Error | `"EXT4-fs error" im Journal` | sofort | Critical |
| Proxmox QMP Call Failed | `"qmp_call failed" bzw. "qmp command ... failed"` (Gast- und Host-Log) | sofort | Critical |
| Out of Memory Killer | `"Out of memory: Kill" im Journal` | sofort | Critical |

**Hinweis:** Die Alert-Annotations verwenden Grafana Template-Variablen (`$labels`, `$values`), die für Nomads Template-Engine escaped werden müssen (doppelte geschweifte Klammern in HCL-Templates).

## Log-Quellen

Diese Tabelle ist die SSOT für die Zuordnung Host -> Methode -> Source-Label. Deployment-Details, Playbook-Tabelle und Label-Schema stehen in [Grafana Alloy](./alloy.md).

| Host / Gruppe | Methode | Source-Label |
| :--- | :--- | :--- |
| vm-nomad-client-04/05/06 | Nomad System-Job | -- (Container via `nomad_task`) |
| vm-nomad-server-04/05/06 | Ansible (systemd) | `journal` |
| vm-nomad-client-04/05/06 | Ansible (systemd) | `nomad-client` |
| vm-traefik-01/02 | Standalone-Config (traefik-ha) | `docker-compose` |
| pve00, pve01, pve02 | Ansible (systemd) | `proxmox` |
| CheckMK | Ansible (systemd) | `checkmk` |
| PBS | Ansible (systemd) | `pbs` |
| Datacenter Manager | Ansible (systemd) | `datacenter-manager` |
| lxc-dns-01/02 | Ansible (systemd) | `dns` |
| Zigbee-Node | Ansible (systemd) | `iot` |
| Vault Audit-Log (Server VMs) | Ansible (systemd) | `vault-audit` |
| Synology NAS | Syslog → Alloy Receiver | `syslog` |
| UniFi | Syslog → Alloy Receiver | `syslog` |

## Log-Levels

| Komponente | Log-Level | Konfigurationsort |
| :--- | :--- | :--- |
| Loki | `warn` | `monitoring/loki.nomad` |
| Grafana | `info` | `monitoring/grafana.nomad` |
| Nomad | `INFO` | `ansible/roles/nomad/defaults/main.yml` |
| Consul | `WARN` | `ansible/roles/consul/defaults/main.yml` |
| Vault | `INFO` | `ansible/roles/vault/defaults/main.yml` |
| Authentik | `info` | `identity/authentik.nomad` |
| Traefik (Core) | `WARN` | `traefik.yml.j2` |
| Traefik (Access) | aktiv (JSON, stdout) | Filter: `statusCodes: 400-599` + `minDuration: 2s` + `retryAttempts`; Rotation via Docker-Log-Driver |

LogQL-Beispiele für die Loki-Datasource (uid: `loki-logs`) sind in [Grafana Alloy](./alloy.md#logql-beispiele) gepflegt.

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Übersicht, Architektur und Alert-Routing
- [Monitoring Betrieb](./betrieb.md) -- Grafana-Admin, Silencing, Backup-Monitoring, Wartung
- [Grafana Alloy](./alloy.md) -- Log-Collector, Deployment-Methoden und LogQL-Beispiele
