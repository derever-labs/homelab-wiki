---
title: Monitoring Stack
description: Übersicht des Monitoring Stacks -- Grafana, InfluxDB, Loki, Alloy, Telegraf, CheckMK und Uptime Kuma
tags:
  - service
  - monitoring
  - nomad
---

# Monitoring Stack

Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit. Er bündelt mehrere Dienste für Metriken, Logs, Verfügbarkeit und Alert-Routing.

Die Referenz-Tabellen (Alert-Regeln, Log-Quellen, Log-Levels) stehen in der [Monitoring Referenz](./referenz.md), die Betriebs-Prozeduren (Grafana-Admin, Silencing, Backup-Monitoring, Wartung) im [Monitoring Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Deployment | `monitoring/`-Nomad-Jobs + `system/alloy.nomad` (System-Job) + Ansible (Alloy systemd) |
| Storage | InfluxDB (Metriken), Loki (Logs), PostgreSQL (Grafana-Backend) |
| Auth | Authentik ForwardAuth, Gruppe `admin` |
| Hosts/IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

### Dienste

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Keep** | Incident-Hub, Alert-Routing, Dedup | [keep.ackermannprivat.ch](https://keep.ackermannprivat.ch) |
| **Grafana** | Dashboards, Metriken, Log-Alerts | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) |
| **InfluxDB** | Time-Series Metriken-Backend | [influx.ackermannprivat.ch](https://influx.ackermannprivat.ch) |
| **Telegraf** | Metriken-Collector (SNMP, Prometheus, Exec) | — (Nomad Job) |
| **Loki** | Zentrales Log-Storage | [loki.ackermannprivat.ch](https://loki.ackermannprivat.ch) |
| **Grafana Alloy** | Log-Collector (System-Job + systemd + Docker) | — (läuft auf 15 Nodes) |
| **CheckMK** | Host-Level Monitoring (CPU, RAM, Disk, SMART) | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| **Uptime Kuma** | Synthetic-Monitoring (Kern-Infra + Flächenabdeckung + Push) | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |

## Grafana
### Datenquellen
- **InfluxDB:** Speichert Metriken von Nomad, Consul und Proxmox.
- **Loki:** Zentrales Log-Storage für alle Infrastruktur-Logs (via Grafana Alloy gesammelt).
- **CheckMK:** Integriert über das CheckMK-Plugin für Infrastruktur-Status.

### Authentifizierung
Erfolgt via Authentik ForwardAuth. Nur Benutzer der Gruppe `admin` haben Zugriff.

### Deployment
Grafana nutzt PostgreSQL (`postgres.service.consul`) als Backend-Datenbank für Session-State, Unified Alerting und Konfiguration. Das frühere Linstor CSI Volume `grafana-data` (SQLite) wurde entfernt und deregistriert.

- **Dashboards:** GitOps via Grafana HTTP-API. Quelle-der-Wahrheit sind die JSON-Dateien im Repo unter `nomad-jobs/monitoring/grafana-dashboards/`. Ein GitHub-Actions Workflow pusht geänderte Dashboards direkt per `POST /api/dashboards/db`. Kein NFS-Mount, keine File-Provisionierung mehr.
- **Datasources:** Via Nomad Template aus Vault Secrets (`kv/grafana`, `kv/influxdb`, `kv/jellystat`) provisioniert.
- **Alerting:** Unified Alerting aktiv, Alert Rules via File Provisioning (siehe unten).
- **Scheduling:** Kein Node-Constraint mehr (CSI-Abhängigkeit entfällt), Affinität auf client-05/06 beibehalten.

::: info Auth-Kette für den GitOps-Push
Der Runner holt sich das Grafana Service-Account Token aus Vault: JWT-Role `github-runner-deploy` (gebunden an `nomad_job_id=github-runner`) bekommt die Policy `grafana-deploy-fetch`, die nur das Feld `service_account_token` in `kv/data/grafana` lesen darf. Die Grafana-Adresse wird dynamisch über den Consul-Catalog aufgelöst, damit der Workflow unabhängig von dynamischen Nomad-Ports funktioniert und Authentik umgeht. Pattern ist symmetrisch zu `nomad-deploy-fetch` -- siehe [GitHub Runner Referenz](../github-runner/referenz.md).
:::

### Alerting (Unified Alerting)
Grafana Unified Alerting ist die zentrale Stelle, an der metrikbasierte und log-basierte Alert-Rules ausgewertet werden. Der Versand an Telegram läuft seither nicht mehr direkt aus Grafana, sondern über den zentralen Hub [Keep](keep.md).

**Contact Point:** Webhook auf `https://keep.ackermannprivat.ch/alerts/event/grafana`
**Notification Policy:** Alle Alerts -> Keep, Group-Wait 30s, Repeat 4h

Keep korreliert die Alerts anschliessend zu Incidents, dedupliziert und routet nach Incident-Severity in drei Forum-Topics (Kritisch/Warnung/Info) über den batch-Bot. Details siehe [Keep](keep.md).

Die vollständigen metrik- und log-basierten Alert-Regel-Tabellen stehen in der [Monitoring Referenz](./referenz.md#alert-regeln).

### Alert-Routing-Pipeline

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  svc: {
    style: {
      border-radius: 8
    }
  }
  agent: {
    style: {
      border-radius: 8
      stroke-dash: 2
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
  db: {
    shape: cylinder
    style: {
      border-radius: 8
    }
  }
  sink: {
    shape: hexagon
    style: {
      border-radius: 8
    }
  }
}

# --- Quellen mit Direct-Webhook (Pfad 1) ---
direct: Direct-Webhook (Pfad 1) {
  class: container
  kuma: Uptime Kuma {class: svc}
  authentik: Authentik {class: svc}
  arr: Sonarr/Radarr/Prowlarr {class: svc}
  immo: Immo-Scraper {class: svc}
  checkmk: CheckMK {class: svc}
}

# --- Logs/Metrics für Pfad 2/3 ---
sources_l: Log-Quellen (Pfad 2) {
  class: container
  apps: Container/Hosts {class: svc}
  unifi: UniFi (Syslog) {class: svc}
}
sources_m: Metrik-Quellen (Pfad 3) {
  class: container
  snmp: SNMP Targets {class: svc}
  hosts: Hosts/Container {class: svc}
}

alloy: Grafana Alloy {class: agent}
telegraf: Telegraf {class: agent}
loki: Loki {class: db}
influx: InfluxDB {class: db}
grafana: Grafana\nUnified Alerting {class: svc}

keep: Keep\nIncident-Hub\nDedup + Routing {class: svc}

bot_batch: batch-Bot\nbatch_ackermann_bot {
  class: agent
  tooltip: "Alleiniger Sender; postet nach Severity in die Topics"
}

homelab_alerts: Homelab Alerts\nForum-Channel\n(chat-id -1003971798942) {
  class: container
  krit: Kritisch (25009) {class: sink}
  warn: Warnung (25010) {class: sink}
  info: Info (25011) {class: sink}
}

# Pfad 1: Direct-Webhook
direct.kuma -> keep: webhook
direct.authentik -> keep: webhook
direct.arr -> keep: webhook
direct.immo -> keep: webhook
direct.checkmk -> keep: webhook

# Pfad 2: Logs -> Loki -> Grafana-Rule
sources_l.apps -> alloy: Docker / journald
sources_l.unifi -> alloy: Syslog 1514
alloy -> loki: push
loki -> grafana: LogQL Query
grafana -> keep: webhook

# Pfad 3: Metriken -> InfluxDB -> Grafana-Rule
sources_m.snmp -> telegraf: scrape
sources_m.hosts -> telegraf: scrape
telegraf -> influx: write
influx -> grafana: Flux Query

# Keep -> Incident -> batch-Bot -> Severity-Topics
keep -> bot_batch: "Incident-Workflows"
bot_batch -> homelab_alerts.krit: "critical / high / fail-open"
bot_batch -> homelab_alerts.warn: "warning"
bot_batch -> homelab_alerts.info: "info / low"
```

::: info Routing-Logik
Keep korreliert eingehende Alerts zu **Incidents** (vier disjunkte Grouping-Rules). Die vier `type:incident`-Workflows posten je nach **Incident-Severity** über den batch-Bot in eines von drei Forum-Topics: Kritisch (`critical`/`high` + fail-open), Warnung (`warning`), Info (`info`/`low`). Stummschalten ist Telegram-natives Per-Topic-Mute. Der frühere VIP-Bot-1:1-Pfad ist seit 2026-06-09 abgelöst. Details: [Keep](keep.md), [Telegram-Bots](telegram-bots.md).
:::

Der interne Admin-Zugang zur Grafana-HTTP-API (Service Account) und das Silencing von Alerts über die Alertmanager-API sind im [Monitoring Betrieb](./betrieb.md) beschrieben.

## Verfügbarkeits-Monitoring (Uptime Kuma)

Uptime Kuma ist seit dem Gatus-Rückbau (2026-06-10) die einzige Synthetic-Monitoring-Schicht:

- **Kern-Infrastruktur** (Ingress, SSO, DNS, Nomad/Consul/Vault x3, Speicher) -- jeder Endpoint alarmiert sofort, gruppiert in `Plattform` / `Netz` / `Auth` / `Storage & Backup`.
- **Flächenabdeckung** (Media, Productivity, AI, IoT, Apps) plus Push-Monitore für Batch-Jobs.

Alle Monitore senden via Single-Notifier "Keep" mit Default Enabled; Severity- und Topic-Routing entscheidet Keep. Details: [Uptime Kuma](../uptime-kuma/index.md#alerting).

## Zentrales Logging (Loki + Alloy)

### Gesamtarchitektur

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

Sources: Infrastruktur-Quellen {
  class: container
  Containers: "Nomad Container\n(3 Client-Nodes)"
  Servers: "HashiCorp VMs\n(Server + Client)"
  Traefik: "Traefik VMs (2x)"
  Proxmox: "Proxmox Hosts (3x)"
  Infra: "Infra VMs\n(CheckMK, PBS, DNS)"
  NAS: "NAS / Router\n(Syslog)"
}

Collectors: Collector-Layer {
  class: container
  Alloy: "Grafana Alloy\n(System-Job + systemd)"
  Telegraf: "Telegraf\n(Nomad Job)"
  CMK: "CheckMK Agent"
  Kuma: "Uptime Kuma"
}

Storage: Storage-Layer {
  class: container
  Loki: "Loki\n(Log-Storage)"
  Influx: "InfluxDB\n(Metriken)"
  CheckMK: "CheckMK\n(Host-Status)"
}

GRAF: Grafana

Sources.Containers -> Collectors.Alloy: Logs (Docker-Socket)
Sources.Servers -> Collectors.Alloy: Logs (systemd-Journal)
Sources.Traefik -> Collectors.Alloy: Logs (systemd + Syslog)
Sources.Proxmox -> Collectors.Alloy: Logs (systemd)
Sources.Infra -> Collectors.Alloy: Logs (systemd)
Sources.NAS -> Collectors.Alloy: Syslog UDP 1514
Sources.NAS -> Collectors.CMK: SNMPv3
Sources.Servers -> Collectors.Telegraf: Prometheus
Sources.Proxmox -> Storage.Influx: direkt (nativ)

Collectors.Alloy -> Storage.Loki
Collectors.Telegraf -> Storage.Influx
Collectors.CMK -> Storage.CheckMK
Collectors.Kuma -> GRAF: "HTTP/TCP-Checks"

Storage.Loki -> GRAF
Storage.Influx -> GRAF
Storage.CheckMK -> GRAF
```

### Loki (Log-Storage)
- **Nomad Job:** `monitoring/loki.nomad` (Service-Job, Priority 100)
- **Storage:** Linstor CSI Volume `loki-data` (repliziert)
- **Port:** 3100 (statisch)
- **Retention:** 30 Tage (720h)
- **Zugang:** `loki.ackermannprivat.ch` (intern, `intern-auth@file`)
- **Consul DNS:** `loki.service.consul`

### Grafana Alloy (Log-Collector)

Alloy sammelt Logs aus allen Infrastruktur-Komponenten und leitet sie an Loki weiter. Es gibt drei Deployment-Arten:

- **Nomad System-Job** (`system/alloy.nomad`) auf jedem Client-Node -- Container-Logs via Docker-Socket plus Syslog-Receiver auf Port 1514 für NAS und Router.
- **Ansible-Rolle `alloy`** (systemd) auf Server-/Client-Nodes, Proxmox und Infra-VMs -- systemd-Journal plus optionale Datei-Targets.
- **Standalone-Config (traefik-ha)** auf den Traefik-VMs -- Docker-Compose-Logs mit Source-Label `docker-compose`.

Deployment-Details, Playbook-Tabelle, Label-Schema und Log-Query-Beispiele sind in [Grafana Alloy](./alloy.md) gepflegt. Die SSOT für die Zuordnung Host -> Methode -> Source-Label ist die [Log-Quellen-Übersicht](./referenz.md#log-quellen) in der Referenz.

Die Log-Level je Komponente listet die [Monitoring Referenz](./referenz.md#log-levels). Grafana-Admin, Silencing, Backup-Monitoring und die Wartung (Grafana Dashboards, InfluxDB Downsampling-Tasks) sind im [Monitoring Betrieb](./betrieb.md) beschrieben.

## Verwandte Seiten

- [Monitoring Referenz](./referenz.md) -- Alert-Regeln, Log-Quellen und Log-Levels
- [Monitoring Betrieb](./betrieb.md) -- Grafana-Admin, Silencing, Backup-Monitoring, Wartung
- [Coverage](./coverage.md) -- Welcher Host und Service wird wie überwacht und was bewusst ausgelassen
- [CheckMK Discovery-Policy](./checkmk-discovery.md) -- Service-Klassifikation pro Host-Typ und Discovery-Filter (Free-Tier-Limit-Mitigation)
- [Keep](./keep.md) -- Incident-Hub mit Source/Severity-Routing in die Telegram-Forum-Topics
- [Telegram-Bots](./telegram-bots.md) -- Bot- und Channel-Inventar (batch-Bot + Severity-Topics; vip idle)
- [Migration Flux → InfluxQL](./migration-flux-zu-influxql.md) -- Retrospektive der April-2026 Query-Sprach-Migration, Trade-offs, HART-Budget, entdeckte Source-Drifts
- [CheckMK Monitoring](../checkmk/index.md) -- Host-Level Monitoring (CPU, RAM, Disk)
- [Uptime Kuma](../uptime-kuma/index.md) -- Synthetic-Monitoring (Kern-Infra + Flächenabdeckung + Push)
- [Backup-Strategie](../backup/index.md) -- Backup-Monitoring via Uptime Kuma Push
- [Linstor/DRBD](../linstor-storage/index.md) -- CSI Volume für Loki
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Periodische Monitoring- und Wartungs-Jobs
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Dediziertes NAS-Dashboard (CheckMK-Hardware-Health) mit Alerting
- [USV (APC)](../ups/index.md) -- USV-Monitoring via NUT und Grafana Alerting
