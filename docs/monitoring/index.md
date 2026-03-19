---
title: Monitoring-Übersicht
description: Übersicht der Überwachungswerkzeuge (Grafana, Uptime Kuma)
tags:
  - service
  - monitoring
  - nomad
---

# Monitoring Stack

## Übersicht
Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Grafana** | Dashboards & Metriken | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) |
| **Loki** | Zentrales Log-Storage | [loki.ackermannprivat.ch](https://loki.ackermannprivat.ch) |
| **Grafana Alloy** | Log-Collector (System-Job + systemd + Docker) | — (läuft auf 15 Nodes) |
| **Uptime Kuma** | Verfügbarkeits-Checks | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |

## Grafana
### Datenquellen
- **InfluxDB:** Speichert Metriken von Nomad, Consul und Proxmox.
- **Loki:** Zentrales Log-Storage für alle Infrastruktur-Logs (via Grafana Alloy gesammelt).
- **CheckMK:** Integriert über das CheckMK-Plugin für Infrastruktur-Status.

### Authentifizierung
Erfolgt via OAuth2 (Keycloak). Nur Benutzer der Gruppe `admin` haben Zugriff.

### Deployment
Grafana läuft mit persistentem Storage (Linstor CSI Volume `grafana-data`, 1 GiB) für Unified Alerting State:
- **Dashboards:** JSON Dateien unter `/nfs/docker/grafana/dashboards/` (aus Git).
- **Datasources:** Via Nomad Template aus Vault Secrets (`kv/grafana`, `kv/influxdb`, `kv/jellystat`) provisioniert.
- **Alerting:** Unified Alerting aktiv, Alert Rules via File Provisioning (siehe unten).
- **Constraint:** Nur auf client-05/06 (Linstor CSI Volume verfügbar).

### Alerting (Unified Alerting)
Grafana Unified Alerting ist die zentrale Stelle für alle metrikbasierten Alerts.

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

**Hinweis:** Die Alert-Annotations verwenden Grafana Template-Variablen (`$labels`, `$values`), die für Nomads Template-Engine escaped werden müssen (doppelte geschweifte Klammern in HCL-Templates).

## Uptime Kuma
Überwacht alle externen und internen Endpunkte via HTTP/TCP-Checks.
- **Benachrichtigungen:** Bei Ausfall erfolgt eine Meldung via Telegram (konfiguriert in Vault).
- **Datenbank:** `kuma.db` (Repliziert via Litestream auf NAS).

## Backup-Monitoring

### Linstor Backup Monitor
Ein separates Script (`/usr/local/bin/linstor-backup-monitor.sh`) prüft um 06:00 Uhr den Status der S3-Backups und meldet via Uptime Kuma Push.

### PostgreSQL Backup
Der Nomad Batch-Job `postgres-backup` führt täglich ein `pg_dumpall` durch und sichert auf NFS (`/nfs/backup/postgres/`). Status wird via Uptime Kuma Push gemeldet.

## Zentrales Logging (Loki + Alloy)

### Architektur
```
Nomad Container (3 Nodes)   → Alloy System-Job (Nomad)  ──┐
HashiCorp Server VMs (3x)   → Alloy systemd-Service     ──┤
HashiCorp Client VMs (3x)   → Alloy systemd-Service     ──┤
vm-proxy-dns-01              → Alloy Docker-Container    ──┼──→ Loki → Grafana
Proxmox Hosts (3x)           → Alloy systemd-Service     ──┤
Infra VMs (CheckMK, etc.)   → Alloy systemd-Service     ──┤
NAS / Router                 → Syslog → Alloy Receiver   ──┘
```

### Loki (Log-Storage)
- **Nomad Job:** `monitoring/loki.nomad` (Service-Job, Priority 100)
- **Storage:** Linstor CSI Volume `loki-data` (20 GiB, repliziert)
- **Port:** 3100 (statisch)
- **Retention:** 30 Tage (720h)
- **Zugang:** `loki.ackermannprivat.ch` (intern, `intern-admin-chain-v2@file`)
- **Consul DNS:** `loki.service.consul`

### Grafana Alloy (Log-Collector)

Alloy sammelt Logs aus allen Infrastruktur-Komponenten und leitet sie an Loki weiter. Je nach Deployment-Art gibt es drei Varianten:

#### Variante 1: Nomad System-Job (Container-Logs)
- **Nomad Job:** `system/alloy.nomad` (System-Job, läuft auf jedem Client-Node)
- **Docker-Socket:** `/var/run/docker.sock` (read-only) für Container-Discovery
- **Labels:** Extrahiert `nomad_task` aus Container-Name, `nomad_alloc_id` aus Docker-Labels
- **External Label:** `node` (Hostname des Client-Nodes)
- **Syslog-Receiver:** Port 1514 (TCP+UDP, statisch) für externe Quellen (NAS, Router)

#### Variante 2: Ansible-Rolle `alloy` (systemd-Service)
- **Rolle:** `ansible/roles/alloy/`
- **Config-Template:** `config.alloy.j2` (River-Syntax)
- **Quellen:** systemd-Journal + optionale Datei-Targets
- **Loki-Endpoint:** `loki.service.consul:3100` (via Consul DNS)

| Playbook | Hosts | Source-Label | Besonderheiten |
| :--- | :--- | :--- | :--- |
| `deploy-alloy.yml` | Server- & Client-Nodes | `journal` / `nomad-client` | Client-Nodes: Linstor-Logs als File-Target |
| `deploy-alloy-proxmox.yml` | pve00, pve01, pve02 | `proxmox` | `www-data`-Gruppe für pveproxy-Logs |
| `deploy-alloy-infra.yml` | CheckMK, PBS, PDM, VPN-DNS, Zigbee | je nach Host | CheckMK: Core/Web/Notify-Logs |

#### Variante 3: Docker-Container (vm-proxy-dns-01)
- **Config:** `standalone-stacks/traefik-proxy/templates/alloy-config.alloy.j2`
- **Quelle:** Docker-Socket Discovery (Traefik, Keycloak, etc.)
- **DNS:** Container nutzt `10.0.2.1` / `10.0.2.2` für Consul-Auflösung

### Übersicht aller Log-Quellen

| Host / Gruppe | Methode | Source-Label |
| :--- | :--- | :--- |
| vm-nomad-client-04/05/06 | Nomad System-Job | `docker` |
| vm-nomad-server-04/05/06 | Ansible (systemd) | `journal` |
| vm-nomad-client-04/05/06 | Ansible (systemd) | `nomad-client` |
| vm-proxy-dns-01 | Docker-Container | `docker-compose` |
| pve00, pve01, pve02 | Ansible (systemd) | `proxmox` |
| CheckMK (10.0.2.150) | Ansible (systemd) | `checkmk` |
| PBS (10.0.2.50) | Ansible (systemd) | `pbs` |
| Datacenter Manager (10.0.2.60) | Ansible (systemd) | `datacenter-manager` |
| vm-vpn-dns-01 (10.0.2.2) | Ansible (systemd) | `vpn-dns` |
| Zigbee-Node (10.0.0.110) | Ansible (systemd) | `iot` |
| Synology NAS | Syslog → Alloy Receiver | `syslog` |
| UniFi | Syslog → Alloy Receiver | `syslog` |

**Hinweis:** Synology und UniFi Syslog-Integration sind noch in Arbeit (siehe GitHub Issues #5 und #6).

### Log-Abfrage in Grafana
- Datasource: **Loki** (uid: `loki-logs`)
- Beispiel-Queries:
  - `{nomad_task="grafana"}` — Alle Grafana-Logs
  - `{node="vm-nomad-client-05"}` — Alle Logs von client-05
  - `{nomad_task="prowlarr"} |= "error"` — Prowlarr-Fehler
  - `{source="proxmox"}` — Alle Proxmox-Host-Logs
  - `{source="checkmk"}` — CheckMK-Logs
  - `{source="syslog"}` — Syslog-Quellen (NAS, Router)
  - `{job="journal"} |= "error"` — Journal-Fehler aller Infra-VMs

## Wartung
### Grafana Dashboards
Dashboards werden teilweise als JSON in `infra/nomad-jobs/monitoring/grafana-dashboards/` verwaltet oder direkt in der UI erstellt.

## Verwandte Seiten

- [CheckMK Monitoring](../checkmk/index.md) -- Host-Level Monitoring (CPU, RAM, Disk)
- [Gatus](../gatus/index.md) -- Öffentliche Status-Seite für Endpoint-Verfügbarkeit
- [Backup-Strategie](../backup/index.md) -- Backup-Monitoring via Uptime Kuma Push
- [Linstor/DRBD](../linstor-storage/index.md) -- CSI Volumes für Grafana und Loki
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- iperf3-to-influxdb und weitere periodische Monitoring-Jobs
