---
title: "Monitoring: Coverage"
description: Welcher Host und Service wird wie überwacht und was bewusst ausgelassen
tags:
  - monitoring
  - coverage
  - checkmk
  - telegraf
  - loki
---

# Monitoring: Coverage

Diese Seite listet pro Layer welche Komponente über welchen Pfad überwacht wird, was bewusst nicht überwacht ist und welche Coverage-Lücken in offenen ClickUp-Tasks erfasst sind. Architektur-Hintergrund in [Monitoring Stack](index.md), CheckMK-Detail in [CheckMK](../checkmk/index.md).

::: info Single Source of Truth
Diese Seite ist die **Ist-Stand-Übersicht**. Offene Coverage-Lücken werden im ClickUp-Bundle [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) gepflegt -- Wiki-Änderungen erfolgen erst nach Implementierung.
:::

## Pfade

- **CheckMK** -- Host-/Service-Status, Hardware, SNMP, Special-Agents. Webhook nach Keep
- **Telegraf** -- App-/Prom-Metriken nach InfluxDB, Grafana-Dashboards
- **Loki + Alloy** -- Container- und System-Logs, Pattern-Alerts
- **Uptime Kuma (UK)** -- HTTP/Port/Push-Probes, Backup-Heartbeats
- **Direct-Cron** -- spezialisierte Probes mit Webhook-Push direkt nach Keep

## Hypervisor (Proxmox)

- **pve00** (10.0.2.40, Quorum) -- CheckMK Standard-Agent. ZFS-Pool-State und NVMe-SMART als Coverage-Lücke (`86c9knpm4`)
- **pve01** (10.0.2.41, Main Compute) -- CheckMK Standard-Agent. ZFS und NVMe-SMART analog. hwmon Temp/Fan via lm_sensors offen
- **pve02** (10.0.2.42, Main Compute) -- analog pve01. Power-Loss-Counter (`unsafe_shutdowns` aus mk_smartmon) als Hinweis auf Single-PSU-Limitation geplant

## Externer Watchdog

- **pve-01-nana** (100.81.116.122 Tailscale, Dottikon) -- als CheckMK-Host angelegt (cmk-agent Tag, gepollt via Tailscale-IP). Agent-Install via Ansible-Playbook `06-checkmk-agent.yml` ausstehend. ZFS-rpool + NVMe-SMART folgen mit Agent (`86c9knpm4`). Externe Watchdog-Rolle für Homelab, kein Cluster-Mitglied

## Storage

- **synology-nas** (Homelab DS2419+) -- CheckMK SNMP via Synology Built-in Plugins (Disks/RAID/PSU/Fan/Temp/Volumes/CPU/RAM/IF). Live seit 2026-05-01
- **nana-nas** (Dottikon DS1517+, via Tailscale) -- analog synology-nas. Live seit 2026-05-01. CheckMK-VM hat dafür einen Tailscale-Client mit `tag:homelab` und `--accept-routes`
- **pbs-backup-server** (10.0.2.50, Proxmox Backup Server) -- als CheckMK-Host angelegt (cmk-agent Tag). Agent-Install ausstehend. df-Plugin für Datastores + Loki-Pattern für PBS-Sync/Verify-Fehler folgen mit Agent (`86c9knpm4`)
- **Linstor/DRBD** (auf vm-nomad-client-05/06) -- CheckMK-Agent + Linstor-Local-Checks via Ansible-Playbook `checkmk-linstor-checks.yml`. Stale-Mount-Detection via Telegraf-File-Input
- **MinIO NAS** (10.0.0.200:9000, S3 auf Synology) -- HTTP-Probe via UK; Bucket-Coverage über Telegraf prom-Scrape

## Network

- **udm-pro** (10.0.0.1, Gateway + Unifi Controller) -- als ICMP-only-Host in CheckMK (Reachability live). Welle-3-Subtask `86c9kmc3u`: SNMP-Aktivierung in Unifi-Controller + Standard-Plugins + Syslog-Forward nach Alloy
- **Switches Unifi** (10.0.0.172, .181, .184-.186) -- Coverage-Lücke. SNMP-Standard-Plugins geplant (`86c9knpm4`); UniFi-Controller liefert ergänzend SDK-Daten
- **Access Points** (10.0.0.191-.197) -- Coverage über Unifi-Controller; eigenständige CheckMK-Hosts nicht vorgesehen
- **lxc-dns-01** (10.0.2.1, Pi-hole+Unbound Primary) -- als CheckMK-Host angelegt (cmk-agent Tag). Agent-Install ausstehend. `pihole-FTL.service` als systemd-Service folgt mit Agent (`86c9knpm4`)
- **lxc-dns-02** (10.0.2.2, Pi-hole+Unbound Secondary) -- analog lxc-dns-01
- **vm-traefik-01** (10.0.2.21, MASTER + CrowdSec) -- als CheckMK-Host angelegt (cmk-agent Tag). Agent-Install ausstehend. Traefik prom-Endpoint via Telegraf folgt (`86c9knpm4`)
- **vm-traefik-02** (10.0.2.22, BACKUP + CrowdSec) -- analog vm-traefik-01
- **traefik-vip** (10.0.2.20, keepalived) -- als ICMP-only in CheckMK (Reachability live); VRRP-State-Probe geplant
- **USV** -- USV-Plan offen (siehe Memory `project_ups_psu_2026`); Coverage erst nach Beschaffung

## Auth & Identity

- **Authentik** (Nomad-Service) -- Telegraf prom-Scrape, App-Metriken in InfluxDB. Cookie-Domain-Drift via Direct-Cron-Probe
- **OpenLDAP** (Nomad-Service) -- BIND-Test via Direct-Cron geplant (`86c9kmc50`)

## Cluster-Stack (Nomad/Consul/Vault)

- **vm-nomad-server-04/05/06** (10.0.2.104/.105/.106) -- CheckMK Standard-Agent. Nomad/Consul prom-Metriken via Telegraf
- **vm-nomad-client-04/05/06** -- CheckMK Standard-Agent + Docker-Piggyback für Container. Nomad-Restart- und Reschedule-Storm-Detection via Telegraf-File-Input. Linstor-CSI-Health auf c05/c06
- **Vault Self-Probe** -- Sealed-Probe via UK-Push, Audit-Cron geplant (`86c9kmbve`-Äquivalent Privat)

## Monitoring-Self

- **checkmk** (10.0.2.150) -- CheckMK Standard-Agent (Self-Monitoring). Externer UK-Probe als Site-Down-Detection via pve-01-nana geplant
- **Ops-Stack-Komponenten** (Grafana, Loki, InfluxDB, Telegraf, Alloy, Keep, UK) -- Telegraf prom-Scrape der eigenen Endpoints, Self-Heartbeat via Push

## Sonstige Linux-Services

- **datacenter-manager** (10.0.2.60, PDM Cross-Cluster) -- als CheckMK-Host angelegt (cmk-agent Tag). Agent-Install ausstehend. UK HTTP-Probe separat (`86c9knpm4`)
- **reddit-downloader** (10.0.2.72) -- low prio. Geplant als CheckMK Standard-Agent (`86c9knpm4`)

## Apps und Container (Telegraf-Pfad statt CheckMK)

Container-Workloads laufen als Nomad-Jobs auf vm-nomad-client-04/05/06 und werden nicht als eigene CheckMK-Hosts geführt. Container-Health-Coverage über Docker-Piggyback auf den Client-Hosts und Loki-Logs via Alloy.

- **homeassistant** (10.0.0.100) -- CheckMK Standard-Agent für VM-Status + Telegraf prom-Scrape von HA-Prometheus-Integration für Detail-Metriken (geplant)
- **Jellyfin, Sonarr, Radarr, Sabnzbd** -- App-Metriken via Telegraf-Plugin oder externe Exporter (`exportarr`, `jellyfin_exporter`). Container-Health über Docker-Piggyback. Kein eigenständiger CheckMK-Host
- **immo-monitor** (Nomad-Job) -- Direkter PostgreSQL-Datasource in Grafana, Loki-Pattern via Alloy für Scrapfly-Errors
- **Gitea**, **CrowdSec**, **OpenLDAP**, **MinIO** -- Telegraf prom-Scrape oder Loki-Pattern; Container-Coverage über Piggyback

## Bewusst nicht überwacht (Apps und IoT)

- **Endgeräte im Device-VLAN** (10.0.10.0/24) -- bewusst nicht überwacht (Mobile/Desktops, kein 24/7-Charakter)
- **Gäste-VLAN** (10.0.30.0/24) -- bewusst nicht überwacht
- **Access Points einzeln** -- via Unifi-Controller abgedeckt, kein eigener CheckMK-Host pro AP

::: info Begründung
Container-Apps werden über Docker-Piggyback und Telegraf prom-Scrape erfasst statt als eigene CheckMK-Hosts.
:::

## Offene Drift-Punkte

- **94 Container-Discovery-Einträge** -- Drift in `all_hosts`, sollten in eigenen Folder `homelab/containers/` strukturiert oder aus Discovery genommen werden (`86c9knpm4`)

## Verwandte Doku

- [Monitoring Stack](index.md) -- Komponenten-Übersicht
- [CheckMK](../checkmk/index.md) -- Host-Monitoring-Details
- [InfluxDB & Telegraf](influxdb.md) -- Metriken-Pfad
- [Alloy](alloy.md) -- Log-Forwarding
- [Keep](keep.md) -- Alert-Hub
- ClickUp-Bundle `86c9knpm4` -- offene CheckMK-Coverage-Items Homelab
- ClickUp-Master `86c9jqw24` -- Welle-3-Tasks Homelab
