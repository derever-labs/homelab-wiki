---
title: CheckMK
description: Zentrale Monitoring- und Alerting-Plattform für Host- und Service-Überwachung
tags:
  - service
  - monitoring
  - infrastructure
---

# CheckMK

CheckMK ist die zentrale Host-Level-Monitoring-Lösung für das Homelab. Es überwacht Hardwaremetriken und Systemdienste auf allen Infrastruktur-Nodes und ergänzt damit Grafana/Loki (Metriken/Logs) und Gatus (Endpoint-Verfügbarkeit).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| Deployment | Eigenständige VM (ID: 2000) auf pve01 |
| Auth | CheckMK-eigene Benutzerverwaltung |
| Storage | Lokaler ZFS auf Proxmox Node |

## Was wird überwacht

CheckMK überwacht alle relevanten Infrastruktur-Hosts über den CheckMK Agent:

- **Proxmox Hosts:** pve00, pve01, pve02 -- Hypervisor-Gesundheit, ZFS-Pools, SMART-Werte
- **Nomad Server:** vm-nomad-server-04/05/06 -- Systemdienste, Ressourcenauslastung
- **Nomad Clients:** vm-nomad-client-04/05/06 -- CPU, RAM, Disk, Docker-Daemon
- **Infrastruktur-VMs:** lxc-dns-01, lxc-dns-02, vm-traefik-01, vm-traefik-02, PBS, CheckMK selbst
- **NAS (Synology DS):** Zwei SNMP-Hosts -- `synology-nas` (Homelab DS2419+ via LAN) und `nana-nas` (Dottikon DS1517+ via Tailscale). Disk-Status, Volume-Auslastung, RAID-Zustand, Lüfter/Temperaturen, Update-Status
- **Home Assistant:** Verfügbarkeit und Systemzustand
- **Nomad-Container:** Alle laufenden Allocs via Docker Piggyback-Mechanismus auf den Client-Nodes
- **Netzwerk:** Erreichbarkeit kritischer Endpunkte

Auf bereits registrierten Hosts erkennt CheckMK neue Services und Checks per Auto-Discovery automatisch.

::: info Nomad-Container via Docker Piggyback
Der Docker-Plugin auf den Nomad Client-Nodes übergibt Container-Checks als Piggyback-Daten an CheckMK. Jeder laufende Nomad-Alloc erscheint dadurch als eigener Host in CheckMK. Dies erklärt die hohe Host-Anzahl.
:::

## Agent-Deployment

Der CheckMK Agent läuft auf jedem überwachten Host und kommuniziert über TCP Port 6556 (siehe [Ports und Dienste](../_referenz/ports-und-dienste.md)). Der Agent wird als Paket (`check-mk-agent`) installiert und meldet bei Abfrage durch den CheckMK Server die aktuellen Systemmetriken.

Die Installation erfolgt über Ansible:
- **Standard-Agent:** `playbooks/checkmk-agent-deploy.yml`
- **Docker-Plugin:** `playbooks/checkmk-docker-plugin.yml` -- aktiviert Piggyback für Nomad-Container
- **Linstor Local Checks:** `playbooks/checkmk-linstor-checks.yml` -- deploys Linstor/DRBD-spezifische Local Checks auf die `drbd_storage`-Gruppe (vm-nomad-client-05/06)

### Linstor Local Checks

Die Ansible-Gruppe `drbd_storage` (definiert in `inventory/hosts.yml`) umfasst vm-nomad-client-05 und vm-nomad-client-06. Auf diesen Nodes laufen zwei Local Checks:

- `checkmk-linstor-check.sh` -- Linstor-Ressourcenstatus und DRBD-Verbindungen
- `checkmk-linstor-volumes.sh` -- Volume-Belegung und Thin-Pool-Auslastung

Die Skripte liegen unter `homelab-hashicorp-stack/ansible/files/` und werden nach `/usr/lib/check_mk_agent/local/` deployt.

### Synology als SNMP-Host

Beide Synology-NAS sind SNMP-only-Hosts (SNMPv3-Credentials siehe [Credentials](../_referenz/credentials.md)). CheckMK fragt die Synology Built-in-Plugins ab und liefert Hardware-Health (Disks/Cache/M.2, RAID, Fans, Power), Filesystem-Auslastung der `/volume*`-Hauptmounts, CPU- und RAM-Last sowie Network-Interface-Throughput. Disk-IO wird auf RAID-Aggregate-Ebene gemessen. SMART-Detail-Counter sind nicht via SNMP, dafür DSM Resource Monitor.

Generische SNMP-Sub-Devices sind via `ignored_services`-Rule aus der Discovery ausgeschlossen, damit das Free-Tier-Limit nicht durch Bloat erreicht wird -- die Discovery-Policy ist kanonisch in [CheckMK Discovery](../monitoring/checkmk-discovery.md) dokumentiert.

::: info Tailscale-Vorbedingung für Dottikon Nana
Der `nana-nas`-Host steht physisch am Standort Dottikon und ist nur via Tailscale erreichbar (Subnet-Route via `pve-01-nana`, siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)). Damit CheckMK darauf pollen kann, läuft auf der CheckMK-VM ein Tailscale-Client mit Tag `tag:homelab` und `--accept-routes`.
:::

## Alarmierung

CheckMK benachrichtigt über zwei Kanäle:

- **E-Mail:** Über den zentralen [SMTP Relay](../smtp-relay/index.md)
- **Gotify:** Push-Benachrichtigungen auf mobile Geräte

Die Benachrichtigungsregeln sind in CheckMK konfiguriert. Standardmässig werden Warnungen (WARN) und kritische Zustände (CRIT) sofort gemeldet. Für geplante Wartungsfenster können Downtimes gesetzt werden.

## Wartung

- **Update:** Erfolgt über das OMD-Paketmanagement (`omd update`) innerhalb der VM
- **Backup:** Die gesamte VM wird täglich vom [Proxmox Backup Server](../backup/referenz.md) gesichert

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Uptime Kuma und Alloy für Metriken und Logs
- [Gatus](../gatus/index.md) -- Öffentliche Status-Seite für Endpoint-Verfügbarkeit
- [SMTP Relay](../smtp-relay/index.md) -- Mail-Versand für CheckMK-Alerts
- [Proxmox Backup Server](../backup/referenz.md) -- VM-Backup von CheckMK