---
title: "Monitoring: Coverage"
description: Single Source of Truth fuer die Homelab-Monitoring-Coverage -- pro Item welcher Pfad, welcher Status, welche offene Luecke
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

Diese Seite ist die **Single Source of Truth** fuer den Ist-Zustand der Homelab-Monitoring-Coverage. Sie listet pro Layer jedes Item mit Adresse, Pfad, Status, Prioritaet, Silent-Fail-Risiko und ClickUp-Task. Architektur-Hintergrund in [Monitoring](index.md), Komponenten in [Monitoring: Referenz](referenz.md), Eskalation in [Monitoring: Betrieb](betrieb.md), Strategie in [Monitoring: Strategie](strategie.md), Keep-Correlation-Patterns in [Monitoring: Keep-Correlations](keep-correlations.md). Stand: 2026-05-02.

::: info Single Source of Truth
Diese Tabelle ist der Pflege-Punkt fuer Coverage-Status. Andere Agenten, die Drift erkennen oder neue Coverage einrichten, aktualisieren **diese** Seite -- nicht die Audit-Files (sind eingefroren) und nicht andere Wiki-Seiten. Offene Arbeit gehoert in den ClickUp-Master [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4). Wiki-Aenderungen erfolgen erst nach Implementation.
:::

## Pflege-Konvention

- **Status-Aenderung** -- bei Implementierung Eintrag von `missing` oder `partial` auf `live` updaten, ClickUp-Task schliessen, Datum in `Notes` eintragen
- **Neuer Drift erkannt** -- Eintrag bleibt `live`, im Feld `Notes` Drift kurz beschreiben, ClickUp-Task im Master-Bundle anlegen, Task-ID in Spalte `Task` setzen
- **Neuer Host / neue Komponente** -- neue Zeile in der passenden Layer-Tabelle, Status `missing` oder `partial`, ClickUp-Task verlinken
- **Status-Werte:** `live` (vollstaendig ueberwacht + alarmiert) -- `partial` (gepollt aber nicht alarmiert oder Coverage unvollstaendig) -- `missing` (kein Pfad konfiguriert) -- `skip` (bewusst nicht ueberwacht, mit Begruendung)
- **Prio-Werte:** `P0` (silent-fail mit hohem blast) -- `P1` (mittlerer blast) -- `P2` (nice-to-have)
- **Pfad-Spalte:** `checkmk` -- `influx` (Telegraf+InfluxDB+Grafana) -- `loki` (Loki+Alloy+Grafana) -- `uptime` (Uptime-Kuma) -- `direct` (Direct-Webhook nach Keep) -- `none` (kein Pfad)

## Storage-Schwellen-Konvention

Disk-Full-Alerts unterscheiden zwei Storage-Klassen:

- **Backup/NAS-Storage** (PBS-Datastore, MinIO, NFS-Backup-Mounts, Synology-Volumes): Critical 95%, optional Warning 90%. Backup-Storage darf voll laufen, kontrolliertes Erreichen ist akzeptabel
- **Live-Storage** (DRBD/Linstor-Volumes fuer Apps wie `loki-data`, `influxdb-data`, `keep-data`): Warning 75%, Critical 90%. Live-Volumes haben FS-Korruptions-Risiko bei Voll

PBS bei 91% (Stand 2026-04-30) liegt damit unter der 95%-Schwelle und ist kein akuter Incident, sondern ein P0-Item fuer Threshold-Setup + Massnahme bei Erreichen. Ableitung dieser Konvention im Memory `feedback_nas_storage_threshold_95`.

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
| pve-01-nana Power-Loss | pve-01-nana | influx | missing | P0 | DeskMini Single-PSU, keine USV im Standort Dottikon | `smart_unsafe_shutdowns delta`-Alert + USV-Erweiterung Standort pruefen. Memory `project_ups_psu_2026` |
| USV (NUT/upsd) | Producer unbekannt | influx | partial | P0 | `upsd`-Measurement-Quelle unbekannt | UPS-Alerts waeren auf toter Datenquelle. Pipeline-Investigate + Alerts bauen |
| synology-nas (Homelab DS2419+) | 10.0.0.200 | checkmk SNMP | live | P0 | -- | Built-in synology_* Plugins seit 2026-05-01 (RAID/Disk/PSU/Fan/Temp/Volumes/CPU/RAM/IF) |
| nana-nas (Dottikon DS1517+) | via Tailscale | checkmk SNMP | live | P0 | -- | analog. CheckMK-VM hat Tailscale-Client mit `tag:homelab` und `--accept-routes` |
| iperf3-Server | 10.0.2.50:5201 (PBS-VM) | uptime | missing | P2 | Service-tot silent | undokumentiert wer Client ist |

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
| proxmox-corosync-ring | network 10.0.2.x | none | missing | P1 | Single ring0 -- Network-Partition koennte Quorum killen | strukturelle Empfehlung `ring1_addr` |
| proxmox-zfs-scrub | pve00/01/02 | direct | missing | P1 | scrub-fail silent | `zpool status`-Cron |
| proxmox-host-metrics | pve00/01/02 | influx | missing | P0 | komplett silent (kein pve-Exporter) | pve-Exporter installieren [`86c9kmc0h`](https://app.clickup.com/t/86c9kmc0h) |
| pve-01-nana zfs-rpool | pve-01-nana | none | missing | P1 | DEGRADED/FAULTED silent auf externem Watchdog | ZED-Mail + zpool-status-Cron |
| pve-01-nana zfs-scrub | pve-01-nana | direct | missing | P1 | scrub-fail silent | `zpool status`-Cron |
| pve-01-nana pveproxy-api | pve-01-nana:8006 | uptime | missing | P1 | API-Down silent | HTTP-Probe `:8006` ueber Tailscale-IP |
| pve-01-nana host-metrics | pve-01-nana | checkmk + influx | partial | P0 | komplett silent, CheckMK-Agent + Alloy + Telegraf noch nicht deployed | Host als `cmk-agent` angelegt am 2026-05-01. Ansible-Plays `06-checkmk-agent.yml` + `deploy-alloy-proxmox.yml` mit `--limit pve-01-nana` ueber Inventory-Gruppe `proxmox_external` ausstehend [`86c9kwvtg`](https://app.clickup.com/t/86c9kwvtg) |

## Layer 3 -- Storage (DRBD / Linstor / NAS / Backup)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Linstor-Cluster (Controller + Satellites) | c04/c05/c06 + drbd-reactor | influx + loki | partial | P1 | Controller-Failover silent | Linstor-Node-Offline + DRBD-Out-of-Sync abgedeckt; Failover-Alert fehlt |
| Linstor-Backup-Pipeline | cron c05+c06 + Uptime-Kuma | uptime + loki | partial | P0 | Partial-Failure mit `Errors > 0` wird nicht alarmiert | Heartbeat sieht nur 0-vs-mehr; LogQL-Pattern auf `Errors: [1-9]` fehlt |
| pbs-backup-server (Datastore) | 10.0.2.50 | checkmk + direct | partial | P0 | Datastore 91% USED silent (95% Critical / 90% Warning); Postfix kein Relayhost konfiguriert (legacy-sendmail-Notifications silent) | Host als `cmk-agent` angelegt. Agent-Install ausstehend. df-Plugin fuer Datastores + Loki-Pattern fuer PBS-Sync/Verify-Fehler folgen [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) |
| synology-nas (Linstor-S3 + NFS-Mounts) | 10.0.0.200 | checkmk SNMP | live | P2 | -- | RAID/Volume/SMART/Temp covered seit 2026-05-01 (built-in Plugins). Power-Status-Change + DSM-Upgrade als Nice-to-have |
| MinIO | 10.0.0.200:9000 | none | missing | P1 | Health-Endpoint nicht gepingt; nur 24h-Backup-Heartbeat-Verzoegerung | Linstor-S3 indirekt, aber MinIO selbst nicht. Memory `reference_minio_nas` |
| CSI-Health-Files | csi-health-metrics.sh c05+c06 | influx | partial | P1 | Skript-tot/NFS-Mount-Loss silent | Stale-Mount + Plugin-Socket abgedeckt; Skript-Self-Heartbeat fehlt. Memory `project_csi_health_monitoring_2026_04_30` |
| NFS-Mount-Pipeline | 5 Mounts pro Storage-Node + PBS | none | missing | P1 | Mount-Loss silent; Staleness-Pattern fehlt | indirekt ueber csi-health, aber kein dedizierter Mount-Loss-Alert |
| iperf3-Server | PBS userspace | none | missing | P2 | -- | wofuer? wer ist Client? |

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
| UniFi Switches (10.0.0.172, .181, .184-.186) | mehrere IPs | none | missing | P1 | Reboots/PoE/Port-Flapping silent | ICMP via CheckMK + Syslog-Sender konfigurieren. UniFi-Controller liefert ergaenzend SDK-Daten |
| Access Points (10.0.0.191-.197) | mehrere IPs | none | skip | P2 | -- | Coverage ueber Unifi-Controller; eigenstaendige CheckMK-Hosts nicht vorgesehen |
| CrowdSec | Container vm-traefik-01 | loki | partial | P1 | Bouncer-Stale + Container-Crash silent (Fail-Open) | Bouncer-Last-Pull-Heartbeat + Container-Up-Alert; 3 stale Bouncers, kein Repo-Doku [`86c9kmc5m`](https://app.clickup.com/t/86c9kmc5m) |
| Tailscale-Mesh | vm-traefik-01/02 + 8 Nodes | none | missing | P1 | Node-Offline silent, Cross-Tailnet HSLU/Privat ungeprueft | Cron-Probe `tailscale status -json`. Memory `reference_tailscale_tailnet`, `feedback_tailscale_ping_ignores_acls` |
| Cloudflare DDNS x2 | Container vm-traefik-01 | loki | partial | P0 | Update-Fehler silent, IP-Drift unbemerkt | Loki-Pattern + IP-Vergleich-Cron |
| Keepalived (VRRP) | vm-traefik-01/02 | direct | live | P1 | -- | Multi-MASTER-Detection + Flap-Detection ergaenzen |
| traefik-certs-dumper | Container vm-traefik-01/02 | none | missing | P1 | Cert-Files veralten silent | File-mtime-Check via Cron |
| nginx-error-page | Container vm-traefik-01/02 | none | missing | P2 | -- | Container-Up-Check |
| Internet-Reachability | extern | none | missing | P1 | Cert-Renewal/CF-API/Service-Erreichbarkeit kaskadierend | Gatus-Probes 1.1.1.1 + 9.9.9.9 + DNS-Resolve |

## Layer 5 -- Platform (Nomad / Consul / Vault / Postgres)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| vm-nomad-server-04/05/06 | 10.0.2.104/.105/.106 | checkmk + influx | partial | P0 | Job-Crashloop silent, Server-Metriken fehlen | CheckMK Standard-Agent live. `inputs.nomad` Plugin nachruesten |
| vm-nomad-client-04/05/06 | 10.0.2.124/.125/.126 | checkmk + influx | partial | P0 | analog | CheckMK Standard-Agent + Docker-Piggyback live. Reschedule-Storm-Detection via Telegraf-File-Input live seit 2026-05-01. Linstor-CSI-Health auf c05/c06 |
| Consul Cluster | vm-nomad-server-04/05/06 | influx | partial | P1 | Quorum-Loss kein Alert, Backup-HB OK | Telegraf-Prometheus auf `:8500` |
| Vault HA Cluster | vm-nomad-server-04/05/06 | influx | missing | P0 | Sealed silent bis App-Failure | Sealed-Alert + Synthetic-Heartbeat. Memory `reference_vault_unseal_token_on_disk` |
| etcd Server-Cluster (Legacy?) | vm-nomad-server-04/05/06 | none | missing | P2 | -- | vermutlich Decommissioning -- erst Verifikation, dann ab oder monitor |
| Postgres (DRBD Single, Affinity c05) | vm-nomad-client-06 | influx | partial | P0 | Connection-Pool-Storm bekannt | `inputs.postgresql` + Synthetic-Probe. Memory `feedback_authentik_pg_connection_storm`, `project_pg_storage_bottleneck_2026` |
| Postgres-Backup | Nomad batch-job 03:00 | uptime | partial | P1 | Validity-Check fehlt | `pg_restore --list` integrieren |
| Consul-Snapshot-Backup | Nomad batch-job 01:45 | uptime | live | P2 | -- | Validity gzip-magic-byte ok; Restore-Test ergaenzen |
| Nomad-Snapshot-Backup | Nomad batch-job 01:30 | uptime | partial | P1 | Restore-Test fehlt | analog |
| Vault-Backup | Nomad batch-job 02:00 | uptime | partial | P1 | Restore-Test fehlt | analog |
| InfluxDB-Backup | Nomad batch-job 03:30 | none | missing | P0 | komplett silent! | Uptime-Kuma-Push hinzufuegen |
| Renovate | Nomad batch-job 05:00 | uptime | live | P2 | -- | HB existiert |
| Redis-ZOT | Nomad service | none | missing | P2 | OOM silent | `inputs.redis` |

## Layer 6 -- Auth / Security (Authentik / Certs / Audit-Logs)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Authentik Server | identity/authentik.nomad@c05 | influx + loki | partial | P0 | Down = alle Apps tot, kein Alert | Gatus-Probe + Outpost-Connection-Alert + PG-Storm-Threshold. Memory `project_authentik_cookie_domain` |
| Authentik Outposts (Proxy + LDAP) | identity/authentik.nomad@c05 | influx | partial | P0 | `outpost_connection`-Drop nicht alarmiert; gescraped aber keine Alert-Rule | `authentik_outpost_connection==0` -> Influx-Alert |
| OpenLDAP | databases/open-ldap.nomad@c05 | none | missing | P0 | TCP-Check truegerisch, kein BIND-Test | Cron-Bind-Test 5min direct [`86c9kmc50`](https://app.clickup.com/t/86c9kmc50) |
| LE-Cert-Renewal `ackermannprivat.ch` | traefik:v3.4@vm-traefik-01 | none | missing | P0 | 60-89 Tage silent fail | Gatus cert-expiration <30d/<14d |
| LE-Cert-Renewal `ackermann.systems` | traefik:v3.4@vm-traefik-01 | none | missing | P0 | gleiche, evtl. ungenutzt? Cookie-Domain Drift gegen `ackermannprivat.ch` | Gatus cert-expiration; Login-Fluss pruefen |
| Vault Audit Backend | vault.service@nomad-server-04 | none | unknown | P0 | Enabled-Status unverifiziert | Cron `vault audit list` + Audit-File-Disk-Watch |
| Vault Sealed-State | vault.service | partial | partial | P0 | nur nach Restart-Loops kritisch | Gatus `sys/health` |
| CrowdSec | crowdsec@vm-traefik-01 | none | missing | P0 | Container-tot = WAF-tot silent (Fail-Open) | docker-status + CAPI-Sync-Pattern in Loki [`86c9kmc5m`](https://app.clickup.com/t/86c9kmc5m) |
| Tailscale (Cross-Tailnet HSLU/Privat) | tailscaled@vm-traefik-01 | none | missing | P1 | Cross-Tailnet-Drift unwatched; HSLU-Geraete in Privat-Tailnet | systemd-status + Member-Diff-Cron |
| traefik-certs-dumper | Container @vm-traefik-01 | partial | partial | P1 | mtime-Drift unwatched | Cron-Diff `acme.json` vs `/nfs/cert` |
| Authentik-Audit-Job (Drift) | batch-jobs/authentik-audit.nomad | direct | partial | P2 | direct-Telegram statt Keep-Pfad (`TELEGRAM_RELAY_URL=http://telegram-relay.service.consul:9095/notify`) -- Drift gegen Memory `project_monitoring_routing_2026_04` | umstellen auf Keep-Pfad |

## Layer 7 -- Observability self-monitoring

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Loki Homelab | monitoring/loki.nomad -> 10.0.2.126:3100, drbd1010 13% voll | influx + uptime | missing | P0 | WAL-voll silent, Cardinality-Explosion silent (default 5000 streams, aktuell 471), kein Self-Detection-Alert | DCLab-Pattern (`loki-ingester-down` Absent-Alert) portieren |
| InfluxDB Homelab | 10.0.2.126:8086, drbd1002 14% voll | influx + uptime | partial | P0 | `noDataState=NoData` Default macht alle Influx-Down-Szenarien silent | `noDataState=Alerting`, Volume-Fill, Task-Failure. Memory `feedback_grafana_nodatastate_per_query_type` |
| Grafana Homelab | -- | direct + uptime | partial | P0 | Henne-Ei -- wenn Grafana tot, fehlen alle Alert-Trigger | externer Watchdog-Probe Pflicht |
| Telegraf Homelab (system-Job) | system network=host | influx | missing | P0 | Telegraf-tot bedeutet alle Metriken weg, kein Absent-Alert | absent-Pattern (Synology-SNMP fuer NAS aktiv) |
| Alloy Homelab (system-Job) | -- | influx | partial (Consul-Health) | P0 | Crash silent, Log-Pattern-Alerts feuern nicht | absent-Pattern + Push-Fail-Detection |
| Keep Homelab (Single-Point-of-Routing) | -- | direct extern | missing | P0 | KRITISCH -- wenn Keep tot, geht JEDER Alert verloren; kein externer Heartbeat | Externer Watchdog auf pve-01-nana (Dottikon). Plattform live seit 2026-05-01, Stack-Deployment offen [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |
| vm-checkmk Homelab (Site `homelab`) | 10.0.2.150 | checkmk + uptime | partial | P0 | Site-Down silent | CheckMK Self-Monitoring live. Externer UK-Probe als Site-Down-Detection via pve-01-nana geplant |
| Uptime-Kuma Homelab | -- | direct | partial | P1 | -- | absent + Disk-Warn |
| Gatus Nomad Homelab | -- | direct | partial | P1 | externer-Watchdog-Doppelung mit LXC-100 | Endpoint-Liste erweitern |
| gatus-watchdog LXC-100 | pve01 LXC | direct | broken | P0 | UNHEALTHY 40h+, kein Alert | wget fehlt im Image, Probe-Schema-Bug. Wird durch externen Proxmox abgeloest |
| External Watchdog Platform pve-01-nana | pve-01-nana (Dottikon) | none | partial | P0 | Plattform live (Tailscale 100.81.116.122, PVE 9.1.9), Watchdog-Stack noch nicht deployed | Hardware-Bring-up done 2026-05-01; Stack (Keep + Grafana + CheckMK) als Folge-Task [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |
| InfluxDB-Tasks 1y/5y Downsampling | -- | influx | missing | P1 | Task-Failure silent, raw-Buckets wachsen | Task-Failure-Poll |

## Layer 8 -- Apps (Homelab-spezifisch)

| Item | Adresse | Pfad | Status | Prio | Silent-Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| App-Productivity-Stack (gitea, vaultwarden, paperless, kimai, n8n, obsidian-livesync, dbgate, metabase, solidtime, tandoor, vitepress-wiki) | nomad-jobs/services + databases | uptime + influx + loki | partial | P0 | container-up-but-app-broken silent (kimai-untrusted-host-loop, vaultwarden-heartbeat fehlt) | granulare Health-Probes |
| App-AI/LLM (ollama, open-webui, hollama, paperless-ai/gpt) | nomad-jobs/services | influx + direct | missing | P0 | external-api-cost-spike silent (Scrapfly + Anthropic + OpenAI) | Cost-Cap-Alerting |
| Smart-Home (homeassistant-VM, zigbee2mqtt, mosquitto-Pair) | vm:1000 + nomad-jobs/services | uptime + influx + loki | partial | P1 | HA-VM-down silent fail | uptime-kuma-Probe gegen `:8123` |
| Media-Stack (Arr-x9 + Jellyfin-Trio + Stash-Trio + YT-Downloader-x4) | nomad-jobs/media | influx + loki + direct | partial | P0 | container-up-but-app-broken silent (`special-youtube-dl + youtube-dl` Crash-Loop auf c05 ohne Alert) | NFS-Synology-91-Percent akut, Consul-critical-Forwarding fehlt |
| Tools/Misc (flame, changedetection, directus-gravel, immo-monitor, immoscraper, notifiarr, telegram-relay, phdler-bot, guacamole) | nomad-jobs/services | direct + loki | partial | P0 | immoscraper-weekly silent fail | weekly-batch-heartbeat fehlt, scrapfly-cost-cap fehlt. Memory `project_immoscraper_scrapfly` |
| Infrastructure-Apps (zot-registry, github-runner, nebula-sync, smtp-relay, filebrowser, redis-zot) | nomad-jobs/infrastructure | direct + loki | partial | P0 | zot-registry-down breaks alloc-pulls silent | zot-heartbeat fehlt, smtp-tx-error-rate fehlt |
| Batch-Jobs (renovate, postgres-backup, vault-backup, consul-snapshot, nomad-snapshot, influxdb-backup, daily_*, docker_prune, dns-performance, ph_downloader, reddit_*-Trio, zot-verify, authentik-audit, immoscraper-weekly) | nomad-jobs/batch-jobs | direct + influx | missing | P0 | batch-job-failed silent | postgres-backup-stale-Alert fehlt, renovate-3-runs-failed fehlt |
| datacenter-manager (PDM Cross-Cluster) | 10.0.2.60 | checkmk + uptime | partial | P1 | -- | Host als `cmk-agent` angelegt. Agent-Install ausstehend. UK HTTP-Probe separat [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) |
| reddit-downloader | 10.0.2.72 | checkmk | missing | P2 | -- | Host als `cmk-agent` angelegt. Agent-Install ausstehend. low prio |

## Bewusst nicht ueberwacht (skip)

- **Endgeraete im Device-VLAN** (10.0.10.0/24) -- bewusst nicht ueberwacht (Mobile/Desktops, kein 24/7-Charakter)
- **Gaeste-VLAN** (10.0.30.0/24) -- bewusst nicht ueberwacht
- **Access Points einzeln** -- via Unifi-Controller abgedeckt, kein eigener CheckMK-Host pro AP

::: info Begruendung skip
Endgeraete und Gaeste-VLAN sind nicht 24/7 produktiv und werden bewusst nicht ueberwacht. Access Points sind ueber den Unifi-Controller abgedeckt und benoetigen keinen eigenstaendigen CheckMK-Host.
:::

## Cross-Layer-Konflikte (geklaert 2026-05-01)

- **Postfix-Relayhost auf PBS Homelab** -- bestaetigt: kein Relayhost konfiguriert auf 10.0.2.50. PBS-Notifications via legacy-sendmail bleiben silent. Layer-3-Eintrag P0
- **`authentik-audit.nomad` Drift** -- bestaetigt: Job ruft direkt `http://telegram-relay.service.consul:9095/notify`, nicht ueber Keep-Hub. Drift gegen Memory `project_monitoring_routing_2026_04`. Layer-6-Eintrag P2
- **Naming-Drift `pve-5`** -- behoben am 2026-05-01: pve-5 orphan rules aus Homelab `rules.mk` entfernt
- **Stale-Hosts** -- behoben am 2026-05-01: vm-proxy-dns-01, vm-vpn-dns-01, zigbee-node aus CheckMK `all_hosts` geloescht

## Open Questions

- **CrowdSec ohne Repo-Doku, 3 stale Bouncers** -- drift gegen LAPI. Documentation-Backlog
- **Tailscale Cross-Tailnet HSLU/Privat** -- HSLU-Geraete in Privat-Tailnet, Risiko-relevant aber nicht monitort. Cross-cluster-Item
- **NAS HyperBackup-Schedule** -- Off-Site-Strategie fuer NAS-Inhalt selbst unbekannt
- **PBS-Storage 91% USED** -- bei NAS-95%-Schwelle nicht akut, aber Threshold-Setup + Retention-Strategie + ggf. NAS-Erweiterung muessen vor Erreichen der 95% definiert sein [`86c9kk10u`](https://app.clickup.com/t/86c9kk10u)
- **iperf3-Server auf PBS** -- wofuer? wer ist Client?
- **gatus-watchdog LXC-100 Endpoints-Liste** -- inkludiert er bereits L7-Komponenten?
- **External LLM-API Cost-Cap** -- Scrapfly + Anthropic + OpenAI Spike-Detection
- **Reddit-Downloader VM dead** -- P2-Cleanup-Item
- **HomeAssistant SSH-Setup** -- nicht via Standard-SSH erreichbar
- **Authentik-Outpost-Metrics scrapen ja, aber keine Alert-Rule** -- Layer-7-Luecke (Rules), nicht Layer-6 (Scrape)

## Verfolgte Risiken (ausserhalb Monitoring-Scope)

- **Single-NAS-Abhaengigkeit** -- PBS, Linstor-S3, NFS-Mounts (csi-health, jellyfin-streams, cert, logs, docker), MinIO terminieren alle in 10.0.0.200. Komplettverlust bei NAS-Down
- **Homelab Single-PSU pve-Hosts** (Memory `project_ups_psu_2026`) -- Konsumer-Hardware, jeder Power-Loss kann FS-Korruption verursachen. Restrisiko bleibt nach USV-Aufbau
- **Corosync Single ring0** -- Network-Partition kann Quorum killen
- **gatus-watchdog ist Pseudo-extern** -- sitzt auf gleicher Hardware (pve01). Externer Watchdog `pve-01-nana` in Dottikon ist die geplante Mitigation (Plattform live seit 2026-05-01; Stack-Deployment [`86c9km53e`](https://app.clickup.com/t/86c9km53e))

## Severity-Mapping (kompakt)

- **critical** (VIP-Bot): alle P0-Items mit Cluster-weitem Blast (Vault Sealed, NFS 91%, PBS-Voll, Authentik-Server-Down, LE-Cert <14d, OpenLDAP-Bind-Fail, CrowdSec-Down, Pi-hole Double-Down, Traefik-Double-Down, Cloudflare-DDNS-Failed, UDM-ICMP-Down, MinIO-Down, ZFS-DEGRADED, NVMe Critical-Warning, USV Battery-Low, ZOT-Down, NFS-Synology-95-Percent, gatus-watchdog-broken, Keep-Down, Telegraf-Tot, Alloy-Tot)
- **warning** (Standard-Bot): alle P1-Items (Slow-Queries, Memory-Pressure, Cardinality >80%, Cert <30d, Outpost-Disconnect, Restart-Loops, NFS-Slow, Backup-Stale, Switch-Down, Tailscale-Node-Offline, CrowdSec-Bouncer-Stale, nebula-sync-failed, certs-dumper-stale, ph_downloader-stale, sabnzbd-stalled)
- **info** (nur Dashboard): alle P2-Items (iperf3, etcd, Redis, NAS-Firmware, Cardinality-Trend, gpu-utilization)

## Verwandte Doku

- [Monitoring](index.md) -- Komponenten-Uebersicht
- [Monitoring: Strategie](strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Monitoring: Keep-Correlations](keep-correlations.md) -- Correlation-Patterns fuer Keep
- [CheckMK](../checkmk/index.md) -- Host-Monitoring-Details
- [InfluxDB & Telegraf](influxdb.md) -- Metriken-Pfad
- [Alloy](alloy.md) -- Log-Forwarding
- [Keep](keep.md) -- Alert-Hub
- ClickUp-Bundle [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) -- offene CheckMK-Coverage-Items Homelab
- ClickUp-Master [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab
