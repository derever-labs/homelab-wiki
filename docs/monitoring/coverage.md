---
title: "Monitoring: Coverage"
description: Single Source of Truth für die Homelab-Monitoring-Coverage -- pro Item welcher Pfad, welcher Status, welche offene Lücke
tags:
  - monitoring
  - coverage
  - checkmk
  - telegraf
  - loki
  - keep
  - ssot
---

# Monitoring: Coverage

Diese Seite ist die **Single Source of Truth** für den Ist-Zustand der Homelab-Monitoring-Coverage. Sie listet pro Layer jedes Item mit Adresse, Pfad, Status, Priorität, Silent-Fail-Risiko und ClickUp-Task. Architektur-Hintergrund in [Monitoring](index.md), Strategie in [Monitoring: Strategie](strategie.md), Keep-Correlation-Patterns in [Monitoring: Keep-Correlations](keep-correlations.md). Stand: 2026-06-09.

::: info Single Source of Truth
Diese Tabelle ist der Pflege-Punkt für Coverage-Status. Andere Agenten, die Drift erkennen oder neue Coverage einrichten, aktualisieren **diese** Seite -- nicht die Audit-Files (sind eingefroren) und nicht andere Wiki-Seiten. Offene Arbeit gehört in den ClickUp-Master [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4). Wiki-Änderungen erfolgen erst nach Implementation.
:::

## Pflege-Konvention

- **Status-Änderung** -- bei Implementierung Eintrag von `missing` oder `partial` auf `live` updaten, ClickUp-Task schliessen, Datum in `Notes` eintragen
- **Neuer Drift erkannt** -- Eintrag bleibt `live`, im Feld `Notes` Drift kurz beschreiben, ClickUp-Task im Master-Bundle anlegen, Task-ID in Spalte `Task` setzen
- **Neuer Host / neue Komponente** -- neue Zeile in der passenden Layer-Tabelle, Status `missing` oder `partial`, ClickUp-Task verlinken
- **Status-Werte:** `live` (vollständig überwacht + alarmiert) -- `partial` (gepollt aber nicht alarmiert oder Coverage unvollständig) -- `missing` (kein Pfad konfiguriert) -- `skip` (bewusst nicht überwacht, mit Begründung)
- **Prio-Werte:** `P0` (silent-fail mit hohem blast) -- `P1` (mittlerer blast) -- `P2` (nice-to-have)
- **Pfad-Spalte:** `checkmk` -- `influx` (Telegraf+InfluxDB+Grafana) -- `loki` (Loki+Alloy+Grafana) -- `uptime` (Uptime-Kuma) -- `direct` (Direct-Webhook nach Keep) -- `none` (kein Pfad)

## Storage-Schwellen-Konvention

Disk-Full-Alerts unterscheiden zwei Storage-Klassen:

- **Backup/NAS-Storage** (PBS-Datastore, Garage, NFS-Backup-Mounts, Synology-Volumes): Critical 95%, optional Warning 90%. Backup-Storage darf voll laufen, kontrolliertes Erreichen ist akzeptabel
- **Live-Storage** (DRBD/Linstor-Volumes für Apps wie `loki-data`, `influxdb-data`, `keep-data`): Warning 75%, Critical 90%. Live-Volumes haben FS-Korruptions-Risiko bei Voll

PBS bei 91% (Stand 2026-04-30) liegt damit unter der 95%-Schwelle und ist kein akuter Incident, sondern ein P0-Item für Threshold-Setup + Massnahme bei Erreichen. Ableitung dieser Konvention im Memory `feedback_nas_storage_threshold_95`.

## Layer 1 -- Hardware / Power

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Task / Notes |
| --- | --- | --- | --- | --- | --- | --- |
| pve00 NVMe SMART | 10.0.2.40 | influx | missing | P0 | silent disk-failure | `inputs.smart` aktivieren |
| pve00 hwmon Temp | 10.0.2.40 | influx | missing | P1 | thermal-throttle silent | `inputs.temp + hwmon` |
| pve00 Power-Loss | 10.0.2.40 | influx | missing | P0 | 10 unsafe-shutdowns historisch | `smart_unsafe_shutdowns delta`-Alert |
| pve01 NVMe SMART | 10.0.2.41 | influx | missing | P0 | silent disk-failure | `inputs.smart` aktivieren |
| pve01 hwmon Temp | 10.0.2.41 | influx | missing | P1 | nvme0n1 61C aktuell | `inputs.temp + hwmon` |
| pve02 NVMe SMART | 10.0.2.42 | influx | missing | P0 | silent disk-failure | `inputs.smart` aktivieren |
| pve02 hwmon Temp | 10.0.2.42 | influx | missing | P1 | nvme0n1 61C aktuell | `inputs.temp + hwmon` |
| pve-01-nana NVMe SMART | 192.168.2.41 / 100.81.116.122 (Tailscale) | influx | missing | P0 | silent disk-failure auf externem Watchdog-Host | `inputs.smart` aktivieren -- externer Watchdog Dottikon, neu seit 2026-05-01 |
| pve-01-nana hwmon Temp | pve-01-nana | influx | missing | P1 | thermal-throttle silent | `inputs.temp + hwmon` |
| pve-01-nana Power-Loss | pve-01-nana | influx | missing | P0 | DeskMini Single-PSU, keine USV im Standort Dottikon | `smart_unsafe_shutdowns delta`-Alert + USV-Erweiterung Standort prüfen. Memory `project_ups_psu_2026` |
| USV (NUT/upsd) | -- | none | missing | P0 | USV physisch entfernt | Coverage-Audit 2026-06-09: kein `inputs.nut`/`inputs.upsd` in telegraf.conf, kein Kuma-Monitor, die 5 USV-Alert-Rules (ups-on-battery/runtime/battery-replace/offline) stehen in `grafana.nomad` unter `deleteRules` (Kommentar „USV physisch entfernt"). Status `partial`->`missing` korrigiert. Bei USV-Rückkehr: `inputs.nut` + Rules aus deleteRules reaktivieren |
| synology-nas (Homelab DS1825+) | 10.0.0.200 | checkmk SNMP | live | P0 | -- | Built-in synology_* Plugins (RAID/Disk/PSU/Fan/Temp/Volumes/CPU/RAM/IF), live verifiziert 2026-06-07 ([snmp] Success, alles OK). **CheckMK ist alleinige NAS-Alarmquelle** seit Cutover #63 (Grafana-Telegraf-SNMP-Pfad stillgelegt). Die früheren „Flapping"/NoData-Alerts (RAID Degraded, Disk Temp 55C, SMART) waren verwaiste Grafana-Telegraf-Rules nach dem Cutover -- 2026-06-07 via `deleteRules` bereinigt (#67), Root-Cause [`86ca5gn26`](https://app.clickup.com/t/86ca5gn26) |
| nana-nas (Dottikon DS1517+) | via Tailscale | checkmk SNMP | live | P0 | -- | analog. CheckMK-VM hat Tailscale-Client mit `tag:homelab` und `--accept-routes` |
| iperf3-Server | speedtest.init7.net:5201 (öffentlich) | influx | missing | P2 | Service-tot silent | Coverage-Audit 2026-06-09: Client ist Nomad-Job `iperf3-to-influxdb` (periodic 30min), Server ist `speedtest.init7.net` (NICHT 10.0.2.50/PBS-VM wie zuvor notiert). Metriken in InfluxDB (measurement=iperf3). Fehlend: Metric-Absence-Alert + Server-Reachability-Probe |

## Layer 2 -- Hypervisor (Proxmox)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| proxmox-cluster-quorum | pve00/01/02 | loki | partial | P1 | quorum-loss silent ohne Alert | corosync-Log-Pattern + Cron `pvecm status` Heartbeat |
| proxmox-ha-manager | pve01/02 | loki | partial | P1 | Failover/Fence silent | ha-crm Log-Pattern |
| proxmox-watchdog-mux | pve00/01/02 | loki | missing | P0 | Watchdog-tot -> Reset silent | softdog-Liveness [`86c9kmc1z`](https://app.clickup.com/t/86c9kmc1z) |
| proxmox-zfs-rpool | pve00/01/02 | none | missing | P1 | DEGRADED/FAULTED silent | ZED-Mail + zpool-status-Cron |
| proxmox-nfs-storage | NAS 10.0.0.200 | influx | missing | P0 | 91% USED, kein Schwellen-Alert | `synology_volume_percent_used` Threshold (95% Critical, 90% Warning) [`86c9kk10u`](https://app.clickup.com/t/86c9kk10u) |
| proxmox-pvesr | pve01/02 | direct | missing | P0 | replication-fail silent | cron-script `pvesr status` |
| proxmox-pveproxy-api | pve00/01/02 | uptime | missing | P1 | API-Down silent | HTTP-Probe `:8006` |
| proxmox-corosync-ring | network 10.0.2.x | none | missing | P1 | Single ring0 -- Network-Partition könnte Quorum killen | strukturelle Empfehlung `ring1_addr` |
| proxmox-zfs-scrub | pve00/01/02 | direct | missing | P1 | scrub-fail silent | `zpool status`-Cron |
| proxmox-host-metrics | pve00/01/02 | influx + checkmk | partial | P0 | CPU-Detail/VM-Breakdown silent (kein pve-Exporter) | Coverage-Audit 2026-06-09: Proxmox-Builtin-InfluxDB-Push aktiv (Bucket `proxmox`), Grafana-Rule `Proxmox Node Down` live (noDataState=Alerting); CheckMK pve00/01/02 je 4 Services (Node Info + Memory Usage). Status `missing`->`partial`. pve-Exporter (CPU-Detail/VM-Breakdown) bleibt offen [`86c9kmc0h`](https://app.clickup.com/t/86c9kmc0h) |
| pve-01-nana zfs-rpool | pve-01-nana | none | missing | P1 | DEGRADED/FAULTED silent auf externem Watchdog | ZED-Mail + zpool-status-Cron |
| pve-01-nana zfs-scrub | pve-01-nana | direct | missing | P1 | scrub-fail silent | `zpool status`-Cron |
| pve-01-nana pveproxy-api | pve-01-nana:8006 | uptime | missing | P1 | API-Down silent | HTTP-Probe `:8006` über Tailscale-IP |
| pve-01-nana host-metrics | pve-01-nana | checkmk + influx | partial | P0 | komplett silent, CheckMK-Agent + Alloy + Telegraf noch nicht deployed | Host als `cmk-agent` angelegt am 2026-05-01. Ansible-Plays `06-checkmk-agent.yml` + `deploy-alloy-proxmox.yml` mit `--limit pve-01-nana` über Inventory-Gruppe `proxmox_external` ausstehend [`86c9kwvtg`](https://app.clickup.com/t/86c9kwvtg) |
| pve-lu-01 (Luzern Standalone) | 172.16.0.200 / 100.112.213.18 (Tailscale) | none | missing | P1 | Node-Down + hostende VM silent, ausserhalb Homelab-Monitoring-Reach | Acer Revo RB610, Standalone-Node Standort Luzern (kein Cluster/Quorum/DRBD), ZFS lokal, PBS-Backup. Hostet `homeassistant-luzern` (VM100). Kein CheckMK-Agent/Telegraf/ICMP-Probe -- analog `pve-01-nana` (Dottikon) nachziehen. Erfasst beim Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |

## Layer 3 -- Storage (DRBD / Linstor / NAS / Backup)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Linstor-Cluster (Controller + Satellites) | c04/c05/c06 + drbd-reactor | influx + loki | partial | P1 | Controller-Failover silent | Drift 2026-05-01: `DRBD Verbindung getrennt`-Alert flapped 8601 Transitions / 50h seit Recovery 2026-04-29 (~80% Alert-Volumen Homelab) -- Root-Cause-Investigation [`86c9ktgag`](https://app.clickup.com/t/86c9ktgag). Linstor-Node-Offline + DRBD-Out-of-Sync abgedeckt; Failover-Alert fehlt |
| DRBD Split-Brain | c05/c06 | loki | missing | P0 | eigener Modus ggü. Out-of-Sync: beide Nodes `role:Primary` (Tiebreaker c04 weg + c05↔c06 getrennt) -> Datenverlust-Risiko, kein Alert | `drbdsetup status` -> Primary-Count==2 Critical. `on-no-quorum=suspend-io` schützt Writes, erkennt aber Split-Brain nicht. Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Linstor Auto-Unlock / Controller-Quorum-Reboot | c05/c06 + drbd-reactor | loki | missing | P0 | (1) Encryption-Auto-Unlock-Fail nach Failover -> alle CSI-Volumes locked -> alle Apps pending/failed; (2) drbd-reactor `on-quorum-loss=shutdown` rebootet Node ungeplant, ohne erklärenden Alert | systemd-unit-Alert (Unlock-Service failed + drbd-reactor-triggered reboot via loki). Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Linstor-Backup-Pipeline | cron c05+c06 + Uptime-Kuma | uptime + loki | partial | P0 | Partial-Failure mit `Errors > 0` wird nicht alarmiert | Heartbeat sieht nur 0-vs-mehr; LogQL-Pattern auf `Errors: [1-9]` fehlt |
| pbs-backup-server (Datastore) | 10.0.2.50 | checkmk + direct | partial | P0 | Datastore 91% USED silent (95% Critical / 90% Warning); Postfix kein Relayhost konfiguriert (legacy-sendmail-Notifications silent) | Host als `cmk-agent` angelegt. Agent-Install ausstehend. df-Plugin für Datastores + Loki-Pattern für PBS-Sync/Verify-Fehler folgen [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) |
| synology-nas (Linstor-S3 + NFS-Mounts) | 10.0.0.200 | checkmk SNMP | live | P2 | -- | RAID/Volume/SMART/Temp covered seit 2026-05-01 (built-in Plugins). Power-Status-Change + DSM-Upgrade als Nice-to-have |
| Garage S3 (aktiv) | 10.0.0.200:9012/9014 | Telegraf-Scrape pending | partial | P1 | `/metrics` Bearer-Token-Endpoint vorhanden, Telegraf-Input noch nicht deployt im Homelab | Memory `reference_s3_garage_minio` |
| CSI-Health-Files | csi-health-metrics.sh c05+c06 | influx | partial | P1 | Skript-tot silent | Stale-Mount + Plugin-Socket abgedeckt; Skript-Self-Heartbeat fehlt. Transport seit 2026-05-29 NFS-frei (lokal `/var/lib/csi-metrics` -> Telegraf-Host-Agent -> Bucket `telegraf`), kein NFS-D-State-Risiko mehr. Memory `project_csi_health_monitoring_2026_04_30` |
| NFS-Mount-Pipeline | 5 Mounts pro Storage-Node + PBS | none | missing | P1 | Mount-Loss silent; Staleness-Pattern fehlt | indirekt über csi-health, aber kein dedizierter Mount-Loss-Alert |
| NFS-Server-Daemon (NAS nfsd) | 10.0.0.200:2049 | uptime + checkmk | missing | P0 | nfsd-Boot-Race: nach NAS-Reboot 0 Threads / Port 2049 `Connection refused` -> ALLE NFS-Consumer (Stash, Jellyfin, Proxmox-Storage, cert/logs/docker-Mounts) hart blockiert, kein Alert | Incident 2026-05-31 (Recovery `systemctl restart nfs-server`, threads 0->128). Fehlt: (1) Connectivity-Probe TCP 2049 + `threads>0`, (2) R/W-E2E-Canary (schreibt+liest Testdatei auf Mount, timeout-gewrappt, Hysterese `for:6-8min`). Root-Cause: `nfs-server.service` ist `oneshot/RemainAfterExit` -> 0-Thread-Start wird als `active` maskiert; kein nfsd-Boot-Hook am NAS (nur `ssh-hardening-reapply` bootup-Task). Boot-Fix + Probe in [`86ca1gq1y`](https://app.clickup.com/t/86ca1gq1y). Memory `feedback_synology_nfsd_boot_race` |
| iperf3-Server | PBS userspace | none | missing | P2 | -- | Client ist Nomad-Job `iperf3-to-influxdb` (periodic, alle 30min -> InfluxDB). Server-Self-Probe + Metric-Absence-Alert fehlen |
| mediaserver (DS2419+, .210) | 10.0.0.210 | checkmk SNMP | partial | P1 | NFS-Export-Liveness der USB-Jellyfin-Shares ungemonitort (HW abgedeckt) | Frisch aufgesetzt, läuft parallel zu .200. Seit 2026-06-07 CheckMK-Host `mediaserver` (SNMPv3 authNoPriv/`checkmk`, 126 Services: RAID/Disks/Volume/Status -- alle 12 WD-Red Health Normal). Serviert die Jellyfin-Mediathek von USB-Shares per NFS an die Media-Worker. Offen: dedizierte NFS-Export-/TCP-2049-Probe; SSD-Read-Cache „not initialized". [`86ca5gn26`](https://app.clickup.com/t/86ca5gn26) |
| Storage-Maintenance-Jobs (fstrim/drbd-verify/csi-gc) | Nomad batch-jobs | uptime | partial | P1 | `csi-gc`-Fail silent (kein Heartbeat) | Coverage-Audit 2026-06-09: `fstrim` (Kuma-Push id=82, wöchentlich) + `drbd-verify` (Kuma-Push id=83, wöchentlich) live; `csi-gc` (daily 03:30) hat noch KEINEN Kuma-Push-Heartbeat. Status `missing`->`partial`. Memory `feedback_maintenance_as_nomad_jobs`. csi-gc-HB offen [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| LVM Thin Pool (DRBD-Backing-Storage) | c04/c05/c06 | influx | partial | P1 | Pool-Voll -> FS-Korruption der DRBD-Volumes | Erfasst Coverage-Audit 2026-06-09: 3 Grafana-Influx-Rules live (`LVM Thin Pool > 75%` Warning, `> 85%` Critical, `LVM Metadata > 75%` Warning) decken den Füllstand der Thin-Pools ab. Kein dedizierter Self-Heartbeat für das LVM-Reporting-Skript. War bisher kein eigener Coverage-Eintrag |

## Layer 4 -- Network (Pi-hole / Traefik / Tailscale / UDM)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| vm-traefik-01 (HA-MASTER) | 10.0.2.21 | checkmk + loki + direct | partial | P0 | ACME-Renewal silent, Double-Down keine Korrelation, Split-Brain ungemonitort | Host als `cmk-agent` angelegt. Agent-Install ausstehend. Traefik prom-Endpoint via Telegraf folgt [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4). Memory `reference_vm_traefik_01` |
| vm-traefik-02 (HA-BACKUP) | 10.0.2.22 | checkmk + loki + direct | partial | P0 | analog | analog |
| traefik-vip (keepalived) | 10.0.2.20 | checkmk ICMP | live | P1 | -- | Reachability live als ICMP-only. VRRP-State-Probe geplant |
| lxc-dns-01 (Pi-hole+Unbound Primary) | 10.0.2.1 | checkmk + direct | partial | P0 | Double-Down keine Korrelation, FTL-DB silent, Resolver-E2E-Probe fehlt | Host als `cmk-agent` angelegt. Agent-Install ausstehend. `pihole-FTL.service` als systemd-Service folgt [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4). Memory `feedback_pihole_no_vrrp` |
| lxc-dns-02 (Pi-hole+Unbound Secondary) | 10.0.2.2 | checkmk + direct | partial | P0 | analog | analog |
| nebula-sync | nomad-job | loki | missing | P1 | komplett silent bei Sync-Fail, Drift-Wochen unbemerkt | Erfolgs-Heartbeat fehlt, Loki-Pattern nicht definiert |
| udm-pro (UniFi Gateway) | 10.0.0.1 | checkmk ICMP | partial | P0 | komplettes Internet-Gateway ohne direkte Coverage | Reachability live als ICMP-only. Welle-3 [`86c9kmc3u`](https://app.clickup.com/t/86c9kmc3u): SNMP-Aktivierung in Unifi-Controller + Standard-Plugins + Syslog-Forward nach Alloy |
| UniFi Switches (10.0.0.172, .181, .184-.186) | mehrere IPs | none | missing | P1 | Reboots/PoE/Port-Flapping silent | ICMP via CheckMK + Syslog-Sender konfigurieren. UniFi-Controller liefert ergänzend SDK-Daten |
| Access Points (10.0.0.191-.197) | mehrere IPs | none | skip | P2 | -- | Coverage über Unifi-Controller; eigenständige CheckMK-Hosts nicht vorgesehen |
| CrowdSec | Container vm-traefik-01 | loki | partial | P1 | Bouncer-Stale + Container-Crash silent (Fail-Open) | Bouncer-Last-Pull-Heartbeat + Container-Up-Alert; 3 stale Bouncers, kein Repo-Doku [`86c9kmc5m`](https://app.clickup.com/t/86c9kmc5m) |
| Tailscale-Mesh | vm-traefik-01/02 + 8 Nodes | none | missing | P1 | Node-Offline silent, Cross-Tailnet HSLU/Privat ungeprüft | Cron-Probe `tailscale status -json`. Memory `reference_tailscale_tailnet`, `feedback_tailscale_ping_ignores_acls` |
| Cloudflare DDNS x2 | Container vm-traefik-01 | loki | partial | P0 | Update-Fehler silent, IP-Drift unbemerkt | Loki-Pattern + IP-Vergleich-Cron |
| Keepalived (VRRP) | vm-traefik-01/02 | direct | live | P1 | -- | Multi-MASTER-Detection + Flap-Detection ergänzen |
| nginx-error-page | Container vm-traefik-01/02 | none | missing | P2 | -- | Container-Up-Check |
| Internet-Reachability | extern | none | missing | P1 | Cert-Renewal/CF-API/Service-Erreichbarkeit kaskadierend | Gatus-Probes 1.1.1.1 + 9.9.9.9 + DNS-Resolve |

## Layer 5 -- Platform (Nomad / Consul / Vault / Postgres)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| vm-nomad-server-04/05/06 | 10.0.2.104/.105/.106 | checkmk + influx + uptime | partial | P0 | Job-Crashloop silent, Server-Metriken fehlen | CheckMK Standard-Agent live. Kuma HTTP-Monitore `Consul/Nomad/Vault Server API 04/05/06` + Push `Nomad Token -- vm-nomad-server-04/05/06`. `inputs.nomad` Plugin nachrüsten |
| vm-nomad-client-04/05/06 | 10.0.2.124/.125/.126 | checkmk + influx + uptime | partial | P0 | analog | Drift 2026-05-01: `Nomad Task Restart-Storm` 158 Transitions / 50h Homelab vs. nur 6 DCLab -- Cluster-Parity-Drift, Investigation [`86c9ktgb7`](https://app.clickup.com/t/86c9ktgb7) (umfasst auch `Nomad Client Node Down` 104/50h flap und `Nomad Failed Allocations` 100/50h). CheckMK Standard-Agent + Docker-Piggyback live. Reschedule-Storm-Detection via Telegraf-File-Input live seit 2026-05-01. Linstor-CSI-Health auf c05/c06. Kuma HTTP-Monitore `Nomad Client API 04/05/06` (eingerichtet 2026-05-13 nach c04-OOM-Vorfall, siehe [`86c9rx6cv`](https://app.clickup.com/t/86c9rx6cv) und [`86c9rx664`](https://app.clickup.com/t/86c9rx664)) + Push `Nomad Token -- vm-nomad-client-04/05/06` |
| Consul Cluster | vm-nomad-server-04/05/06 | influx | partial | P0 | Quorum-Loss kein Alert -- KASKADE: kein Leader -> alle `*.service.consul`-Lookups SERVFAIL -> Grafana/Keep/Authentik (postgres.service.consul) + Alloy (loki.service.consul) gleichzeitig blind, gesamte Alert-Pipeline tot | Telegraf-Prometheus auf `:8500`. Quorum-Loss-Alert (`consul_raft_leader`/peers) fehlt -- bisher nur Einzel-Server-Reachability. Prio P0 hochgestuft Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Vault HA Cluster | vm-nomad-server-04/05/06 | loki + influx | partial | P0 | Per-Node-Sealed silent; Synthetic-Heartbeat fehlt | Coverage-Audit 2026-06-09: 3 Grafana-Loki-Rules live (`Vault Sealed` critical via Pattern `core: vault is sealed`, `vault-unseal.service failed nach Boot` critical, `Vault Service Restart-Loop` warning) + `Vault Permission Denied`. Status `missing`->`partial`. Offen: Influx-Synthetic-Heartbeat + Per-Node-Sealed-Probe (Loki-Pattern erkennt nur den Log-Moment, nicht Dauer-Sealed). `vault-unseal.service` liest `/etc/vault.d/unseal-keys` (NICHT von Ansible deployt). Memory `reference_vault_unseal_token_on_disk` |
| NTP / Zeit-Drift | alle VMs (chrony) | none | missing | P0 | komplett ungemonitort -- Drift >Sekunden bricht GLEICHZEITIG Vault-JWT-Auth, TLS-Gültigkeit (notBefore/notAfter), Consul-Gossip, Authentik-TOTP | `inputs.chrony` (Telegraf) oder Cron `chronyc tracking` -> Offset-Threshold. Whole-Category-Lücke, Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| etcd Server-Cluster (Legacy?) | vm-nomad-server-04/05/06 | none | skip | P2 | -- | Coverage-Audit 2026-06-07: kein etcd-Job in nomad-jobs, kein Ansible-Play in infra-stack (`git log`/`find` beide leer) -- nie deployed bzw. bereits bereinigt, kein Monitoring nötig |
| Postgres (DRBD Single, Affinity c05) | vm-nomad-client-06 | influx | partial | P0 | Connection-Pool-Storm bekannt | `inputs.postgresql` + Synthetic-Probe. Memory `feedback_authentik_pg_connection_storm`, `project_pg_storage_bottleneck_2026` |
| MariaDB (DRBD Single, Affinity c05) | client-05/06, Port 3306 | none | missing | P0 | komplett silent -- backt die `uptime_kuma`-DB: MariaDB-Down = Uptime-Kuma-Down = Monitoring-Pfad weg UND Keep-Dead-Man-Switch blind (Kuma empfängt den keep-heartbeat-watch-Push) | `databases/mariadb-drbd.nomad`, Vault `kv/data/shared/mariadb`. Kein Health-Probe, kein `inputs.mysql`. Erfasst Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Postgres-Backup | Nomad batch-job 03:00 | uptime | partial | P1 | Validity-Check fehlt | `pg_restore --list` integrieren |
| MariaDB-Backup | Nomad batch-job 03:15 | none | missing | P1 | Backup-Fail silent | `batch-jobs/mariadb-backup.nomad`. Kuma-Push-Heartbeat + Validity-Check fehlen (analog Postgres-Backup). Erfasst Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Consul-Snapshot-Backup | Nomad batch-job 01:45 | uptime | missing | P1 | Backup-Fail silent -- Push geht ins Leere | Coverage-Audit 2026-06-09 (Drift): Job hat Kuma-Push-Code (`consul_snapshot_push` aus Vault), aber KEIN korrespondierender Kuma-PUSH-Monitor existiert -> Push wird nirgends empfangen. Status `live`->`missing` korrigiert (uptime-Pfad ist nicht aktiv). Kuma-Monitor anlegen + Vault-Secret befüllen [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Nomad-Snapshot-Backup | Nomad batch-job 01:30 | uptime | missing | P1 | Backup-Fail silent -- Push geht ins Leere | Coverage-Audit 2026-06-09 (Drift): Push-Code (`nomad_snapshot_push`) vorhanden, kein Kuma-Monitor deployt. Status `partial`->`missing`. Kuma-Monitor anlegen + Restore-Test [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Vault-Backup | Nomad batch-job 02:00 | uptime | missing | P1 | Backup-Fail silent -- Push geht ins Leere | Coverage-Audit 2026-06-09 (Drift): Push-Code (`vault_backup_push`) vorhanden, kein Kuma-Monitor deployt. Status `partial`->`missing`. Kuma-Monitor anlegen + Restore-Test [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| InfluxDB-Backup | Nomad batch-job 03:30 | none | missing | P0 | komplett silent! | Uptime-Kuma-Push-Monitor hinzufügen (zusammen mit den anderen Backup-Job-Monitoren -- gleiches Muster wie consul/nomad/vault) [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Renovate | Nomad batch-job 05:00 | uptime | live | P2 | -- | HB existiert |
| Nomad-Node Lifecycle-/Secrets-Events | pve-Nodes + vm-nomad-client/server | loki | live | P1 | -- | Erfasst Coverage-Audit 2026-06-09: 11 Grafana-Loki-Rules in ruleGroup `Secrets-Architektur Alerts` (alle aktiv): Pre-Drain-Handler ohne NOMAD_TOKEN / Vault-Auth-fail, Smart-Shutdown ohne NOMAD_TOKEN / Drain-Deadline, `nomad-boot-enable.service` failed, `vault-unseal.service` failed, Vault-Restart-Loop, ZOT-Pull Auth-Failure / Failure-Spike, Nomad-Node ineligible >10min, Kritischer Service failed (Layer-2-Telegraf). War bisher kein eigener Coverage-Eintrag |

## Layer 6 -- Auth / Security (Authentik / Certs / Audit-Logs)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Authentik Server | identity/authentik.nomad@c05 | influx + loki | partial | P0 | Server-Down silent (kein eigener Alert) | Coverage-Audit 2026-06-09: Gatus Login-Flow-Probe + Kuma HTTP (id=52/62) + Grafana `Authentik PG Connections > 250`. ACHTUNG: `Outpost-Connection-Alert` existiert NICHT (nur gescraped, keine Rule) -- frühere Notiz war falsch, siehe Outpost-Zeile. Memory `project_authentik_cookie_domain` |
| Authentik Outposts (Proxy + LDAP) | identity/authentik.nomad@c05 | influx | partial | P0 | `outpost_connection`-Drop nicht alarmiert; gescraped aber keine Alert-Rule | `authentik_outpost_connection==0` -> Influx-Alert |
| OpenLDAP | databases/open-ldap.nomad@c05 | none | missing | P0 | TCP-Check trügerisch, kein BIND-Test | Cron-Bind-Test 5min direct [`86c9kmc50`](https://app.clickup.com/t/86c9kmc50) |
| LE-Cert-Renewal `ackermannprivat.ch` | traefik@vm-traefik-01 | gatus | partial | P1 | weitere Subdomains nicht einzeln geprüft | Coverage-Audit 2026-06-09 (Drift): Gatus cert-expiration live für `traefik.ackermannprivat.ch` + `auth.ackermannprivat.ch`, je zweistufig (30d Warnung 720h + 7d Kritisch 168h). Status `missing`->`partial`. Kein generischer Wildcard-Check -- wiki/keep/status etc. nicht einzeln |
| LE-Cert-Renewal `ackermann.systems` | traefik@vm-traefik-01 | none | missing | P0 | gleiche, evtl. ungenutzt? Cookie-Domain Drift gegen `ackermannprivat.ch` | Gatus cert-expiration; Login-Fluss prüfen |
| DSM-Cert `login.ackermannprivat.ch` | Synology NAS :40001 | uptime | live | P2 | -- | Erfasst Coverage-Audit 2026-06-09: Kuma HTTP-Monitor id=85 prüft das Synology-DSM-HTTPS-Zertifikat stündlich (Auth-Gruppe). Separat vom Gatus-TCP-Check auf 10.0.0.200:40001 |
| Vault Audit Backend | vault.service@nomad-server-04 | none | unknown | P0 | Enabled-Status unverifiziert | Cron `vault audit list` + Audit-File-Disk-Watch |
| Vault Sealed-State | vault.service | uptime + loki | partial | P0 | Gatus `sys/health?standbyok=true` kann SEALED Standby (HTTP 429/473) nicht von gesundem Standby unterscheiden | Coverage-Audit 2026-06-09: Gatus `sys/health` (3 Nodes) + Kuma HTTP (id=50/69/70) + Grafana-Loki-Rules `Vault Sealed` (critical) / `vault-unseal.service failed` (critical) / `Vault Service Restart-Loop` (warning). Per-Node-Sealed-Probe ergänzen (siehe L5 Vault HA) |
| CrowdSec | crowdsec@vm-traefik-01 | none | missing | P0 | Container-tot = WAF-tot silent (Fail-Open) | docker-status + CAPI-Sync-Pattern in Loki [`86c9kmc5m`](https://app.clickup.com/t/86c9kmc5m) |
| Tailscale (Cross-Tailnet HSLU/Privat) | tailscaled@vm-traefik-01 | none | missing | P1 | Cross-Tailnet-Drift unwatched; HSLU-Geräte in Privat-Tailnet | systemd-status + Member-Diff-Cron |
| Authentik-Audit-Job (Drift) | batch-jobs/authentik-audit.nomad | direct | partial | P2 | direct-Telegram statt Keep-Pfad (`TELEGRAM_RELAY_URL=http://telegram-relay.service.consul:9095/notify`) -- Drift gegen Memory `project_monitoring_routing_2026_04` | umstellen auf Keep-Pfad |

## Layer 7 -- Observability self-monitoring

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Loki Homelab | monitoring/loki.nomad -> 10.0.2.126:3100, drbd1010 13% voll | influx + uptime | missing | P0 | WAL-voll silent, Cardinality-Explosion silent (default 5000 streams, aktuell 471), kein Self-Detection-Alert | DCLab-Pattern (`loki-ingester-down` Absent-Alert) portieren |
| InfluxDB Homelab | 10.0.2.126:8086, drbd1002 14% voll | influx + uptime | partial | P0 | `noDataState=NoData` Default macht alle Influx-Down-Szenarien silent | `noDataState=Alerting`, Volume-Fill, Task-Failure. Memory `feedback_grafana_nodatastate_per_query_type` |
| Grafana Homelab | -- | direct + uptime | partial | P0 | Henne-Ei -- wenn Grafana tot, fehlen alle Alert-Trigger | API-Route `/api/*` live seit 2026-05-01 (`intern-api@file`, IP-Allowlist 10/8 + 100.64/10, Bearer-Token via 1P `Grafana API Claude`) -- ermöglicht direkte Annotations-Queries für Frequenz-Audits ohne Authentik-Bypass. UI-Route weiterhin `intern-auth@file`. Externer Watchdog-Probe weiterhin Pflicht. Memory `feedback_traefik_explicit_service_tag` |
| Telegraf Homelab (system-Job) | system network=host | influx | partial | P0 | nur Totalausfall erkannt (kein per-Node-Absent) | Coverage-Audit 2026-06-09 (Drift): Grafana-Rule `Telegraf-Heartbeat Missing` (uid telegraf-heartbeat-missing, noDataState=Alerting) live -- feuert bei fehlendem CPU-Heartbeat des gesamten Streams. Status `missing`->`partial`. Per-Node-Absent-Pattern + Alloy-Push-Fail-Detection bleiben offen |
| Alloy Homelab (system-Job) | -- | influx | partial (Consul-Health) | P0 | Crash silent, Log-Pattern-Alerts feuern nicht | absent-Pattern + Push-Fail-Detection |
| Keep Homelab (Single-Point-of-Routing) | -- | direct extern + uptime | partial | P0 | KRITISCH -- wenn Keep tot, geht JEDER Alert verloren; EXTERNER Heartbeat fehlt noch | Interner Dead-Man-Switch live: `keep-heartbeat-watch.nomad` (G3-Backstop, alle 3min Kuma-Heartbeat + stale-firing-Watch) + `keep-db-retention.nomad` (daily 04:30 gegen DB-Voll). Beide deployt via branch `feat/keep-l1-foundation` (Merge offen). ACHTUNG: der interne Backstop ist NICHT unabhängig -- er pusht an Kuma, Kuma läuft auf MariaDB, Keep selbst auf Postgres (beide client-05/06). Ein Postgres- ODER MariaDB-Ausfall killt Keep UND den Backstop gleichzeitig -> nur der (noch nicht deployte) EXTERNE Watchdog auf pve-01-nana (Dottikon) deckt das echt ab. Stack-Deployment offen [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |
| vm-checkmk Homelab (Site `homelab`) | 10.0.2.150 | checkmk + uptime | partial | P0 | Site-Down silent | CheckMK Self-Monitoring live. Externer UK-Probe als Site-Down-Detection via pve-01-nana geplant |
| Uptime-Kuma Homelab | -- | direct | partial | P1 | -- | absent + Disk-Warn |
| Gatus Nomad Homelab | -- | direct | partial | P1 | externer-Watchdog-Doppelung mit LXC-100 | Endpoint-Liste erweitern |
| gatus-watchdog LXC-100 | pve01 LXC | direct | broken | P0 | UNHEALTHY 40h+, kein Alert | wget fehlt im Image, Probe-Schema-Bug. Wird durch externen Proxmox abgelöst |
| External Watchdog Platform pve-01-nana | pve-01-nana (Dottikon) | none | partial | P0 | Plattform live (Tailscale 100.81.116.122, PVE 9.1.9), Watchdog-Stack noch nicht deployed | Hardware-Bring-up done 2026-05-01; Stack (Keep + Grafana + CheckMK) als Folge-Task [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |
| InfluxDB-Tasks 1y/5y Downsampling | -- | uptime | partial | P1 | anomale Latenz / raw-Wachstum silent | Coverage-Audit 2026-06-09 (Drift): 6 Kuma-PUSH-Monitore live (id 55-60, Monitoring-Gruppe): downsample_telegraf/proxmox/homeassistant je _to_1y + _1y_to_5y. Task-Totalausfall via Missing-Heartbeat erkannt. Status `missing`->`partial`, Pfad influx->uptime. Offen: Grafana-Rule für anomale Ausführungs-Latenz + raw-Bucket-Wachstum |
| Telegram-Zustellpfad (terminaler Hop) | api.telegram.org + telegram-relay | none | missing | P0 | Keep/Relay sendet, aber Bot-Token revoziert oder Telegram-API down -> Alert wird intern verarbeitet, kommt aber NIE an; kein Dead-Letter, kein Fallback-Kanal | Loki-Pattern auf Telegram-send-Fehler (keep-heartbeat-watch loggt `TG-FAIL` nur, kein Alert) + Absent-Alert auf `telegram-relay.service.consul` (Single-Point für 5 direct-Batch-Jobs). Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |

## Layer 8 -- Apps (Homelab-spezifisch)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| App-Productivity-Stack (gitea, vaultwarden, paperless, n8n, obsidian-livesync, dbgate, metabase, solidtime, tandoor, vitepress-wiki, pocketbase) | nomad-jobs/services + databases | uptime + influx + loki | partial | P0 | container-up-but-app-broken silent (vaultwarden-heartbeat fehlt) | granulare Health-Probes. `kimai` entfernt 2026-05-31 (Stale-Cleanup 2026-06-07). `pocketbase` (Wartungsbanner-System) ergänzt |
| keep-mobile (mobile Keep-Incident-PWA, App-Standard-Pilot) | m.keep.ackermannprivat.ch | uptime | live | P2 | -- | UK-HTTP-Monitor 86 auf `/api/health` via no-auth Traefik-Router `keep-mobile-health` (`intern-noauth`, umgeht Authentik-302). Notif `Keep` -> Telegram. React-SPA + Hono-BFF, Deploy via SHA-Bump-PR (`derever-labs/homelab-nomad-jobs`). Sekundaere UI -- Keep-Alert-Pfad bleibt ohne sie funktionsfaehig. Erfasst 2026-06-08 |
| App-AI/LLM (ollama, open-webui, paperless-ai/gpt) | nomad-jobs/services | uptime + influx + direct | partial | P0 | external-api-cost-spike silent (Scrapfly + Anthropic + OpenAI) | Coverage-Audit 2026-06-09: Kuma-HTTP-Probes live für ollama (id=31), open-webui (id=18), paperless-ai (id=32). Status `missing`->`partial`. Cost-Cap-Alerting fehlt weiterhin. **TOT:** Kuma-Monitor `Hollama` (id=23) noch aktiv obwohl Job seit 2026-05-13 entfernt -> löschen [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |
| Smart-Home (homeassistant-VM, zigbee2mqtt, mosquitto-Pair) | vm:1000 + nomad-jobs/services | uptime + influx + loki | partial | P1 | HA-VM-down silent fail | uptime-kuma-Probe gegen `:8123` |
| Media-Stack (Arr: sonarr/radarr/prowlarr/suggestarr/lazylibrarian + Jellyfin-Trio: jellyfin/jellyseerr/jellystat + audiobookshelf + Stash-Trio + sabnzbd + YT-Downloader-x4) | nomad-jobs/media | influx + loki + direct | partial | P0 | container-up-but-app-broken silent (`special-youtube-dl + youtube-dl` Crash-Loop auf c05 ohne Alert) | NFS-Synology-91-Percent akut, Consul-critical-Forwarding fehlt. Enumeration präzisiert 2026-06-07 (`janitorr` war nie deployt, #55 entfernt) |
| Tools/Misc (flame, flame-intra, homepage-intra, changedetection, directus-gravel, immo-monitor, immoscraper, telegram-relay, phdler-bot, meshcmd) | nomad-jobs/services | uptime + direct + loki | partial | P0 | `meshcmd` (MeshCommander OOB/AMT-Mgmt) tot = kein Out-of-Band-Zugriff genau im Notfall | Coverage-Audit 2026-06-09: Kuma-PUSH `immoscraper` (id=77, 3d) + `immoscraper-weekly` (id=78, 7d) aktiv -- frühere Notiz „weekly-batch-heartbeat fehlt" veraltet. scrapfly-cost-cap fehlt weiterhin. `notifiarr` entfernt 2026-06-05. Memory `project_immoscraper_scrapfly` |
| Infrastructure-Apps (zot-registry, github-runner, nebula-sync, smtp-relay) | nomad-jobs/infrastructure | direct + loki | partial | P0 | zot-registry-down breaks alloc-pulls silent | zot-heartbeat fehlt, smtp-tx-error-rate fehlt. `filebrowser` + `redis-zot` entfernt 2026-05-13 (Stale-Cleanup 2026-06-07) |
| Batch-Jobs (renovate, renovate-backlog-watchdog, postgres-backup, vault-backup, consul-snapshot, nomad-snapshot, influxdb-backup, keep-db-retention, daily_* inkl. daily_restart_jellyfin/daily_container_restart, jellyfin_adult_sync, docker_prune, dns-performance, ph_downloader, reddit_*-Pair, authentik-audit, immoscraper-weekly) | nomad-jobs/batch-jobs | direct + influx | missing | P0 | batch-job-failed silent | postgres-backup-stale-Alert fehlt, renovate-3-runs-failed fehlt. Storage-Maintenance (fstrim/drbd-verify/csi-gc) + MariaDB-Backup: eigene Zeilen Layer 3/5. `zot-verify`/`reddit_gallery_dl_backfill` waren nie deployt (#55), entfernt 2026-06-07 |
| datacenter-manager (PDM Cross-Cluster) | 10.0.2.60 | checkmk + uptime | partial | P1 | -- | Host als `cmk-agent` angelegt. Agent-Install ausstehend. UK HTTP-Probe separat [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) |
| reddit-downloader | 10.0.2.72 | checkmk | missing | P2 | -- | Coverage-Audit 2026-06-09 (Drift): Host ist NICHT in den 23 live CheckMK-Hosts -- frühere Notiz „cmk-agent angelegt" trifft nicht zu. Kein Kuma-Push für reddit_*-Jobs. low prio |
| Guacamole (remote.ackermannprivat.ch) | VM (kein Nomad-Job) | uptime | partial | P2 | -- | Erfasst Coverage-Audit 2026-06-09: Kuma-HTTP-Monitor id=36 aktiv, in Authentik-Zugriffsmatrix als App gelistet. Kein `guacamole.nomad` auf origin/main -> vermutlich VM-basiert. Prüfen ob noch aktiv, sonst Monitor deaktivieren [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) |

## Bewusst nicht überwacht (skip)

- **Endgeräte im Device-VLAN** (10.0.10.0/24) -- bewusst nicht überwacht (Mobile/Desktops, kein 24/7-Charakter)
- **Gäste-VLAN** (10.0.30.0/24) -- bewusst nicht überwacht
- **Access Points einzeln** -- via Unifi-Controller abgedeckt, kein eigener CheckMK-Host pro AP

::: info Begründung skip
Endgeräte und Gäste-VLAN sind nicht 24/7 produktiv und werden bewusst nicht überwacht. Access Points sind über den Unifi-Controller abgedeckt und benötigen keinen eigenständigen CheckMK-Host.
:::

## Cross-Layer-Konflikte (geklärt 2026-05-01)

- **Postfix-Relayhost auf PBS Homelab** -- bestätigt: kein Relayhost konfiguriert auf 10.0.2.50. PBS-Notifications via legacy-sendmail bleiben silent. Layer-3-Eintrag P0
- **`authentik-audit.nomad` Drift** -- bestätigt: Job ruft direkt `http://telegram-relay.service.consul:9095/notify`, nicht über Keep-Hub. Drift gegen Memory `project_monitoring_routing_2026_04`. Layer-6-Eintrag P2
- **Naming-Drift `pve-5`** -- behoben am 2026-05-01: pve-5 orphan rules aus Homelab `rules.mk` entfernt
- **Stale-Hosts** -- behoben am 2026-05-01: vm-proxy-dns-01, vm-vpn-dns-01, zigbee-node aus CheckMK `all_hosts` gelöscht

## Coverage-Audit 2026-06-07 (Drift-Bereinigung)

Lücken-Audit gegen Ground-Truth `origin/main` der nomad-jobs (NICHT Feature-Branch) + Wiki-Host-Inventar (3 Explore-Agenten + Selbstverifikation). Offene Implementation der neu erfassten Lücken: [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc).

- **Neu erfasst:** MariaDB (L5, P0 -- backt uptime_kuma-DB), MariaDB-Backup (L5), pve-lu-01 Luzern-Standalone (L2), Altes Blech DS2419+ NFS-Jellyfin-Media (L3), Storage-Maintenance-Jobs fstrim/drbd-verify/csi-gc (L3). Keep-Eintrag (L7) auf `partial` (interner Dead-Man-Switch `keep-heartbeat-watch` + `keep-db-retention` live).
- **Stale entfernt** (Jobs auf main weg): redis-zot (#de0cc11), kimai (#1aa5f12), filebrowser + hollama (#2b18670), notifiarr (#4f1af79). etcd „Legacy?" -> `skip` (nie deployed). zot-verify/reddit_gallery_dl_backfill/janitorr/mariadb-setup waren nie deployt (#55).
- **Infra-Hygiene (eigener Strang, nicht Map):** `infra-stack/ansible/inventory/hosts.yml` trägt `vm-proxy-dns-01`, `vm-vpn-dns-01` (parallel zu lxc-dns-01/02) und `zigbee-node` (dekommissioniert 2026-04-17, noch in `deploy-alloy-infra.yml`) weiterhin -- aus CheckMK gelöscht, aber Ansible-Inventory nicht nachgezogen. Bereinigen via [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc).
- **Verifikations-Limit:** CheckMK `all_hosts`/`rules.mk` werden direkt auf der CheckMK-VM gepflegt (nicht im Repo) -- die effektive CheckMK-Hostliste ist aus Git nicht verifizierbar.

## Coverage-Audit 2026-06-09 (Schwarm-Abgleich, Live-Quellen)

Multi-Agent-Abgleich (9 Layer-Auditoren + adversariale Verifikation; 30 bestätigte Funde / 1 verworfen / 90 OK) gegen LIVE-Ist-Snapshots: Kuma-Hauptinstanz (91 Monitore), 40 Grafana-Alert-Rules, 23 CheckMK-Hosts + 297 Services (REST-API), 22 Gatus-Endpoints, nomad-jobs `origin/main` (120 Jobs). Erstmals auch die zuvor „aus Git nicht verifizierbaren" CheckMK-Hosts live geprüft.

- **Drift korrigiert (Map war zu pessimistisch -- reale Coverage besser):** proxmox-host-metrics, Telegraf-Heartbeat, Vault HA + Sealed-State, LE-Cert `ackermannprivat.ch`, Storage-Maintenance-Jobs, InfluxDB-Downsampling-Tasks, App-AI/LLM, immoscraper-weekly -- alle von `missing` auf `partial`; Grafana-Rules / Kuma-Push / Gatus-Cert-Checks existieren bereits.
- **Drift korrigiert (Map war zu optimistisch):** Consul-/Nomad-/Vault-Backup -- von `live`/`partial` auf `missing` (Push-Code vorhanden, aber KEIN Kuma-Monitor -> Push ins Leere, Backup-Fail silent). USV -- `partial` auf `missing` (HW physisch entfernt, Rules in `deleteRules`). iperf3-Server-Adresse korrigiert (`speedtest.init7.net`, nicht PBS-VM). reddit-downloader nicht in CheckMK.
- **Neu erfasst:** LVM Thin Pool (3 Grafana-Rules), DSM-Cert `login.ackermannprivat.ch` (Kuma id=85), Nomad-Node Lifecycle-/Secrets-Events (11 Loki-Rules), Guacamole (Kuma id=36, VM-basiert).
- **TOT:** Kuma-Monitor `Hollama` (id=23) aktiv obwohl Job seit 2026-05-13 entfernt -> löschen (False-Alarm-Risiko).
- **Severity-Mapping:** Bot-Referenzen auf Severity-Topics aktualisiert (VIP-Bot abgelöst); critical-Liste um MariaDB-Down / NTP-Drift / DRBD-Split-Brain / Consul-Quorum-Loss / Linstor-Auto-Unlock ergänzt; „Redis" (entfernt) aus info gestrichen.
- Offene Implementations-Punkte (fehlende Backup-Push-Monitore, csi-gc-Heartbeat, Hollama-Cleanup, Guacamole-Klärung, pve-Exporter, Per-Node-Sealed-Probe) im Coverage-Bundle [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc) / [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4).

## Verfolgte Risiken (ausserhalb Monitoring-Scope)

- **Single-NAS-Abhängigkeit** -- PBS, Linstor-S3, NFS-Mounts (jellyfin-streams, cert, logs, docker), Garage terminieren alle in 10.0.0.200. Komplettverlust bei NAS-Down. (Node-Metrik-Crons csi/lvm/nomad-health seit 2026-05-29 NFS-frei, siehe [InfluxDB & Telegraf](influxdb.md))
- **Homelab Single-PSU pve-Hosts** (Memory `project_ups_psu_2026`) -- Konsumer-Hardware, jeder Power-Loss kann FS-Korruption verursachen. Restrisiko bleibt nach USV-Aufbau
- **Corosync Single ring0** -- Network-Partition kann Quorum killen
- **gatus-watchdog ist Pseudo-extern** -- sitzt auf gleicher Hardware (pve01). Externer Watchdog `pve-01-nana` in Dottikon ist die geplante Mitigation (Plattform live seit 2026-05-01; Stack-Deployment [`86c9km53e`](https://app.clickup.com/t/86c9km53e))
- **Alert-Stack-Single-Point (Postgres/Datenbank-Layer)** -- Keep, Grafana, Authentik laufen alle auf `postgres.service.consul`, Uptime-Kuma auf `mariadb.service.consul`; beide DRBD-Single mit Affinity client-05/06. Ein Postgres- oder MariaDB-Ausfall (oder client-05/06-Verlust) killt Alert-Hub (Keep), Alert-Evaluation (Grafana), SSO (Authentik) bzw. Heartbeat-Empfang (Kuma) gleichzeitig -- der interne Dead-Man-Switch greift dann nicht. Echte Mitigation nur durch den externen Watchdog `pve-01-nana`. Coverage-Audit 2026-06-07 [`86ca5geqc`](https://app.clickup.com/t/86ca5geqc)
- **Consul-Quorum als Cluster-Nervensystem** -- Quorum-Loss -> `*.service.consul` SERVFAIL -> Grafana/Keep/Authentik (DB-Lookup) + Alloy (Loki-Lookup) gleichzeitig blind. Quorum-Loss-Alert fehlt (Layer 5)

## Severity-Mapping (kompakt)

- **critical** (Kritisch-Topic 25009): alle P0-Items mit Cluster-weitem Blast (Vault Sealed, NFS 91%, PBS-Voll, Authentik-Server-Down, LE-Cert <14d, OpenLDAP-Bind-Fail, CrowdSec-Down, Pi-hole Double-Down, Traefik-Double-Down, Cloudflare-DDNS-Failed, UDM-ICMP-Down, Garage-Down, ZFS-DEGRADED, NVMe Critical-Warning, USV Battery-Low, ZOT-Down, NFS-Synology-95-Percent, NFS-Daemon-Down (nfsd threads=0 / Port 2049 refused -- cluster-weiter Blast), gatus-watchdog-broken, Keep-Down, Telegraf-Tot, Alloy-Tot, **MariaDB-Down** (backt Kuma+Keep-Backstop), **NTP/Zeit-Drift** (bricht Vault-JWT/TLS/Consul/TOTP), **DRBD-Split-Brain** (Datenverlust-Risiko), **Consul-Quorum-Loss** (Alert-Pipeline tot), **Linstor-Auto-Unlock-Fail** (alle CSI-Volumes locked))
- **warning** (Warnung-Topic 25010): alle P1-Items (Slow-Queries, Memory-Pressure, Cardinality >80%, Cert <30d, Outpost-Disconnect, Restart-Loops, NFS-Slow, Backup-Stale, Switch-Down, Tailscale-Node-Offline, CrowdSec-Bouncer-Stale, nebula-sync-failed, ph_downloader-stale, sabnzbd-stalled)
- **info** (Info-Topic 25011, default stumm-bar): alle P2-Items (iperf3, etcd, NAS-Firmware, Cardinality-Trend, gpu-utilization)

## Verwandte Seiten

- [Monitoring](index.md) -- Komponenten-Übersicht
- [Monitoring: Strategie](strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Monitoring: Keep-Correlations](keep-correlations.md) -- Correlation-Patterns für Keep
- [CheckMK](../checkmk/index.md) -- Host-Monitoring-Details
- [InfluxDB & Telegraf](influxdb.md) -- Metriken-Pfad
- [Alloy](alloy.md) -- Log-Forwarding
- [Keep](keep.md) -- Alert-Hub
- ClickUp-Bundle [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) -- offene CheckMK-Coverage-Items Homelab
- ClickUp-Master [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab
- ClickUp Pilot [`86c9ktagw`](https://app.clickup.com/t/86c9ktagw) -- Keep Alert-Fatigue Tuning Homelab (5 Subtasks: Status-quo, Reschedule for:, Heartbeat, Auth-Correlation, 7d-Beobachtung)
- ClickUp Authentik-Track [`86c9ktajz`](https://app.clickup.com/t/86c9ktajz) -- Connection-Pool / PgBouncer Root-Cause (Parallel-Track zum Pilot)
