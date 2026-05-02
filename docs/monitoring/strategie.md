---
title: "Monitoring: Strategie"
description: Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma -- welcher Pfad fuer welche Coverage-Klasse
tags:
  - monitoring
  - strategie
  - checkmk
  - telegraf
  - loki
  - uptime-kuma
  - keep
---

# Monitoring: Strategie

Diese Seite haelt die Stack-Aufgabenteilung zwischen CheckMK, Telegraf, Loki und Uptime-Kuma fest -- welche Coverage-Klasse welchen Pfad nutzt, welche Hosts in welchem Cluster wie eingerichtet sind und welche Voraussetzungen vor Welle-3-Implementierungen erfuellt sein muessen. Quelle: Coverage-Audit 2026-04-30 + Welle-3/4-Re-Mapping. Stand: 2026-05-02.

::: info Hinweis
Diese Strategie wurde am 2026-05-01 nach dem Coverage-Audit beschlossen. Ist-Stand der Coverage in [Monitoring: Coverage](coverage.md), Correlation-Patterns in [Monitoring: Keep-Correlations](keep-correlations.md). Drift gegen diese Strategie als ClickUp-Task im jeweiligen Master-Bundle anlegen.
:::

## 1. Executive Summary

Die Empfehlung ist klar: **CheckMK bleibt das Werkzeug erster Wahl fuer alles, was klassische OS-/Hardware-/Special-Agent-Monitoring ist** (iDRAC Redfish, NAS Synology, Cisco/UniFi/OPNsense SNMP, Windows-AD, Proxmox-VE-Special-Agent, mk_smartmon, mk_zfs, mk_apt, mk_logwatch, mk_systemd). Telegraf bleibt der Pfad fuer alles **app-, container-, prometheus-metrik-getriebene** (Authentik-Outpost, Loki, Influx, Nomad, Consul, Postgres, MinIO, CSI). Loki bleibt fuer **Log-Pattern-Alerts** (acme-error, ssh-failed, vault-denied), Uptime-Kuma bleibt fuer **Push-Heartbeats und HTTP-Probes ohne Plugin-Bedarf**.

**Voraussetzung Nummer eins**: vor jedem CheckMK-Welle-3-Item muss der CheckMK->Keep-Webhook-Pfad gebaut werden. Sonst feuert CheckMK weiterhin nur in den Mail-Default (DCLab: ohne MTA tot) bzw. ueber den hardcoded Telegram-Bypass (Homelab: gegen Single-Notifier-Konvention 2026-05-01). Dieser Notifier-Pfad ist in beiden Coverage-Matrizen als P0-Item dokumentiert (`CheckMK Site monitoring/homelab`). **Das ist der eigentliche Cross-Cluster-P0**, der vor Welle 3 erledigt werden muss.

Welle-3-Re-Mapping: 6 von 11 Subtasks profitieren von CheckMK (iDRAC, vm-ad-ldap, ZFS, NAS-Synology, UDM, Telegraf-SNMP wird teilweise obsolet), 5 bleiben Telegraf/Loki/UK (pve-Exporter, watchdog-mux, Vault-Audit, OpenLDAP-BIND, CrowdSec-Container). Detail in Sektion 8.

## 2. Aktuelle Stack-Architektur

Beide Cluster identisch aufgesetzt, aber unterschiedlich befuellt:

- **Telegraf -> InfluxDB-Ops -> Grafana -> Webhook -> Keep**: app-Metriken, prom-scrapes, host-disk, host-cpu, ssh-counts. DCLab: SNMP-Block auskommentiert (alle SNMP-Targets nur via CheckMK). Homelab: SNMP fuer Synology aktiv
- **Alloy -> Loki -> Grafana LogQL -> Webhook -> Keep**: Log-Pattern-Alerts. Beide Cluster aktiv. DCLab hat einen Self-Detection-Alert (`loki-ingester-down`), Homelab keinen
- **Uptime-Kuma -> Webhook -> Keep**: Push-Heartbeats (cron-jobs), TCP/HTTP-Probes. Single-Notifier-Cleanup live seit 2026-05-01 in beiden Clustern
- **Direct -> Webhook -> Keep**: synthetische Cron-Probes, Watchdog-Skripte
- **CheckMK -> ??? -> Keep**: hier ist die Luecke. Keinerlei Webhook-Notifier konfiguriert (siehe Sektion 3+4)

Single-Notifier-Konvention (2026-05-01, Memory `project_monitoring_routing_2026_04`): jede Quelle = genau ein Webhook nach Keep. CheckMK verstoesst aktuell strukturell.

## 3. CheckMK DCLab Inventar

- Site: `monitoring`, CheckMK 2.4.0p27 CCE (Upgrade von 2.3.0p29 am 2026-05-01), vm-checkmk = 10.180.46.95, uptime nach Upgrade
- Plugin-Katalog: ~2106 mitgelieferte Checks; Standard-Plugins fuer Linux/Windows-Agent, SNMP, Special-Agents
- **Aktive Hosts** (Stand 2026-05-02, organisiert in WATO-Folders):
  - `dc-hslu/`: pve01 (renamed von `pve-00`), pve02, vm-checkmk, vm-pbs-00 (renamed von `pbs00`), vm-nomad-client-01/02/03, vm-nomad-server-01/02/03
  - `dc-hslu/idrac/`: idrac-pve01 (10.180.46.241), idrac-pve02 (10.180.46.242) -- Redfish live seit 2026-05-01, 58 Services pro Host
  - `dc-hslu/storage/`: nas-01 (10.180.46.200), nas-02 (10.180.46.210), iar-nas-01 (10.180.50.200), iar-nas-02 (10.180.50.210) -- Synology SNMP live seit 2026-05-01
  - `dc-hslu/network/`: opnsense-primary (10.180.46.14), opnsense-secondary (10.180.46.15), opnsense-vip-wan (10.180.46.16), opnsense-vip-dns (10.180.46.33), switchlab01 (10.180.46.142), routerlab (10.180.46.140) -- alle ICMP-only Reachability live
  - `dc-hslu/auth/`: vm-ad-ldap (10.180.46.235) -- ICMP-only, Windows-Agent + ad_replication ausstehend
  - `dc-hslu/services/`: ubuntu-fog-new (10.180.46.223), vm-docker-host (10.180.46.31) -- als `cmk-agent` angelegt, Agent-Install ausstehend
- **Aktive Special-Agents**: `proxmox_ve` fuer pve01 + pve02, `redfish` fuer iDRAC-Pair, `synology_health` (built-in via SNMP) fuer alle vier Synologys
- **Aktive Standard-Agents**: `cmk_update_agent`, `mk_apt`, `mk_docker`, `mk_logins` ueber Linux-Hosts
- **InfluxDB-Forwarder**: AKTIV, Ziel `http://10.180.46.223:8086` Bucket `CheckMK` Org `HSLU-DC` ueber Connection `InfluxDB_connection_Juri` -- zielt auf Influx ausserhalb des Ops-Stacks (10.180.46.83), nicht im Single-Routing-Hub
- **Notification-Konfig**: Mail-Default-Rule mit `{}`-Config (System-MTA), aber `vm-checkmk` hat KEINEN postfix installiert -- alle CheckMK-Notifications DCLab fallen ins Leere
- **Mail-Empfaenger**: contact `cmkadmin` ohne Mail-Adresse + Test-`automation` (notifications_enabled=False)
- **Severity-Modell**: CheckMK Naemon-Kern (OK / WARN / CRIT / UNKNOWN), Mapping nach Keep braucht Webhook-Translator
- **HA**: Single-Instance (vm-checkmk). Bei Site-Down: kein Failover, alle Hardware-/SNMP-Targets silent
- **Disk**: 33 GB total auf vm-checkmk, knapp werdend bei wachsender RRD-Datenmenge
- **Stand 2026-05-02 erledigt:**
  - Naming-Drift behoben (pve-00 -> pve01, pbs00 -> vm-pbs-00)
  - vm-ad-ldap als Host angelegt
  - iDRAC-Pair via Redfish live
  - Synology-Pair (Homelab + IAR) via SNMP live
  - OPNsense-Primary/Secondary/VIPs als ICMP-only Hosts angelegt
  - Stale-Cleanup (UBUNTU-ANSIBLE, DOCKER-HOST, CHECKMK-Self) durchgefuehrt
- **Offene Luecken:**
  - Kein CheckMK->Keep-Webhook-Notifier eingerichtet [`86c9knp05`](https://app.clickup.com/t/86c9knp05)
  - Mail-Default-Rule funktional tot (kein MTA)
  - vm-ad-ldap Windows-Agent + ad_replication-Plugin ausstehend [`86c9kmbr7`](https://app.clickup.com/t/86c9kmbr7)
  - ubuntu-fog-new + vm-docker-host Linux-Agent-Install ausstehend [`86c9kwvpy`](https://app.clickup.com/t/86c9kwvpy)
  - OPNsense Service-Coverage (SNMP + Community-MKP `scsitteam/checkmk_opnsense` + Alloy-syslog) [`86c9knpa2`](https://app.clickup.com/t/86c9knpa2)
  - USV DCLab Coverage (NUT oder mk_apc) -- USV-Plan offen, Memory `project_ups_psu_2026`
  - Lab-Switches SNMP-Discovery [`86c9knpa2`](https://app.clickup.com/t/86c9knpa2)

## 4. CheckMK Homelab Inventar

- Site: `homelab`, CheckMK 2.4.0p27 CCE (Upgrade von 2.3.0p23 am 2026-05-01), checkmk = 10.0.2.150, uptime nach Upgrade
- Plugin-Katalog: ~2106 Checks identisch zu DCLab
- **Aktive Hosts** (Stand 2026-05-02, flache `all_hosts`-Liste):
  - 6 Nomad-VMs: vm-nomad-server-04/05/06, vm-nomad-client-04/05/06
  - 3 PVE-Hosts: pve00, pve01, pve02
  - pve-01-nana (Tailscale 100.81.116.122) -- externer Watchdog Dottikon, ICMP-only
  - 2 Synology-NAS: synology-nas (DS2419+ Homelab), nana-nas (DS1517+ Dottikon via Tailscale) -- SNMP live seit 2026-05-01
  - pbs-backup-server (10.0.2.50) -- als `cmk-agent` angelegt
  - 2 DNS: lxc-dns-01 (10.0.2.1), lxc-dns-02 (10.0.2.2) -- als `cmk-agent` angelegt
  - 2 Traefik: vm-traefik-01 (10.0.2.21), vm-traefik-02 (10.0.2.22) -- als `cmk-agent` angelegt
  - traefik-vip (10.0.2.20), udm-pro (10.0.0.1) -- ICMP-only Reachability
  - datacenter-manager (10.0.2.60), reddit-downloader (10.0.2.72) -- als `cmk-agent` angelegt
  - homeassistant -- VM-Status-Host
  - Container-Discovery-Eintraege (~80 Eintraege im Drift-Bereich)
- **Aktive Special-Agents**: `proxmox_ve` fuer pve00/01/02 + pve-01-nana (geplant), `synology_health` fuer beide NAS
- **Aktive Standard-Agents**: identisch zu DCLab (`cmk_update_agent`, `mk_apt`, `mk_docker`, `mk_logins`)
- **InfluxDB-Forwarder**: NICHT aktiv (`influxdb_connections.mk` existiert nicht). Kein Forwarder zu Grafana-Ops
- **Notification-Konfig** (Stand 2026-05-01 vor Webhook-Migration):
  1. Telegram-Plugin `check_mk_telegram-notify.sh` mit hardcoded Token und Chat-ID -- bypasses Keep komplett, gegen Single-Notifier-Konvention
  2. Mail-Plugin (Default-Rule)
- **Postfix auf checkmk-VM**: `inet_interfaces = loopback-only`, kein Relayhost -- Mails verlassen die VM nicht
- **Mail-Empfaenger**: `cmkadmin` ohne email-Feld
- **Severity-Modell**: identisch (OK/WARN/CRIT/UNKNOWN)
- **HA**: Single-Instance (checkmk). Bei Site-Down: kein Failover
- **Stand 2026-05-02 erledigt:**
  - pve-5 orphan rules aus rules.mk entfernt
  - Stale-Cleanup (vm-proxy-dns-01, vm-vpn-dns-01, zigbee-node) durchgefuehrt
  - Synology-NAS-Pair via SNMP live
  - lxc-dns-01/02, vm-traefik-01/02, pbs-backup-server, datacenter-manager, reddit-downloader, pve-01-nana als Host angelegt
  - traefik-vip + udm-pro als ICMP-only-Host angelegt
- **Offene Luecken:**
  - Telegram-Direct-Notifier verstoesst gegen Single-Notifier 2026-05-01 [`86c9knpgj`](https://app.clickup.com/t/86c9knpgj)
  - Kein CheckMK->Keep-Webhook-Notifier eingerichtet [`86c9knpgj`](https://app.clickup.com/t/86c9knpgj)
  - Linux-Agent-Install fuer 8 cmk-agent-Hosts ausstehend [`86c9kwvtg`](https://app.clickup.com/t/86c9kwvtg)
  - UDM Pro SNMP/Syslog-Coverage [`86c9kmc3u`](https://app.clickup.com/t/86c9kmc3u)
  - UniFi Switches SNMP [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4)
  - Token im Klartext in `notifications.mk` (Token-Leak-Risiko)
  - 80 Container-Discovery-Eintraege mischen sich mit echten Hosts -- schlechte Pflegbarkeit, eigener Folder geplant

## 5. Klassifikations-Tabelle

Spalten: Item / Cluster / Layer / Aktuelle Coverage / Best-Path / Begruendung. Status laut Coverage-Audit 2026-04-30, aktualisiert wo seit 2026-05-01 implementiert.

| Item | Cluster | Layer | Coverage | Best-Path | Begruendung |
| --- | --- | --- | --- | --- | --- |
| pve01 Hardware (R740) | DCLab | L1 | partial | CheckMK | Special-Agent `proxmox_ve` + Standard-Linux-Agent decken NVMe-SMART, PSU, Fan, Temp, RAM ab |
| pve02 Hardware (R740) | DCLab | L1 | partial | CheckMK | gleicher Pfad -- `proxmox_ve` Special-Agent + mk_smartmon |
| iDRAC pve01 | DCLab | L1 | live | CheckMK | Plugin `mk_redfish` Standard ab 2.3, ideal fuer iDRAC SEL/PSU/Fan/PCIe-Fatal -- live seit 2026-05-01 |
| iDRAC pve02 | DCLab | L1 | live | CheckMK | gleicher Pfad |
| nas-01 / nas-02 / iar-nas-01/02 (Synology) | DCLab | L1 | live | CheckMK | SNMP-Built-in `synology_*` Plugins seit 2026-05-01 |
| USV DCLab | DCLab | L1 | missing | CheckMK | Plugin `mk_apc` (SNMP) -- USV-Plan offen |
| Lab-PCs (15x HP Z2) | DCLab | L1 | missing | UK-Push | Heartbeat-Probes, Lab-PCs sind keine 24/7-Targets |
| FOG-Imaging-Server | DCLab | L1 | partial | UK-Push + CheckMK | UK fuer HTTP-Probe, CheckMK fuer Disk-Volume + Linux-Standard-Agent |
| Proxmox 2-Node Cluster | DCLab | L2 | missing | CheckMK | `proxmox_ve` Special-Agent + Cluster-Quorum-Check direkt |
| ZFS rpool / rPoolHA | DCLab | L2 | missing | CheckMK | Plugin `zfsget` Standard, deckt ZED-Events + Pool-State + Scrub-Status ab |
| ZFS-Replication 19 Jobs | DCLab | L2 | missing | CheckMK + Direct-Cron | Standard-Plugin gibt keine pve-spezifische Replication-Sicht -- `pvesr status`-Cron als Direct-Webhook ergaenzt |
| HA-Manager + Watchdog | DCLab | L2 | missing | Loki + Direct | ha-crm/watchdog-mux ist Log-Pattern-Job; CheckMK-Plugin existiert nicht out-of-box |
| pve-firewall | DCLab | L2 | missing | CheckMK | mk_systemd reicht, P2 |
| DRBD/Linstor 3-Node Cluster | DCLab | L3 | partial | Telegraf | App-Metriken via prom-Endpoint, CheckMK hat kein DRBD-Plugin out-of-box |
| CSI-Health-Producer Script | DCLab | L3 | partial | Direct-Cron + Telegraf | App-spezifisch, kein CheckMK-Bedarf |
| Linstor S3 Snapshot-Backup | DCLab | L3 | missing | UK-Push | Heartbeat-Pattern, UK-Staerke |
| vm-pbs-00 Datastore | DCLab | L3 | partial | CheckMK | mk_apt + Linux-Standard reicht; PBS-Sync und Verify lokal logwatch |
| OPNsense Primary | DCLab | L4 | partial | CheckMK | SNMP-Plugins decken CARP/Daemons/Interfaces ab. ICMP-Reachability live seit 2026-05-01, Service-Coverage offen |
| OPNsense Secondary | DCLab | L4 | partial | CheckMK | analog |
| OPNsense CARP-VIPs | DCLab | L4 | partial | CheckMK ICMP + UK-Probe | Reachability live, DNS-/HTTP-Probe geplant |
| Cloudflare-Tunnel | DCLab | L4 | partial | Loki + UK | Token-Expiry-Pattern aus Logs + externes UK-Probe |
| Traefik | DCLab | L4 | partial | UK + Loki | bestehendes Pattern (kein CheckMK noetig) |
| Lab-Switches | DCLab | L4 | partial | CheckMK | SNMP-Plugins fuer Switches sind CheckMK-Staerke. ICMP-Reachability live, SNMP geplant |
| Nomad Cluster | DCLab | L5 | partial | Telegraf | `inputs.nomad` prom-scrape |
| Consul Cluster | DCLab | L5 | partial | Telegraf | `inputs.consul` prom-scrape |
| Vault Cluster | DCLab | L5 | missing | UK + Telegraf | Sealed-Probe via UK gegen `/sys/health`, prom-Metriken via Telegraf |
| Postgres-DRBD | DCLab | L5 | partial | Telegraf | `inputs.postgresql_extensible` |
| Authentik-Server | DCLab | L6 | missing | Telegraf + Loki + Direct | Heartbeat + LogQL + Connection-Storm-Threshold |
| Authentik-Outposts | DCLab | L6 | missing | Telegraf | prom-scrape `authentik_outpost_connection`, P0 cluster-uebergreifend |
| AD-LDAP (vm-ad-ldap) | DCLab | L6 | partial | CheckMK + Direct | Standard-Windows-Agent + `ad_replication`-Plugin out-of-box; LDAP-Bind-Cron als Webhook (synthetisch). Host live seit 2026-05-01 als ICMP-only |
| LE-Cert-Renewal (Traefik + ACME) | DCLab | L6 | missing | UK-Probe + Loki | Cert-Expiry via UK-HTTP-Probe (cert-days), acme-error via Loki-Pattern |
| Vault-Audit-Log | DCLab | L6 | unknown | Direct-Cron + Loki | Status-Cron + Audit-Backend via Loki |
| Cookie-Domain-Setting | DCLab | L6 | missing | Direct-Cron | 10-min-Drift-Cron, Cross-Cluster |
| Loki / InfluxDB / Grafana / Telegraf / Alloy / Keep / CheckMK / UK Self DCLab | DCLab | L7 | partial | Telegraf + UK | absent + cardinality + volume-fill + extern-probe |
| pve00 NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | mk_smartmon Standard, lm_sensors via Standard-Agent |
| pve01/02 NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | gleicher Pfad |
| pve-01-nana NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | externer Watchdog-Host bekommt CheckMK-Agent |
| USV (NUT/upsd) | Homelab | L1 | partial | CheckMK | mk_apc oder mk_nut Plugin -- Datenquelle definitiv klaeren |
| synology-nas + nana-nas | Homelab | L1 | live | CheckMK | `synology_*` Built-in Plugins live seit 2026-05-01 |
| proxmox-cluster-quorum | Homelab | L2 | partial | CheckMK | proxmox_ve Special-Agent (bereits aktiv) deckt Quorum + HA-Manager |
| proxmox-watchdog-mux | Homelab | L2 | missing | Loki + Direct-Cron | softdog-Liveness via Log-Pattern + sysctl-Cron -- kein CheckMK-Plugin |
| proxmox-zfs-rpool / scrub | Homelab | L2 | missing | CheckMK | zfsget-Plugin Standard |
| proxmox-nfs-storage | Homelab | L2 | missing | CheckMK | mk_synology + df-Plugin auf NFS-Mounts |
| proxmox-pveproxy-api | Homelab | L2 | missing | UK-Probe | HTTP-Probe :8006 |
| proxmox-host-metrics | Homelab | L2 | missing | Telegraf (pve-Exporter) | App-Metrik-Sicht via Prom-Scrape -- ergaenzend zu CheckMK Special-Agent |
| Linstor-Cluster | Homelab | L3 | partial | Telegraf + Loki | App-Metriken |
| Linstor-Backup-Pipeline | Homelab | L3 | partial | UK + Loki | Heartbeat + Errors-Pattern |
| pbs-backup-server Datastore | Homelab | L3 | partial | CheckMK | Linux-Standard-Agent + df-Plugin -- dazu PBS-Logs via Loki. Host live seit 2026-05-01, Agent-Install ausstehend |
| MinIO | Homelab | L3 | missing | Telegraf | prom-Endpoint, CheckMK hat kein MinIO-Plugin out-of-box |
| CSI-Health-Files | Homelab | L3 | partial | Direct-Cron + Telegraf | bestehend |
| Traefik (HA-Pair) | Homelab | L4 | partial | UK + Loki | bestehend, vm-traefik-01/02 als CheckMK-Host live seit 2026-05-01 |
| Pi-hole HA + Unbound (lxc-dns-01/02) | Homelab | L4 | partial | CheckMK + Direct | Linux-Standard-Agent (FTL-Pattern via Loki); double-down + nebula-sync via Direct-Cron. Hosts als `cmk-agent` angelegt seit 2026-05-01 |
| nebula-sync | Homelab | L4 | missing | UK-Push + Loki | Heartbeat + Sync-Failure-Pattern |
| UDM Pro (UniFi Gateway) | Homelab | L4 | partial | CheckMK | SNMP-Plugins fuer Edge-Devices/UniFi sind CheckMK-Staerke. ICMP-Reachability live seit 2026-05-01 |
| UniFi Switches | Homelab | L4 | missing | CheckMK | gleicher Pfad -- SNMP + Syslog-Sender |
| CrowdSec Container | Homelab | L4 | partial | Direct + Loki | Container-Up via Direct-Cron, Bouncer-Last-Pull via Loki -- kein CheckMK-Bedarf |
| Tailscale-Mesh | Homelab | L4 | missing | Direct-Cron | tailscale status -json via Cron |
| Cloudflare DDNS x2 | Homelab | L4 | partial | Loki + Direct | Pattern + IP-Vergleich-Cron |
| Keepalived (VRRP) | Homelab | L4 | live | Direct | bestehend |
| Internet-Reachability | Homelab | L4 | missing | UK-Probe | Gatus-Probes |
| Nomad / Consul / Vault Cluster | Homelab | L5 | partial | Telegraf | inputs.nomad / consul / Sealed-Probe |
| Postgres (DRBD Single) | Homelab | L5 | partial | Telegraf | inputs.postgresql |
| Authentik Server + Outposts | Homelab | L6 | partial | Telegraf + Loki + UK | bestehend, identisch DCLab |
| OpenLDAP | Homelab | L6 | missing | Direct-Cron | BIND-Test-Cron via ldapsearch -- kein CheckMK-Bedarf |
| LE-Cert ackermannprivat.ch / ackermann.systems | Homelab | L6 | missing | UK-Probe | Cert-Days |
| Vault Audit Backend / Sealed-State | Homelab | L6 | partial | Direct-Cron + UK-Probe | Audit-File-Watch + sys/health |
| Tailscale Cross-Tailnet | Homelab | L6 | missing | Direct-Cron | Member-Diff-Cron |
| Loki / InfluxDB / Grafana / Telegraf / Alloy / Keep / CheckMK / UK / Gatus Self Homelab | Homelab | L7 | partial | Telegraf + UK | absent + cardinality + volume-fill + extern-probe |
| External Watchdog Platform pve-01-nana | Homelab | L7 | partial | Direct | Stack-Deployment ausstehend [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |

Die vollstaendige Item-Tabelle steht in [Monitoring: Coverage](coverage.md) -- diese Sektion ist die kondensierte Best-Path-Sicht.

## 6. Trade-Off-Analyse

- **Pflege-Komplexitaet CheckMK**: WATO-UI gut fuer Ops, aber Konfig liegt in `.mk`-Files. Bei Bulk-Hosts (15 Lab-PCs, 80 Container) wird die `all_hosts`-Liste schnell unleserlich. Ansible-deployment moeglich aber bislang nicht im Repo. Standard-Plugins decken viel ab -- keine Eigenbau-Skripte fuer iDRAC/Synology/UniFi noetig
- **Pflege-Komplexitaet Telegraf**: Config in Repo, klare Versionierung, App-Metriken sehr gut, aber SNMP/Hardware ist mitzuwarten. DCLab hat SNMP komplett auskommentiert weil CheckMK das uebernimmt -- diese Arbeitsteilung ist gesund
- **HA-Status**: beide CheckMK-Instances Single-Instance. Bei vm-checkmk-Down sind alle Special-Agent-Hosts (Hardware, NAS, SNMP) silent. Mitigation nur via UK-Self-Probe + externer Watchdog. Telegraf laeuft als Nomad-System-Job auf 3+ Clients -- viel resilienter
- **Severity-Modell-Drift**: CheckMK Naemon hat OK/WARN/CRIT/UNKNOWN. Keep-Severity hat info/warning/critical. Mapping `CRIT->critical`, `WARN->warning`, `UNKNOWN->warning` ist Standard, aber muss im Webhook-Notifier sauber konfiguriert werden. Drift-Risiko wenn CheckMK-Plugin eigene Severity-Levels nutzt
- **Single-Notifier-Konvention**: CheckMK->Keep-Webhook ist Pflicht. Ohne das verstoesst CheckMK strukturell. Homelab-Telegram-Direct-Notifier muss VOR der CheckMK->Keep-Migration entfernt werden, sonst doppeltes Routing
- **InfluxDB-Forwarder (Performance-Daten)**: alerting-Pfad bleibt CheckMK-Core (RRD + Naemon-State + Webhook -> Keep). Severity entsteht im CheckMK-Core, nicht aus InfluxDB. Aber CheckMK 2.x kann zusaetzlich Performance-Daten an Influx streamen. Konsequenz: CheckMK-RRD bleibt notwendig (Core-State-Source), Influx ist nur ergaenzend fuer Grafana-Dashboards. Doppelte Storage akzeptabel bei der gewollten Konsolidierung der Dashboard-Sicht
- **Mail-Notification**: Default-Plugin `mail` mit `{}`-Config in beiden Clustern, aber kein MTA -- funktional tot. Sollte ersatzlos gestrichen werden, weil sonst CheckMK-User glauben, es waere noch ein Pfad da
- **Token-Security**: Homelab `notifications.mk` hat hardcoded Telegram-Token in einer Repo-tauglichen Datei. Bei Site-Backup oder Cluster-Migration wird der Token mitgesichert. Ist gegen die 1Password-Konvention

## 7. Empfehlung -- Pfad-Zuordnung

### CheckMK uebernimmt (P0-Liste)

- iDRAC pve01/pve02 (DCLab) via `mk_redfish` -- LIVE 2026-05-01
- nas-01/nas-02/iar-nas-01/02 (DCLab) via `synology_health` -- LIVE 2026-05-01
- synology-nas / nana-nas (Homelab) via `synology_health` -- LIVE 2026-05-01
- USV DCLab via `mk_apc`
- OPNsense Primary/Secondary (DCLab) via SNMP-Plugins (ICMP-only Reachability live, Service-Coverage offen)
- Lab-Switches DCLab + UniFi Switches Homelab via SNMP
- UDM Pro (Homelab) via SNMP/Syslog (ICMP-only Reachability live, SNMP offen)
- vm-ad-ldap (DCLab) via Windows-Standard-Agent + `ad_replication` (Host als ICMP-only live)
- pve02 (DCLab) `proxmox_ve` Special-Agent aktiviert
- ZFS rpool/rPoolHA (DCLab + Homelab) via `zfsget`-Plugin (alle pve-Hosts)
- NVMe-SMART pve00/01/02 + pve-01-nana (Homelab) via `mk_smartmon`

### Telegraf bleibt zustaendig

- Authentik-Server + Authentik-Outposts (App-prom-Metriken)
- Loki/InfluxDB/Grafana/Telegraf-Self/Alloy-Self (L7 Self-Monitoring)
- Nomad/Consul-Cluster (`inputs.nomad/consul`)
- Postgres-DRBD (`inputs.postgresql_extensible`)
- pve-Exporter (Homelab -- App-Metrik-Sicht zusaetzlich zu CheckMK Special-Agent)
- DRBD/Linstor-Cluster
- App-Volume-Voll
- iot-stacks
- MinIO

### Loki bleibt zustaendig

- ZED-Mail/ZFS-Events Logs (DCLab)
- HA-Manager + Watchdog-Logs
- Authentik-Sync-Webhook Stille-Detection
- Vault-Audit-Backend Pattern
- LE-Cert-Renewal acme-error
- CrowdSec CAPI-Sync
- Wiki-Build-Failure
- Cloudflared Token-Expiry

### UK-Push/UK-Probe bleibt zustaendig

- Lab-PCs (Heartbeat)
- HTTP-Probes (FOG, Spezial-VMs, IGE-Stack, License-Server)
- Cert-Expiry-Probes (LE-Cert-Days)
- Vault-Sealed-State (`sys/health`)
- Externe Watchdog-Probes (Grafana, Keep, CheckMK-Site)
- Backup-Heartbeats (linstor-snapshot, postgres-backup, etc.)
- Internet-Reachability (Gatus-Probes)

### Direct-Cron / Direct-Webhook

- Cookie-Domain-Drift-Cron
- Tailscale Cross-Tailnet Audit-Cron
- ZFS-Replication pvesr Status-Cron
- LDAP-BIND-Test-Cron (5min)
- DHCP-Discover-Probe-Cron
- Cloudflare DDNS IP-Vergleich-Cron
- proxmox-watchdog-mux Liveness-Sysctl-Cron
- traefik-certs-dumper File-mtime-Cron
- proxmox-pvesr Status-Cron
- Vault-Unseal Service `is-active`-Cron

### InfluxDB-Forwarder Empfehlung

Nicht aktivieren auf neue Influx-Ops-Instanz, solange der CheckMK->Keep-Webhook noch nicht steht. Grund: der Forwarder liefert nur Dashboard-Daten, lenkt aber von der Notifier-Kernarbeit ab. Nach CheckMK->Keep-Live:

- DCLab: bestehender Forwarder zu `10.180.46.223` ist zwar aktiv, aber zielt auf einen anderen Influx ausserhalb des Ops-Stacks -- entweder umkonfigurieren auf `10.180.46.83:8086` (Ops-Bucket `CheckMK`) oder den Forwarder als Drittsystem-Export weiterlaufen lassen und einen zweiten Forwarder zu Ops anlegen
- Homelab: keine bestehende Connection -- nach CheckMK->Keep-Live einrichten gegen `10.0.2.126:8086` Bucket `CheckMK` Org `homelab`
- Ergebnis: in beiden Clustern eine einheitliche Grafana-Dashboard-Sicht (via Ops-Influx) auf alle Performance-Daten -- Hardware via CheckMK, Apps via Telegraf, beides im gleichen Influx. Alerts bleiben in CheckMK-Core (RRD + Naemon -> Webhook -> Keep)
- Doppelte Storage akzeptiert: CheckMK behaelt RRD intern (nicht abschaltbar -- Naemon-State-Quelle), Influx ist nur ergaenzend

### Mail-Default-Rule

In beiden Clustern die `mail`-Default-Notification-Rule disablen (nicht loeschen -- sonst wirft WATO Default-Hinweise, also `disabled: True` setzen). Postfix-Migration ist out-of-scope; ohne Empfaenger-Adresse und ohne MTA ist die Rule funktional tot, aber sie suggeriert Coverage.

### Telegram-Direct-Notifier Homelab

Nach CheckMK->Keep-Live: `check_mk_telegram-notify.sh`-Rule disablen und das Token aus dem Klartext-File entfernen. Im 1Password als Backup-Eintrag falls noch nicht erfasst. Keep uebernimmt das Telegram-Routing fortan ueber die normale Source-Workflow-Logik.

## 8. Welle-3-Re-Mapping

### HSLU `86c9kmbnh` -- iDRAC Redfish-Polling

Empfehlung: **CheckMK** (`mk_redfish`-Plugin). Subtask-Scope: **erledigt 2026-05-01**, 58 Services pro Host.

### HSLU `86c9kmbr7` -- vm-ad-ldap CheckMK + LDAP-Bind-Cron

Empfehlung: **CheckMK + Direct-Cron** (Hybrid). Subtask passt schon perfekt: vm-ad-ldap (10.180.46.235) als Host live als ICMP-only seit 2026-05-01. Windows-Standard-Agent + `ad_replication`-Plugin ausstehend. LDAP-Bind-Cron via Direct-Webhook bleibt wegen synthetischer Active-User-Test.

### HSLU `86c9kmbta` -- Telegraf SNMP reaktivieren

Empfehlung: **weitgehend obsolet, wenn CheckMK uebernimmt**. NAS_01/02 -> CheckMK `synology_health` (LIVE), OPNsense Primary/Secondary -> CheckMK SNMP-Plugin (Reachability LIVE, Service-Coverage offen), Switches -> CheckMK SNMP-Plugin, iDRAC -> CheckMK `mk_redfish` (LIVE). Konsequenz: Telegraf-SNMP-Block bleibt auskommentiert im DCLab. Aufgabe statt "reaktivieren": dokumentieren warum, ggf. Subtask zurueckziehen oder in "SNMP-Datenquellen migrieren nach CheckMK" umbenennen.

### HSLU `86c9kmbun` -- ZFS Pool-State-Monitoring

Empfehlung: **CheckMK** statt ZED-Mail-Pipeline reparieren. pve01/pve02 in CheckMK haben Linux-Standard-Agent -> `zfsget`-Plugin scant Pools automatisch. ZED-Mail bleibt tot (kein MTA), aber CheckMK liefert Pool-State + Scrub-Status + DEGRADED/FAULTED ohne Mail-Pipeline.

### HSLU `86c9kmbve` -- Vault-Audit-Backend + Sealed-State-Probe

Empfehlung: **Direct-Cron + UK-Probe**. CheckMK hat kein Vault-Plugin out-of-box.
- `vault audit list` Status-Cron als Direct-Webhook
- `vault status` Sealed-Probe via UK-HTTP-Probe gegen `/sys/health`
- Audit-File-Disk-Watch via Loki-Pattern oder Telegraf-`inputs.disk` auf `audit.log`-Volume

### Privat `86c9kmc0h` -- pve-Exporter

Empfehlung: **Telegraf** (App-Metrik-Sicht), aber ergaenzt durch CheckMK Special-Agent (bereits aktiv fuer pve00/01/02). pve-Exporter -> Telegraf prom-scrape -> Influx -> Grafana-Rules. CheckMK bleibt fuer Hardware-/Cluster-/HA-State (Special-Agent). Doppelte Coverage akzeptiert weil unterschiedliche Detail-Tiefe.

### Privat `86c9kmc17` -- NAS Synology

Empfehlung: **CheckMK** statt Grafana-Alert-Rules. **erledigt 2026-05-01**: `synology_health` als Built-in fuer synology-nas (10.0.0.200) und nana-nas via Tailscale. RAID/Disk/PSU/Fan/Temp/Volume aus Built-in. Telegraf-SNMP bleibt als Datasource fuer Grafana-Dashboards (read-only). Alert-Rules wandern von Grafana nach CheckMK. 95%-Schwelle als Custom-Threshold im Plugin-Parameter.

### Privat `86c9kmc1z` -- proxmox-watchdog-mux Liveness

Empfehlung: **Loki + Direct-Cron**. CheckMK-Plugin existiert nicht out-of-box. softdog-Liveness via Log-Pattern in Alloy/Loki. Sysctl-Cron `cat /proc/devices | grep watchdog` als Direct-Webhook.

### Privat `86c9kmc3u` -- UDM Pro Coverage

Empfehlung: **CheckMK** mit SNMP + Syslog-Sender. UDM Pro (10.0.0.1) ist als ICMP-only-Host live seit 2026-05-01. SNMP-Plugins fuer UniFi (es gibt fertige `unifi`-Plugins ab CheckMK 2.3) + Syslog-Sender auf der UDM konfigurieren -> CheckMK syslog-source. Internet-Probe ergaenzt via UK gegen 1.1.1.1 + 9.9.9.9.

### Privat `86c9kmc50` -- OpenLDAP BIND-Test

Empfehlung: **Direct-Cron**. Nicht CheckMK weil `agent_ldap` nur Plus-Edition. 5min-Cron via ldapsearch direkt nach Keep-Webhook.

### Privat `86c9kmc5m` -- CrowdSec Container-Up + CAPI-Sync + Bouncer-Last-Pull

Empfehlung: **Direct-Cron + Loki**. Container-Up via mk_docker (laeuft schon, nur Discovery aktivieren) ODER Direct-Cron `docker inspect`. CAPI-Sync via Loki-Pattern. Bouncer-Last-Pull via Loki-Pattern oder LAPI-API-Cron.

## 9. Welle-4-Re-Mapping (P1-Konsolidierung)

Bundle-Subtasks HSLU `86c9kmkk0` (DCLab P1) + Privat `86c9kmkkw` (Homelab P1):

### DCLab Bundle

- Lab-PCs Heartbeat (15x HP Z2) -- UK-Push (CheckMK ueberdimensioniert fuer Heartbeats)
- FOG-Imaging-Server -- Hybrid CheckMK (Linux-Agent fuer Disk) + UK (HTTP-Probe). Host als `cmk-agent` angelegt, Agent-Install ausstehend
- CheckMK-Proxmox-Plugin (Quick-Win) -- pve01 + pve02 Special-Agent aktiviert
- DHCP-Daemon Discover-Probe -- Direct-Cron + CheckMK Linux-Agent fuer Daemon-State
- Lab-Switches ICMP-Probe -- CheckMK SNMP (statt nur ICMP). Reachability live
- Gateway-Latency `inputs.ping` -- Telegraf
- LE-Cert-Renewal Daily-Cert-Days-Cron -- UK-Probe
- Authentik-Sync-Webhook Stille-Detection -- Loki
- Renovate Heartbeat-Push -- UK
- IGE-Stack uptime-Probe -- UK
- Wiki-Sync git-rev-parse Heartbeat -- UK
- GitHub-Runner Online-Status -- Direct-Cron
- Windows-License-Server (ABB+Agisoft) TCP-Probes -- UK
- Spezial-VMs Heartbeat (qkmcalc, zund) -- UK
- Authentik-Outpost-Prometheus-Endpunkte scrapen -- Telegraf

### Homelab Bundle

- Tailscale-Mesh tailscale status -json Cron -- Direct
- Switches ICMP via CheckMK + Syslog -- CheckMK (P1 markiert)
- nebula-sync Erfolgs-Heartbeat -- UK + Loki
- Internet-Reachability Gatus-Probes -- UK
- traefik-certs-dumper File-mtime-Check -- Direct
- CSI-Health-Files Skript-Self-Heartbeat -- Direct
- NFS-Mount-Loss-Alert -- Direct + CheckMK (df-Plugin auf Mount)
- MinIO Health-Endpoint-Probe -- UK + Telegraf
- Linstor-Controller-Failover-Alert -- Telegraf
- Tailscale Cross-Tailnet HSLU/Privat Audit -- Direct
- Smart-Home HA-VM uptime-Probe -- UK
- ph_downloader stale-Alert -- Direct
- sabnzbd-stalled -- Direct
- Authentik-Sync Sync complete-Stille-Detection -- Loki
- LE-Cert <30d Gatus -- UK

## 10. Voraussetzung: CheckMK->Keep-Pfad

**Dieser Schritt ist Cross-Cluster-P0 und muss vor Welle 3 erledigt werden.** Aktuell als Subtasks angelegt: HSLU `86c9knp05`, Privat `86c9knpgj`.

Empfehlung Scope:

- HSLU "CheckMK->Keep-Webhook-Notifier (DCLab Site monitoring)":
  - WATO Notification-Rule mit Plugin `htmlmail` durch Custom-Webhook ersetzen
  - URL `https://keep.intra.dclab.ch/alerts/event/checkmk` (analog zu UK-Pattern)
  - Severity-Mapping: CRIT->critical, WARN->warning, UNKNOWN->warning, OK->suppress
  - Default-Mail-Rule disablen (kein MTA verfuegbar)
  - Keep-Provider `checkmk` registrieren
  - `correlation_key`-Label-Mapping in Keep-Workflow setzen (siehe [keep-correlations.md](keep-correlations.md))
  - Smoke-Test: WATO Test-Notification ausloesen

- Privat "CheckMK->Keep-Webhook-Notifier (Homelab Site homelab)":
  - identisch
  - URL `https://keep.ackermannprivat.ch/alerts/event/checkmk`
  - Zusaetzlich: Telegram-Direct-Rule entfernen (gegen Single-Notifier 2026-05-01)
  - Token aus `notifications.mk` raus, in 1Password als Backup

Beide Subtasks sind Vorbedingung fuer `86c9kmbnh`, `86c9kmbr7`, `86c9kmbun` (DCLab) und `86c9kmc17`, `86c9kmc3u` (Homelab).

Alternative wenn Pflege zu hoch: Telegraf-`inputs.checkmk` (Plugin existiert) gegen die CheckMK-Livestatus-API -> schreibt nach Influx -> bestehende Grafana-Webhook-Pfad zu Keep. Aber: das verschiebt das Severity-Mapping in Grafana und macht CheckMK zu einer reinen Datenquelle. Konzeptuell unsauberer als nativer Webhook.

## 11. Risiken

- **CheckMK Single-Instance**: vm-checkmk DCLab + checkmk Homelab haben kein HA. Bei VM-Down: alle Special-Agent-Targets silent (iDRAC, NAS, Switches, OPNsense, UDM). Mitigation: Externer Watchdog-Probe gegen CheckMK-Web-UI ([`86c9km53e`](https://app.clickup.com/t/86c9km53e)), Disk-Volume-Alert auf vm-checkmk (33 GB DCLab knapp werdend), omd-Status-Cron als Self-Heartbeat
- **Plugin-Pflege**: CheckMK 2.3 -> 2.4 Upgrade-Regime ist eigene Pipeline (Upgrade durchgefuehrt 2026-05-01). Bei Major-Upgrade kann ein Custom-Plugin (z.B. eigenes `mk_redfish`) brechen. Mitigation: nur Standard-Plugins nutzen, keine Custom-Plugins fuer dieses Audit
- **Severity-Mapping-Drift**: CheckMK-Plugins koennen WARN/CRIT-Schwellen via WATO geaendert werden. Wenn ein Operator einen Threshold setzt und der Webhook-Translator nicht die richtige Severity weitergibt, drift gegen Single-Notifier. Mitigation: Severity-Mapping einmal in der CheckMK->Keep-Notifier-URL hartkodieren, nicht pro Plugin
- **InfluxDB-Forwarder Cardinality-Risk**: CheckMK schreibt service_metrics als Tags pro Service+Host. Bei 95 Hosts x 10-20 Services = 1000-2000 Series. Sollte unter Cap (10000) bleiben, aber bei Container-Discovery (80 Container Homelab) wird das schnell. Empfehlung: Forwarder nach Aktivierung 7 Tage beobachten, dann Cardinality-Limit aktiv
- **Mail-Default-Rule-Falle**: solange die Mail-Rule nicht disabled ist, glauben CheckMK-User es waere ein Pfad da. Wenn jemand spaeter in WATO einen Mail-Empfaenger einsetzt, geht das ins Leere wegen MTA-Fehlen. Mitigation: Rule mit `disabled: True` markieren UND Description-Kommentar "kein MTA verfuegbar -- siehe Subtask CheckMK->Keep-Webhook"
- **Token-Klartext Homelab**: bestehender Telegram-Token in `notifications.mk` ist Repo-tauglich. Bei Site-Backup oder Cluster-Migration mitgesichert. Mitigation: nach Welle-3-Migration entfernen
- **Discovery-Drift**: 80 Container in `all_hosts` Homelab + 46 Container DCLab vermischen sich mit echten Hosts. Bei Audit-Sicht oft unleserlich. Mitigation (out-of-scope hier, eigener Subtask): Container-Discovery in eigenen Folder verschieben + Folder-Filter in Dashboards
- **Doppel-Coverage Telegraf+CheckMK**: pve-Exporter (Telegraf) + proxmox_ve Special-Agent (CheckMK) liefern beide Proxmox-Daten. Akzeptiert weil unterschiedliche Detail-Tiefe. Risiko: zwei Alert-Pfade fuer das gleiche Problem (z.B. CPU-Last). Mitigation: Alert-Rules in Telegraf nur fuer Counter/Rates, in CheckMK nur fuer State/Health

## Verwandte Doku

- [Monitoring](index.md) -- Komponenten-Uebersicht
- [Monitoring: Coverage](coverage.md) -- Ist-Stand-Coverage SSOT mit allen Items
- [Monitoring: Keep-Correlations](keep-correlations.md) -- Correlation-Patterns fuer Keep
- [Monitoring: Betrieb](betrieb.md) -- Eskalation und Incident-Workflow
- ClickUp Privat [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab
- ClickUp Privat [`86c9knpgj`](https://app.clickup.com/t/86c9knpgj) -- CheckMK->Keep-Webhook Homelab (Vorbedingung Welle 3)
- ClickUp Privat [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) -- CheckMK-Coverage-Bundle Homelab
- ClickUp HSLU [`86c9jqvtj`](https://app.clickup.com/t/86c9jqvtj) -- Welle-3-Master DCLab (Cross-Cluster-Sicht)

Memory-Pointer: `project_monitoring_routing_2026_04`, `project_monitoring_rollout_2026_04`, `feedback_no_cross_cluster_coupling`, `feedback_keep_workflow_first_match`, `feedback_keep_workflow_yaml_upload`, `feedback_nas_storage_threshold_95`, `feedback_authentik_pg_connection_storm`, `project_checkmk_strategy_2026_05_01`, `project_checkmk_2026_05_01_upgrade`, `feedback_checkmk_keep_webhook_keephq_script`, `feedback_checkmk_synology_snmp_builtin`
