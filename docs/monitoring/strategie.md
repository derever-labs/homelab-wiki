---
title: "Monitoring: Strategie"
description: Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma -- welcher Pfad für welche Coverage-Klasse
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

Diese Seite hält die Stack-Aufgabenteilung zwischen CheckMK, Telegraf, Loki und Uptime-Kuma fest -- welche Coverage-Klasse welchen Pfad nutzt und welche Hosts in welchem Cluster wie eingerichtet sind.

::: info Hinweis
Ist-Stand der Coverage in [Monitoring: Coverage](coverage.md), Correlation-Patterns in [Monitoring: Keep-Correlations](keep-correlations.md). Drift gegen diese Strategie als ClickUp-Task im jeweiligen Master-Bundle anlegen.
:::

## 1. Executive Summary

Die Empfehlung ist klar: **CheckMK bleibt das Werkzeug erster Wahl für alles, was klassische OS-/Hardware-/Special-Agent-Monitoring ist** (iDRAC Redfish, NAS Synology, Cisco/UniFi/OPNsense SNMP, Windows-AD, Proxmox-VE-Special-Agent, mk_smartmon, mk_zfs, mk_apt, mk_logwatch, mk_systemd). Telegraf bleibt der Pfad für alles **app-, container-, prometheus-metrik-getriebene** (Authentik-Outpost, Loki, Influx, Nomad, Consul, Postgres, Garage, CSI). Loki bleibt für **Log-Pattern-Alerts** (acme-error, ssh-failed, vault-denied), Uptime-Kuma bleibt für **Push-Heartbeats und HTTP-Probes ohne Plugin-Bedarf**.

CheckMK feuert Alerts erst dann an Keep, wenn der CheckMK->Keep-Webhook-Pfad gebaut ist; bis dahin landen Notifications im Mail-Default (DCLab: ohne MTA tot) bzw. über den hardcoded Telegram-Bypass (Homelab: gegen Single-Notifier-Konvention). Dieser Notifier-Pfad ist der strukturelle Bruch der CheckMK-Integration.

## 2. Aktuelle Stack-Architektur

Beide Cluster identisch aufgesetzt, aber unterschiedlich befüllt:

- **Telegraf -> InfluxDB-Ops -> Grafana -> Webhook -> Keep**: app-Metriken, prom-scrapes, host-disk, host-cpu, ssh-counts. DCLab: SNMP-Block auskommentiert (alle SNMP-Targets nur via CheckMK). Homelab: SNMP für Synology aktiv
- **Alloy -> Loki -> Grafana LogQL -> Webhook -> Keep**: Log-Pattern-Alerts. Beide Cluster aktiv. DCLab hat einen Self-Detection-Alert (`loki-ingester-down`), Homelab keinen
- **Uptime-Kuma -> Webhook -> Keep**: Push-Heartbeats (cron-jobs), TCP/HTTP-Probes. Single-Notifier-Cleanup live in beiden Clustern
- **Direct -> Webhook -> Keep**: synthetische Cron-Probes, Watchdog-Skripte
- **CheckMK -> ??? -> Keep**: hier ist die Lücke. Kein Webhook-Notifier konfiguriert (siehe CheckMK-Inventar unten)

Single-Notifier-Konvention (Memory `project_monitoring_routing_2026_04`): jede Quelle = genau ein Webhook nach Keep. CheckMK verstösst aktuell strukturell.

## 3. CheckMK DCLab Inventar

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

## 4. CheckMK Homelab Inventar

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
- **InfluxDB-Forwarder**: nicht aktiv (`influxdb_connections.mk` existiert nicht). Kein Forwarder zu Grafana-Ops
- **Notification-Konfig**:
  1. Telegram-Plugin `check_mk_telegram-notify.sh` mit hardcoded Token und Chat-ID -- bypasses Keep komplett, gegen Single-Notifier-Konvention
  2. Mail-Plugin (Default-Rule)
- **Postfix auf checkmk-VM**: `inet_interfaces = loopback-only`, kein Relayhost -- Mails verlassen die VM nicht
- **Mail-Empfänger**: `cmkadmin` ohne email-Feld
- **Severity-Modell**: identisch (OK/WARN/CRIT/UNKNOWN)
- **HA**: Single-Instance (checkmk). Bei Site-Down: kein Failover

## 5. Klassifikations-Tabelle

Spalten: Item / Cluster / Layer / Aktuelle Coverage / Best-Path / Begründung. Status laut Coverage-Audit (Ist-Stand siehe [Monitoring: Coverage](coverage.md)).

| Item | Cluster | Layer | Coverage | Best-Path | Begründung |
| --- | --- | --- | --- | --- | --- |
| pve01 Hardware (R740) | DCLab | L1 | partial | CheckMK | Special-Agent `proxmox_ve` + Standard-Linux-Agent decken NVMe-SMART, PSU, Fan, Temp, RAM ab |
| pve02 Hardware (R740) | DCLab | L1 | partial | CheckMK | gleicher Pfad -- `proxmox_ve` Special-Agent + mk_smartmon |
| iDRAC pve01 | DCLab | L1 | live | CheckMK | Plugin `mk_redfish` Standard ab 2.3, ideal für iDRAC SEL/PSU/Fan/PCIe-Fatal -- live seit 2026-05-01 |
| iDRAC pve02 | DCLab | L1 | live | CheckMK | gleicher Pfad |
| nas-01 / nas-02 / iar-nas-01/02 (Synology) | DCLab | L1 | live | CheckMK | SNMP-Built-in `synology_*` Plugins seit 2026-05-01 |
| USV DCLab | DCLab | L1 | missing | CheckMK | Plugin `mk_apc` (SNMP) -- USV-Plan offen |
| Lab-PCs (15x HP Z2) | DCLab | L1 | missing | UK-Push | Heartbeat-Probes, Lab-PCs sind keine 24/7-Targets |
| FOG-Imaging-Server | DCLab | L1 | partial | UK-Push + CheckMK | UK für HTTP-Probe, CheckMK für Disk-Volume + Linux-Standard-Agent |
| Proxmox 2-Node Cluster | DCLab | L2 | missing | CheckMK | `proxmox_ve` Special-Agent + Cluster-Quorum-Check direkt |
| ZFS rpool / rPoolHA | DCLab | L2 | missing | CheckMK | Plugin `zfsget` Standard, deckt ZED-Events + Pool-State + Scrub-Status ab |
| ZFS-Replication 19 Jobs | DCLab | L2 | missing | CheckMK + Direct-Cron | Standard-Plugin gibt keine pve-spezifische Replication-Sicht -- `pvesr status`-Cron als Direct-Webhook ergänzt |
| HA-Manager + Watchdog | DCLab | L2 | missing | Loki + Direct | ha-crm/watchdog-mux ist Log-Pattern-Job; CheckMK-Plugin existiert nicht out-of-box |
| pve-firewall | DCLab | L2 | missing | CheckMK | mk_systemd reicht, P2 |
| DRBD/Linstor 3-Node Cluster | DCLab | L3 | partial | Telegraf | App-Metriken via prom-Endpoint, CheckMK hat kein DRBD-Plugin out-of-box |
| CSI-Health-Producer Script | DCLab | L3 | partial | Direct-Cron + Telegraf | App-spezifisch, kein CheckMK-Bedarf |
| Linstor S3 Snapshot-Backup | DCLab | L3 | missing | UK-Push | Heartbeat-Pattern, UK-Stärke |
| vm-pbs-00 Datastore | DCLab | L3 | partial | CheckMK | mk_apt + Linux-Standard reicht; PBS-Sync und Verify lokal logwatch |
| OPNsense Primary | DCLab | L4 | partial | CheckMK | SNMP-Plugins decken CARP/Daemons/Interfaces ab. ICMP-Reachability live seit 2026-05-01, Service-Coverage offen (Lösungsweg: Community-MKP `scsitteam/checkmk_opnsense`) |
| OPNsense Secondary | DCLab | L4 | partial | CheckMK | analog |
| OPNsense CARP-VIPs | DCLab | L4 | partial | CheckMK ICMP + UK-Probe | Reachability live, DNS-/HTTP-Probe geplant |
| Cloudflare-Tunnel | DCLab | L4 | partial | Loki + UK | Token-Expiry-Pattern aus Logs + externes UK-Probe |
| Traefik | DCLab | L4 | partial | UK + Loki | bestehendes Pattern (kein CheckMK nötig) |
| Lab-Switches | DCLab | L4 | partial | CheckMK | SNMP-Plugins für Switches sind CheckMK-Stärke. ICMP-Reachability live, SNMP geplant |
| Nomad Cluster | DCLab | L5 | partial | Telegraf | `inputs.nomad` prom-scrape |
| Consul Cluster | DCLab | L5 | partial | Telegraf | `inputs.consul` prom-scrape |
| Vault Cluster | DCLab | L5 | missing | UK + Telegraf | Sealed-Probe via UK gegen `/sys/health`, prom-Metriken via Telegraf |
| Postgres-DRBD | DCLab | L5 | partial | Telegraf | `inputs.postgresql_extensible` |
| Authentik-Server | DCLab | L6 | missing | Telegraf + Loki + Direct | Heartbeat + LogQL + Connection-Storm-Threshold |
| Authentik-Outposts | DCLab | L6 | missing | Telegraf | prom-scrape `authentik_outpost_connection`, P0 cluster-übergreifend |
| AD-LDAP (vm-ad-ldap) | DCLab | L6 | partial | CheckMK + Direct | Standard-Windows-Agent + `ad_replication`-Plugin out-of-box; LDAP-Bind-Cron als Webhook (synthetisch). Host live seit 2026-05-01 als ICMP-only |
| LE-Cert-Renewal (Traefik + ACME) | DCLab | L6 | missing | UK-Probe + Loki | Cert-Expiry via UK-HTTP-Probe (cert-days), acme-error via Loki-Pattern |
| Vault-Audit-Log | DCLab | L6 | unknown | Direct-Cron + Loki | Status-Cron + Audit-Backend via Loki |
| Cookie-Domain-Setting | DCLab | L6 | missing | Direct-Cron | 10-min-Drift-Cron, Cross-Cluster |
| Loki / InfluxDB / Grafana / Telegraf / Alloy / Keep / CheckMK / UK Self DCLab | DCLab | L7 | partial | Telegraf + UK | absent + cardinality + volume-fill + extern-probe |
| pve00 NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | mk_smartmon Standard, lm_sensors via Standard-Agent |
| pve01/02 NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | gleicher Pfad |
| pve-01-nana NVMe SMART + hwmon + Power-Loss | Homelab | L1 | missing | CheckMK | externer Watchdog-Host bekommt CheckMK-Agent |
| USV (NUT/upsd) | Homelab | L1 | partial | CheckMK | mk_apc oder mk_nut Plugin -- Datenquelle definitiv klären |
| synology-nas + nana-nas | Homelab | L1 | live | CheckMK | `synology_*` Built-in Plugins live seit 2026-05-01 |
| proxmox-cluster-quorum | Homelab | L2 | partial | CheckMK | proxmox_ve Special-Agent (bereits aktiv) deckt Quorum + HA-Manager |
| proxmox-watchdog-mux | Homelab | L2 | missing | Loki + Direct-Cron | softdog-Liveness via Log-Pattern + sysctl-Cron -- kein CheckMK-Plugin |
| proxmox-zfs-rpool / scrub | Homelab | L2 | missing | CheckMK | zfsget-Plugin Standard |
| proxmox-nfs-storage | Homelab | L2 | missing | CheckMK | mk_synology + df-Plugin auf NFS-Mounts |
| proxmox-pveproxy-api | Homelab | L2 | missing | UK-Probe | HTTP-Probe :8006 |
| proxmox-host-metrics | Homelab | L2 | missing | Telegraf (pve-Exporter) | App-Metrik-Sicht via Prom-Scrape -- ergänzend zu CheckMK Special-Agent |
| Linstor-Cluster | Homelab | L3 | partial | Telegraf + Loki | App-Metriken |
| Linstor-Backup-Pipeline | Homelab | L3 | partial | UK + Loki | Heartbeat + Errors-Pattern |
| pbs-backup-server Datastore | Homelab | L3 | partial | CheckMK | Linux-Standard-Agent + df-Plugin -- dazu PBS-Logs via Loki. Host live seit 2026-05-01, Agent-Install ausstehend |
| Garage S3 | Homelab | L3 | partial | Telegraf | /metrics Bearer-Token-Endpoint, Telegraf-Input pending |
| CSI-Health-Files | Homelab | L3 | partial | Direct-Cron + Telegraf | bestehend |
| Traefik (HA-Pair) | Homelab | L4 | partial | UK + Loki | bestehend, vm-traefik-01/02 als CheckMK-Host live seit 2026-05-01 |
| Pi-hole HA + Unbound (lxc-dns-01/02) | Homelab | L4 | partial | CheckMK + Direct | Linux-Standard-Agent (FTL-Pattern via Loki); double-down + nebula-sync via Direct-Cron. Hosts als `cmk-agent` angelegt seit 2026-05-01 |
| nebula-sync | Homelab | L4 | missing | UK-Push + Loki | Heartbeat + Sync-Failure-Pattern |
| UDM Pro (UniFi Gateway) | Homelab | L4 | partial | CheckMK | SNMP-Plugins für Edge-Devices/UniFi sind CheckMK-Stärke. ICMP-Reachability live seit 2026-05-01 |
| UniFi Switches | Homelab | L4 | missing | CheckMK | gleicher Pfad -- SNMP + Syslog-Sender |
| CrowdSec Container | Homelab | L4 | partial | Direct + Loki | Container-Up via Direct-Cron, Bouncer-Last-Pull via Loki -- kein CheckMK-Bedarf |
| Tailscale-Mesh | Homelab | L4 | missing | Direct-Cron | tailscale status -json via Cron |
| Cloudflare DDNS x2 | Homelab | L4 | partial | Loki + Direct | Pattern + IP-Vergleich-Cron |
| Keepalived (VRRP) | Homelab | L4 | live | Direct | bestehend |
| Internet-Reachability | Homelab | L4 | missing | UK-Probe | Gatus-Probes |
| Nomad / Consul / Vault Cluster | Homelab | L5 | partial | Telegraf | inputs.nomad / consul / Sealed-Probe |
| Postgres (DRBD Single) | Homelab | L5 | partial | Telegraf | inputs.postgresql |
| Authentik Server + Outposts | Homelab | L6 | partial | Telegraf + Loki + UK | bestehend, identisch DCLab |
| OpenLDAP | Homelab | L6 | missing | Direct-Cron | BIND-Test-Cron via ldapsearch -- CheckMK scheidet aus, weil `agent_ldap` nur in der Plus-Edition verfügbar ist |
| LE-Cert ackermannprivat.ch / ackermann.systems | Homelab | L6 | missing | UK-Probe | Cert-Days |
| Vault Audit Backend / Sealed-State | Homelab | L6 | partial | Direct-Cron + UK-Probe | Audit-File-Watch + sys/health |
| Tailscale Cross-Tailnet | Homelab | L6 | missing | Direct-Cron | Member-Diff-Cron |
| Loki / InfluxDB / Grafana / Telegraf / Alloy / Keep / CheckMK / UK / Gatus Self Homelab | Homelab | L7 | partial | Telegraf + UK | absent + cardinality + volume-fill + extern-probe |
| External Watchdog Platform pve-01-nana | Homelab | L7 | partial | Direct | Stack-Deployment ausstehend [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |

Die vollständige Item-Tabelle steht in [Monitoring: Coverage](coverage.md) -- diese Sektion ist die kondensierte Best-Path-Sicht.

## 6. Trade-Off-Analyse und Risiken

Jeder Punkt mit Trade-off und der zugehörigen Mitigation:

- **Pflege-Komplexität CheckMK**: WATO-UI gut für Ops, aber Konfig liegt in `.mk`-Files. Bei Bulk-Hosts (15 Lab-PCs, 80 Container) wird die `all_hosts`-Liste schnell unleserlich. Standard-Plugins decken viel ab -- keine Eigenbau-Skripte für iDRAC/Synology/UniFi nötig. Mitigation gegen Discovery-Drift: Container-Discovery in eigenen Folder verschieben + Folder-Filter in Dashboards
- **Pflege-Komplexität Telegraf**: Config in Repo, klare Versionierung, App-Metriken sehr gut, aber SNMP/Hardware ist mitzuwarten. DCLab hat SNMP komplett auskommentiert weil CheckMK das übernimmt -- diese Arbeitsteilung ist gesund
- **CheckMK Single-Instance / HA**: vm-checkmk DCLab + checkmk Homelab haben kein HA. Bei VM-Down sind alle Special-Agent-Targets silent (iDRAC, NAS, Switches, OPNsense, UDM). Telegraf läuft dagegen als Nomad-System-Job auf 3+ Clients -- viel resilienter. Mitigation: externer Watchdog-Probe gegen CheckMK-Web-UI, Disk-Volume-Alert auf vm-checkmk, omd-Status-Cron als Self-Heartbeat
- **Plugin-Pflege bei Upgrades**: das CheckMK-Major-Upgrade-Regime ist eine eigene Pipeline; ein Custom-Plugin (z.B. eigenes `mk_redfish`) kann beim Major-Upgrade brechen. Mitigation: nur Standard-Plugins nutzen, keine Custom-Plugins
- **Severity-Modell-Drift**: CheckMK Naemon hat OK/WARN/CRIT/UNKNOWN, Keep-Severity info/warning/critical. Mapping `CRIT->critical`, `WARN->warning`, `UNKNOWN->warning` ist Standard. Drift-Risiko wenn ein Operator WATO-Schwellen oder ein Plugin eigene Severity-Levels nutzt. Mitigation: Severity-Mapping einmal in der CheckMK->Keep-Notifier-URL hartkodieren, nicht pro Plugin
- **Single-Notifier-Konvention**: CheckMK->Keep-Webhook ist Pflicht; ohne das verstösst CheckMK strukturell. Der Homelab-Telegram-Direct-Notifier muss vor der CheckMK->Keep-Migration entfernt werden, sonst doppeltes Routing
- **InfluxDB-Forwarder (Performance-Daten)**: der alerting-Pfad bleibt CheckMK-Core (RRD + Naemon-State + Webhook -> Keep), Severity entsteht im Core, nicht aus InfluxDB. CheckMK kann zusätzlich Performance-Daten an Influx streamen; die RRD bleibt als State-Source notwendig, Influx ist nur ergänzend für Grafana-Dashboards. Cardinality-Risiko: bei ~95 Hosts x 10-20 Services plus Container-Discovery wächst die Series-Zahl schnell. Mitigation: Forwarder nach Aktivierung beobachten, dann Cardinality-Limit aktiv
- **Mail-Default-Falle**: Default-Plugin `mail` mit `{}`-Config in beiden Clustern, aber kein MTA -- funktional tot, suggeriert aber Coverage. Mitigation: Rule disablen mit Description-Hinweis auf den CheckMK->Keep-Webhook
- **Token-Security**: Homelab `notifications.mk` hat hardcoded Telegram-Token in einer Repo-tauglichen Datei, der bei Site-Backup oder Cluster-Migration mitgesichert wird -- gegen die 1Password-Konvention. Mitigation: nach der CheckMK->Keep-Migration entfernen
- **Doppel-Coverage Telegraf+CheckMK**: pve-Exporter (Telegraf) + `proxmox_ve` Special-Agent (CheckMK) liefern beide Proxmox-Daten. Akzeptiert wegen unterschiedlicher Detail-Tiefe, Risiko zweier Alert-Pfade für dasselbe Problem. Mitigation: Alert-Rules in Telegraf nur für Counter/Rates, in CheckMK nur für State/Health

## 7. Empfehlung -- Pfad-Zuordnung

### CheckMK übernimmt (P0-Liste)

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

### Telegraf bleibt zuständig

- Authentik-Server + Authentik-Outposts (App-prom-Metriken)
- Loki/InfluxDB/Grafana/Telegraf-Self/Alloy-Self (L7 Self-Monitoring)
- Nomad/Consul-Cluster (`inputs.nomad/consul`)
- Postgres-DRBD (`inputs.postgresql_extensible`)
- pve-Exporter (Homelab -- App-Metrik-Sicht zusätzlich zu CheckMK Special-Agent)
- DRBD/Linstor-Cluster
- App-Volume-Voll
- iot-stacks
- Garage S3

### Loki bleibt zuständig

- ZED-Mail/ZFS-Events Logs (DCLab)
- HA-Manager + Watchdog-Logs
- Authentik-Sync-Webhook Stille-Detection
- Vault-Audit-Backend Pattern
- LE-Cert-Renewal acme-error
- CrowdSec CAPI-Sync
- Wiki-Build-Failure
- Cloudflared Token-Expiry

### UK-Push/UK-Probe bleibt zuständig

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
- proxmox-pvesr Status-Cron
- Vault-Unseal Service `is-active`-Cron

### InfluxDB-Forwarder

Der Forwarder liefert nur Dashboard-Daten -- Alerts bleiben im CheckMK-Core (RRD + Naemon -> Webhook -> Keep). Zielbild: einheitliche Grafana-Dashboard-Sicht via Ops-Influx, Hardware via CheckMK, Apps via Telegraf, beides im gleichen Influx. Doppelte Storage akzeptiert, da CheckMK die RRD intern als Naemon-State-Quelle behält (nicht abschaltbar). InfluxDB-Adressen siehe [Hosts und IPs](../_referenz/hosts-und-ips.md).

### Mail- und Telegram-Direct-Pfade

Die `mail`-Default-Notification-Rule ist in beiden Clustern ohne MTA funktional tot, suggeriert aber Coverage. Der Homelab-Telegram-Direct-Notifier (`check_mk_telegram-notify.sh`, Token im Klartext) umgeht Keep und verstösst gegen die Single-Notifier-Konvention. Beide Pfade werden mit der CheckMK->Keep-Migration abgelöst; das Telegram-Routing übernimmt dann Keep über die normale Source-Workflow-Logik.

## Verwandte Seiten

- [Monitoring](index.md) -- Komponenten-Übersicht
- [Monitoring: Coverage](coverage.md) -- Ist-Stand-Coverage SSOT mit allen Items
- [Monitoring: CheckMK Discovery-Policy](checkmk-discovery.md) -- Service-Klassifikation pro Host-Typ und Discovery-Filter (Free-Tier-Limit-Mitigation)
- [Monitoring: Keep-Correlations](keep-correlations.md) -- Correlation-Patterns für Keep
- ClickUp Privat [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab
- ClickUp Privat [`86c9knpgj`](https://app.clickup.com/t/86c9knpgj) -- CheckMK->Keep-Webhook Homelab (Vorbedingung Welle 3)
- ClickUp Privat [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) -- CheckMK-Coverage-Bundle Homelab
- ClickUp HSLU [`86c9jqvtj`](https://app.clickup.com/t/86c9jqvtj) -- Welle-3-Master DCLab (Cross-Cluster-Sicht)

Memory-Pointer: `project_monitoring_routing_2026_04`, `project_monitoring_rollout_2026_04`, `feedback_no_cross_cluster_coupling`, `feedback_keep_workflow_first_match`, `feedback_keep_workflow_yaml_upload`, `feedback_nas_storage_threshold_95`, `feedback_authentik_pg_connection_storm`, `project_checkmk_strategy_2026_05_01`, `project_checkmk_2026_05_01_upgrade`, `feedback_checkmk_keep_webhook_keephq_script`, `feedback_checkmk_synology_snmp_builtin`
