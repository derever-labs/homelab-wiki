---
title: CheckMK
description: Zentrale Monitoring- und Alerting-Plattform für Host- und Service-Überwachung
tags:
  - service
  - monitoring
  - infrastructure
---

# CheckMK

CheckMK ist die zentrale Host-Level-Monitoring-Lösung für das Homelab. Es überwacht Hardwaremetriken und Systemdienste auf allen Infrastruktur-Nodes und ergänzt damit Grafana/Loki (Metriken/Logs) und Uptime Kuma (Endpoint-Verfügbarkeit).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| Deployment | Eigenständige VM (ID: 2000) auf pve02 |
| Auth | CheckMK-eigene Benutzerverwaltung |
| Storage | Lokaler ZFS auf Proxmox Node |

## Was wird überwacht

CheckMK überwacht alle relevanten Infrastruktur-Hosts über den CheckMK Agent:

- **Proxmox Hosts:** pve00, pve01, pve02 -- Hypervisor-Gesundheit, ZFS-Pools, SMART-Werte
- **Nomad Server:** vm-nomad-server-04/05/06 -- Systemdienste, Ressourcenauslastung
- **Nomad Clients:** vm-nomad-client-04/05/06 -- CPU, RAM, Disk, Docker-Daemon
- **Infrastruktur-VMs:** lxc-dns-01, lxc-dns-02, vm-traefik-01, vm-traefik-02, PBS, CheckMK selbst
- **NAS (Synology DS):** Zwei SNMP-Hosts -- `synology-nas` (Homelab DS1825+ via LAN) und `nana-nas` (Dottikon DS1517+ via Tailscale). Disk-Status, Volume-Auslastung, RAID-Zustand, Lüfter/Temperaturen, Update-Status
- **Home Assistant:** Kein CheckMK-Agent (HAOS ist immutable, kein Agent installierbar). Metriken via Telegraf/Alloy + Proxmox-Special-Agent von pve02.
- **Nomad-Container:** Alle laufenden Allocs via Docker Piggyback-Mechanismus auf den Client-Nodes
- **Netzwerk:** Erreichbarkeit kritischer Endpunkte

Auf bereits registrierten Hosts erkennt CheckMK neue Services und Checks per Auto-Discovery automatisch.

::: info Nomad-Container via Docker Piggyback
Der Docker-Plugin auf den Nomad Client-Nodes übergibt Container-Checks als Piggyback-Daten an CheckMK. Jeder laufende Nomad-Alloc erscheint dadurch als eigener Host in CheckMK. Dies erklärt die hohe Host-Anzahl.
:::

## Cluster-Inventar

Kondensierte Bestandsaufnahme beider CheckMK-Sites -- ausgelagert aus [Monitoring: Strategie](../monitoring/strategie.md), damit die Strategie-Seite auf die Pfad-Zuordnung fokussiert bleibt.

### CheckMK DCLab Inventar

- Site: `monitoring` (CCE), vm-checkmk = 10.180.46.95
- Plugin-Katalog: ~2106 mitgelieferte Checks; Standard-Plugins für Linux/Windows-Agent, SNMP, Special-Agents
- **Aktive Hosts** (organisiert in WATO-Folders):
  - `dc-hslu/`: pve01 (renamed von `pve-00`), pve02, vm-checkmk, vm-pbs-00 (renamed von `pbs00`), vm-nomad-client-01/02/03, vm-nomad-server-01/02/03
  - `dc-hslu/idrac/`: idrac-pve01 (10.180.46.241), idrac-pve02 (10.180.46.242) -- Redfish live, 58 Services pro Host
  - `dc-hslu/storage/`: nas-01 (10.180.46.200), nas-02 (10.180.46.210), iar-nas-01 (10.180.50.200), iar-nas-02 (10.180.50.210) -- Synology SNMP live
  - `dc-hslu/network/`: opnsense-primary (10.180.46.14), opnsense-secondary (10.180.46.15), opnsense-vip-wan (10.180.46.16), opnsense-vip-dns (10.180.46.33), switchlab01 (10.180.46.142), routerlab (10.180.46.140) -- alle ICMP-only Reachability live
  - `dc-hslu/auth/`: vm-ad-ldap (10.180.46.235) -- ICMP-only (Windows-Agent + ad_replication noch ohne Agent-Daten)
  - `dc-hslu/services/`: ubuntu-fog-new (10.180.46.223), vm-docker-host (10.180.46.31) -- als `cmk-agent` angelegt
- **Aktive Special-Agents**: `proxmox_ve` für pve01 + pve02, `redfish` für iDRAC-Pair, `synology_health` (built-in via SNMP) für alle vier Synologys
- **Aktive Standard-Agents**: `cmk_update_agent`, `mk_apt`, `mk_docker`, `mk_logins` über Linux-Hosts
- **InfluxDB-Forwarder**: aktiv, Ziel `http://10.180.46.223:8086` Bucket `CheckMK` Org `HSLU-DC` über Connection `InfluxDB_connection_Juri` -- zielt auf Influx ausserhalb des Ops-Stacks (10.180.46.83), nicht im Single-Routing-Hub
- **Notification-Konfig**: Mail-Default-Rule mit `{}`-Config (System-MTA), aber `vm-checkmk` hat keinen postfix installiert -- alle CheckMK-Notifications DCLab fallen ins Leere
- **Mail-Empfänger**: contact `cmkadmin` ohne Mail-Adresse + Test-`automation` (notifications_enabled=False)
- **Severity-Modell**: CheckMK Naemon-Kern (OK / WARN / CRIT / UNKNOWN), Mapping nach Keep braucht Webhook-Translator
- **HA**: Single-Instance (vm-checkmk). Bei Site-Down: kein Failover, alle Hardware-/SNMP-Targets silent
- **Disk**: knappes 33-GB-Volume auf vm-checkmk, wächst mit der RRD-Datenmenge

### CheckMK Homelab Inventar

- Site: `homelab` (CCE), checkmk = 10.0.2.150
- Plugin-Katalog: ~2106 Checks identisch zu DCLab
- **Aktive Hosts** (flache `all_hosts`-Liste):
  - 6 Nomad-VMs: vm-nomad-server-04/05/06, vm-nomad-client-04/05/06
  - 3 PVE-Hosts: pve00, pve01, pve02
  - pve-01-nana (Tailscale 100.81.116.122) -- externer Watchdog Dottikon, ICMP-only
  - 2 Synology-NAS: synology-nas (DS1825+ Homelab), nana-nas (DS1517+ Dottikon via Tailscale) -- SNMP live
  - pbs-backup-server (10.0.2.50) -- als `cmk-agent` angelegt
  - 2 DNS: lxc-dns-01 (10.0.2.1), lxc-dns-02 (10.0.2.2) -- als `cmk-agent` angelegt
  - 2 Traefik: vm-traefik-01 (10.0.2.21), vm-traefik-02 (10.0.2.22) -- als `cmk-agent` angelegt
  - traefik-vip (10.0.2.20), udm-pro (10.0.0.1) -- ICMP-only Reachability
  - datacenter-manager (10.0.2.60), reddit-downloader (10.0.2.72) -- als `cmk-agent` angelegt
  - homeassistant -- VM-Status-Host
  - Container-Discovery-Einträge (~80 Einträge im Drift-Bereich)
- **Aktive Special-Agents**: `proxmox_ve` für pve00/01/02, `synology_health` für beide NAS
- **Aktive Standard-Agents**: identisch zu DCLab (`cmk_update_agent`, `mk_apt`, `mk_docker`, `mk_logins`)
- **InfluxDB-Forwarder**: aktiv seit dem Cutover 2026-06-05 -- schreibt die Service-Performance-Metriken aller monitored Hosts (inkl. beider Synology-NAS) zusätzlich in den `telegraf`-Bucket; für die NAS-Hardware ist er seither die einzige Quelle (Details in [InfluxDB & Telegraf](../monitoring/influxdb.md))
- **Notification-Konfig**:
  1. Telegram-Plugin `check_mk_telegram-notify.sh` mit hardcoded Token und Chat-ID -- bypasses Keep komplett, gegen Single-Notifier-Konvention
  2. Mail-Plugin (Default-Rule)
- **Postfix auf checkmk-VM**: `inet_interfaces = loopback-only`, kein Relayhost -- Mails verlassen die VM nicht
- **Mail-Empfänger**: `cmkadmin` ohne email-Feld
- **Severity-Modell**: identisch (OK/WARN/CRIT/UNKNOWN)
- **HA**: Single-Instance (checkmk). Bei Site-Down: kein Failover

## Agent-Deployment

Der CheckMK Agent läuft auf jedem überwachten Host und kommuniziert über TCP Port 6556 (siehe [Ports und Dienste](../_referenz/ports-und-dienste.md)). Der Agent wird als Paket (`check-mk-agent`) installiert und meldet bei Abfrage durch den CheckMK Server die aktuellen Systemmetriken.

Die Installation erfolgt über Ansible (`ansible/playbooks/checkmk-agent-deploy.yml` im Repo `homelab-hashicorp-stack`):
- **Standard-Agent:** `playbooks/checkmk-agent-deploy.yml`
- **Docker-Plugin:** `playbooks/checkmk-docker-plugin.yml` -- aktiviert Piggyback für Nomad-Container
- **Linstor Local Checks:** `playbooks/checkmk-linstor-checks.yml` -- deploys Linstor/DRBD-spezifische Local Checks auf die `drbd_storage`-Gruppe (vm-nomad-client-05/06)

### TLS-Registrierung (pull-agent)

Alle Agents laufen im TLS-gesicherten Pull-Modus. Drei Architektur-Entscheidungen:

- **Registrierung via `agent_registration`-User:** Die TLS-Registrierung (`cmk-agent-ctl register`) läuft mit einem dedizierten CheckMK-User ohne Management-Rechte. Damit hat der Registrierungsprozess keine Schreibrechte auf Monitoring-Konfiguration.

- **`--trust-cert` bei der Registrierung:** Das CheckMK-Site-CA-Zertifikat ist selbstsigniert (keine externe CA). Beim ersten Registrierungsaufruf wird `--trust-cert` übergeben, damit der Agent das CA-Zertifikat vertraut, ohne es manuell importieren zu müssen.

- **`allow_legacy_pull=false` als separater Rollout-Abschluss:** Die Registrierungs-Automation schliesst den unsicheren Legacy-Pull-Modus (unverschlüsselter Port 6556) nicht automatisch nach jeder Registrierung. Er wird erst nach vollständigem Rollout in einem separaten Schritt deaktiviert, sobald alle Hosts TLS-registriert sind -- dieser Abschluss-Schritt ist nicht in der Repo-Automation abgebildet.

Proxmox-Hosts (pve00/01/02) und externe Standalone-Nodes (pve-01-nana, pve-lu-01) werden über denselben `deb`-Paket-Weg deployt -- kein separater Deploymentpfad für Hypervisoren.

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

- [Monitoring: Strategie](../monitoring/strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Monitoring: Best-Path-Klassifikation](../monitoring/klassifikation.md) -- Best-Path pro Coverage-Item
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Uptime Kuma und Alloy für Metriken und Logs
- [Uptime Kuma](../uptime-kuma/index.md) -- Synthetic-Monitoring für Endpoint-Verfügbarkeit
- [SMTP Relay](../smtp-relay/index.md) -- Mail-Versand für CheckMK-Alerts
- [Proxmox Backup Server](../backup/referenz.md) -- VM-Backup von CheckMK