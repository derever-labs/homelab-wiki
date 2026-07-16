---
title: Strategie
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

# Strategie

Diese Seite hält die Stack-Aufgabenteilung zwischen CheckMK, Telegraf, Loki und Uptime-Kuma fest -- welche Coverage-Klasse welchen Pfad nutzt und welche Hosts in welchem Cluster wie eingerichtet sind.

::: info Hinweis
Ist-Stand der Coverage in [Monitoring: Coverage](index.md), Correlation-Patterns in [Monitoring: Keep-Correlations](../keep/correlations.md). Drift gegen diese Strategie als ClickUp-Task im jeweiligen Master-Bundle anlegen.
:::

## 1. Executive Summary

Die Empfehlung ist klar: **CheckMK bleibt das Werkzeug erster Wahl für alles, was klassische OS-/Hardware-/Special-Agent-Monitoring ist** (iDRAC Redfish, NAS Synology, Cisco/UniFi/OPNsense SNMP, Windows-AD, Proxmox-VE-Special-Agent, mk_smartmon, mk_zfs, mk_apt, mk_logwatch, mk_systemd). Telegraf bleibt der Pfad für alles **app-, container-, prometheus-metrik-getriebene** (Authentik-Outpost, Loki, Influx, Nomad, Consul, Postgres, Garage, CSI). Loki bleibt für **Log-Pattern-Alerts** (acme-error, ssh-failed, vault-denied), Uptime-Kuma bleibt für **Push-Heartbeats und HTTP-Probes ohne Plugin-Bedarf**.

CheckMK feuert Alerts erst dann an Keep, wenn der CheckMK->Keep-Webhook-Pfad gebaut ist; bis dahin landen Notifications im Mail-Default (DCLab: ohne MTA tot) bzw. über den hardcoded Telegram-Bypass (Homelab: gegen Single-Notifier-Konvention). Dieser Notifier-Pfad ist der strukturelle Bruch der CheckMK-Integration.

## 2. Aktuelle Stack-Architektur

Beide Cluster identisch aufgesetzt, aber unterschiedlich befüllt:

- **Telegraf -> InfluxDB-Ops -> Grafana -> Webhook -> Keep**: app-Metriken, prom-scrapes, host-disk, host-cpu, ssh-counts. DCLab: SNMP-Block auskommentiert (alle SNMP-Targets nur via CheckMK). Homelab: Synology-Hardware seit dem Cutover 2026-06-05 via CheckMK (zentraler SNMP-Block stillgelegt)
- **Alloy -> Loki -> Grafana LogQL -> Webhook -> Keep**: Log-Pattern-Alerts. Beide Cluster aktiv. DCLab hat einen Self-Detection-Alert (`loki-ingester-down`), Homelab keinen
- **Uptime-Kuma -> Webhook -> Keep**: Push-Heartbeats (cron-jobs), TCP/HTTP-Probes. Single-Notifier-Cleanup live in beiden Clustern
- **Direct -> Webhook -> Keep**: synthetische Cron-Probes, Watchdog-Skripte
- **CheckMK -> ??? -> Keep**: hier ist die Lücke. Kein Webhook-Notifier konfiguriert (Inventar-Details auf der [CheckMK](../checkmk/index.md#cluster-inventar)-Seite)

Single-Notifier-Konvention (Memory `project_monitoring_routing_2026_04`): jede Quelle = genau ein Webhook nach Keep. CheckMK verstösst aktuell strukturell.

## 3. CheckMK-Inventare

Die vollständige Bestandsaufnahme beider CheckMK-Sites (DCLab und Homelab) -- Hosts, WATO-Struktur, Special- und Standard-Agents, InfluxDB-Forwarder, Notification-Konfig, Severity-Modell und HA-Status -- steht auf der [CheckMK](../checkmk/index.md#cluster-inventar)-Seite. Kernpunkt für die Strategie: beide Sites sind Single-Instance ohne Failover, und der CheckMK->Keep-Webhook-Notifier fehlt in beiden Clustern.

## 4. Best-Path-Klassifikation

Die kondensierte Best-Path-Sicht pro Coverage-Item (Item / Cluster / Layer / Coverage / Best-Path / Begründung) steht in [Monitoring: Best-Path-Klassifikation](klassifikation.md). Ist-Stand der Coverage siehe [Monitoring: Coverage](index.md).

## 5. Trade-Off-Analyse und Risiken

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
- **Proxmox-VM-Memory-Check vs Gast-Innensicht**: Der `proxmox_ve`-Special-Agent liefert pro Gast einen `Proxmox VE Memory Usage`-Check aus der Hypervisor-Sicht. Diese Prozentzahl ist für Memory-Alerts wertlos, sobald der Gast keinen Ballooning-Reclaim erlaubt (`balloon=0`): QEMU-Overhead und der vom Hypervisor als belegt gezählte Page-Cache treiben den Wert über 100% (vm-traefik-01 dauerhaft bei 100.7% CRIT, während der Gast selbst 68% frei meldete). Autoritativ ist deshalb die Gast-Innensicht -- der `Memory`-Check des CheckMK-Agenten in der VM. Mitigation: Der Proxmox-VM-Memory-Check ist per `ignored_services` für jeden Gast mit eigenem Agent-Memory-Check deaktiviert und bleibt nur Fallback-Sicherheitsnetz für noch agentenlose Gäste; auf Host-Ebene (pve00/01/02) bleibt er als Allokations- und Overcommit-Wächter aktiv. Zielbild: der CheckMK-Agent gehört zur VM-Provisionierung, damit jede produktive VM ihre eigene Memory-Innensicht liefert. Deaktivierungs-Liste und Schwellen in der [CheckMK Discovery-Policy](../checkmk/discovery.md#3-host-spezifische-schwellwert-und-ausnahme-regeln). Die einzige Ausnahme ohne Agent ist homeassistant (immutable), abgedeckt durch einen eigenen HAOS-Memory-Ersatzcheck (Details: [CheckMK](../checkmk/index.md#haos-memory-check-ssh-forced-command))

## 6. Empfehlung -- Pfad-Zuordnung

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
- Internet-Reachability (Uptime-Kuma-Probes)

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

Der Forwarder liefert nur Dashboard-Daten -- Alerts bleiben im CheckMK-Core (RRD + Naemon -> Webhook -> Keep). Zielbild: einheitliche Grafana-Dashboard-Sicht via Ops-Influx, Hardware via CheckMK, Apps via Telegraf, beides im gleichen Influx. Doppelte Storage akzeptiert, da CheckMK die RRD intern als Naemon-State-Quelle behält (nicht abschaltbar). InfluxDB-Adressen siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md).

### Mail- und Telegram-Direct-Pfade

Die `mail`-Default-Notification-Rule ist in beiden Clustern ohne MTA funktional tot, suggeriert aber Coverage. Der Homelab-Telegram-Direct-Notifier (`check_mk_telegram-notify.sh`, Token im Klartext) umgeht Keep und verstösst gegen die Single-Notifier-Konvention. Beide Pfade werden mit der CheckMK->Keep-Migration abgelöst; das Telegram-Routing übernimmt dann Keep über die normale Source-Workflow-Logik.

## Verwandte Seiten

- [Monitoring](../index.md) -- Komponenten-Übersicht
- [Monitoring: Best-Path-Klassifikation](klassifikation.md) -- Best-Path pro Coverage-Item
- [CheckMK](../checkmk/index.md) -- Host-Level-Monitoring inkl. Cluster-Inventar beider Sites
- [Monitoring: Coverage](index.md) -- Ist-Stand-Coverage SSOT mit allen Items
- [Monitoring: CheckMK Discovery-Policy](../checkmk/discovery.md) -- Service-Klassifikation pro Host-Typ und Discovery-Filter (Free-Tier-Limit-Mitigation)
- [Monitoring: Keep-Correlations](../keep/correlations.md) -- Correlation-Patterns für Keep
- ClickUp Privat [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab
- ClickUp Privat [`86c9knpgj`](https://app.clickup.com/t/86c9knpgj) -- CheckMK->Keep-Webhook Homelab (Vorbedingung Welle 3)
- ClickUp Privat [`86c9knpm4`](https://app.clickup.com/t/86c9knpm4) -- CheckMK-Coverage-Bundle Homelab
- ClickUp HSLU [`86c9jqvtj`](https://app.clickup.com/t/86c9jqvtj) -- Welle-3-Master DCLab (Cross-Cluster-Sicht)

Memory-Pointer: `project_monitoring_routing_2026_04`, `project_monitoring_rollout_2026_04`, `feedback_no_cross_cluster_coupling`, `feedback_keep_workflow_first_match`, `feedback_keep_workflow_yaml_upload`, `feedback_nas_storage_threshold_95`, `feedback_authentik_pg_connection_storm`, `project_checkmk_strategy_2026_05_01`, `project_checkmk_2026_05_01_upgrade`, `feedback_checkmk_keep_webhook_keephq_script`, `feedback_checkmk_synology_snmp_builtin`
