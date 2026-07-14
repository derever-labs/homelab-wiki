---
title: Monitoring Best-Path-Klassifikation
description: Best-Path-Zuordnung pro Coverage-Item -- welcher Pfad (CheckMK, Telegraf, Loki, Uptime-Kuma, Direct) welches Item in welchem Cluster abdeckt
tags:
  - monitoring
  - klassifikation
  - checkmk
  - telegraf
  - coverage
---

# Monitoring Best-Path-Klassifikation

Diese Seite hält die kondensierte Best-Path-Sicht pro Coverage-Item fest -- ausgelagert aus [Monitoring: Strategie](strategie.md).

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
| Internet-Reachability | Homelab | L4 | missing | UK-Probe | Uptime-Kuma-Probes |
| Nomad / Consul / Vault Cluster | Homelab | L5 | partial | Telegraf | inputs.nomad / consul / Sealed-Probe |
| Postgres (DRBD Single) | Homelab | L5 | partial | Telegraf | inputs.postgresql |
| Authentik Server + Outposts | Homelab | L6 | partial | Telegraf + Loki + UK | bestehend, identisch DCLab |
| OpenLDAP | Homelab | L6 | missing | Direct-Cron | BIND-Test-Cron via ldapsearch -- CheckMK scheidet aus, weil `agent_ldap` nur in der Plus-Edition verfügbar ist |
| LE-Cert ackermannprivat.ch / ackermann.systems | Homelab | L6 | missing | UK-Probe | Cert-Days |
| Vault Audit Backend / Sealed-State | Homelab | L6 | partial | Direct-Cron + UK-Probe | Audit-File-Watch + sys/health |
| Tailscale Cross-Tailnet | Homelab | L6 | missing | Direct-Cron | Member-Diff-Cron |
| Loki / InfluxDB / Grafana / Telegraf / Alloy / Keep / CheckMK / UK Self Homelab | Homelab | L7 | partial | Telegraf + UK | absent + cardinality + volume-fill + extern-probe |
| External Watchdog Platform pve-01-nana | Homelab | L7 | partial | Direct | Stack-Deployment ausstehend [`86c9km53e`](https://app.clickup.com/t/86c9km53e) |

Die vollständige Item-Tabelle steht in [Monitoring: Coverage](coverage.md) -- diese Sektion ist die kondensierte Best-Path-Sicht.

## Verwandte Seiten

- [Monitoring: Strategie](strategie.md) -- Stack-Aufgabenteilung und Pfad-Zuordnung
- [Monitoring: Coverage](coverage.md) -- Ist-Stand-Coverage SSOT mit allen Items
- [CheckMK](../checkmk/index.md) -- Host-Level-Monitoring inkl. Cluster-Inventar
- [Monitoring: Keep-Correlations](keep-correlations.md) -- Correlation-Patterns für Keep
