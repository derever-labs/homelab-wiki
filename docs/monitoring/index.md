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

pfad1: Pfad 1 -- Direct-Webhook {
  class: container
  kuma: Uptime Kuma {class: svc}
  authentik: Authentik {class: svc}
  arr: Sonarr/Radarr/Prowlarr {class: svc}
  immo: Immo-Scraper {class: svc}
  checkmk: CheckMK {class: svc}
}

pfad2: Pfad 2 -- Log-basiert {
  class: container
  apps: Container/Hosts {class: svc}
  unifi: UniFi (Syslog) {class: svc}
  alloy: Grafana Alloy {class: agent}
  loki: Loki {class: db}
  apps -> alloy: Docker / journald
  unifi -> alloy: Syslog 1514
  alloy -> loki: push
}

pfad3: Pfad 3 -- Metrik-basiert {
  class: container
  snmp: SNMP-Targets {class: svc}
  hosts: Hosts/Container {class: svc}
  telegraf: Telegraf {class: agent}
  influx: InfluxDB {class: db}
  snmp -> telegraf: scrape
  hosts -> telegraf: scrape
  telegraf -> influx: write
}

grafana: Grafana\nUnified Alerting {class: svc}

keep: Keep\nIncident-Hub\nDedup + Routing {class: svc}

bot_batch: batch-Bot {
  class: agent
  tooltip: "Alleiniger Sender; postet nach Incident-Severity in die Topics"
}

homelab_alerts: Homelab Alerts (Telegram-Forum) {
  class: container
  krit: Kritisch {class: sink}
  warn: Warnung {class: sink}
  info: Info {class: sink}
}

pfad1 -> keep: Webhooks
pfad2.loki -> grafana: LogQL-Query
pfad3.influx -> grafana: InfluxQL-Query
grafana -> keep: Webhook

keep -> bot_batch: Incident-Workflows
bot_batch -> homelab_alerts.krit: critical / high / fail-open
bot_batch -> homelab_alerts.warn: warning
bot_batch -> homelab_alerts.info: info / low
```

::: info Routing-Logik
Keep korreliert eingehende Alerts zu **Incidents** (zwei disjunkte Grouping-Rules). Die vier `type:incident`-Workflows posten je nach **Incident-Severity** über den batch-Bot in eines von drei Forum-Topics: Kritisch (`critical`/`high` + fail-open), Warnung (`warning`), Info (`info`/`low`). Stummschalten ist Telegram-natives Per-Topic-Mute. Der frühere VIP-Bot-1:1-Pfad ist seit 2026-06-09 abgelöst. Details: [Keep](keep.md), [Telegram-Bots](telegram-bots.md).
:::

Der interne Admin-Zugang zur Grafana-HTTP-API (Service Account) und das Silencing von Alerts über die Alertmanager-API sind im [Monitoring Betrieb](./betrieb.md) beschrieben.

## Verfügbarkeits-Monitoring (Uptime Kuma)

Uptime Kuma ist seit dem Gatus-Rückbau (2026-06-10) die einzige Synthetic-Monitoring-Schicht:

- **Kern-Infrastruktur** (Ingress, SSO, DNS, Nomad/Consul/Vault x3, Speicher) -- jeder Endpoint alarmiert sofort, gruppiert in `Plattform` / `Netz` / `Auth` / `Storage & Backup`.
- **Flächenabdeckung** (Media, Productivity, AI, IoT, Apps) plus Push-Monitore für Batch-Jobs.

Alle Monitore senden via Single-Notifier "Keep" mit Default Enabled; Severity- und Topic-Routing entscheidet Keep. Details: [Uptime Kuma](../uptime-kuma/index.md#alerting).

## Zentrales Logging (Loki + Alloy)

### Architektur

```d2
direction: right

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
}

sources: Log-Quellen {
  class: container
  containers: Nomad-Container {class: svc}
  vms: HashiCorp-VMs\n(Server + Client) {class: svc}
  proxmox: Proxmox-Hosts {class: svc}
  infra: Infra-VMs\n(CheckMK, PBS, DNS) {class: svc}
  traefik: Traefik-VMs {class: svc}
  nas: NAS / Router {class: svc}
}

alloy: Grafana Alloy {
  class: container
  sys: System-Job\n(je Client-Node) {class: agent}
  ansible: Ansible-Rolle\n(systemd) {class: agent}
  standalone: Standalone\n(traefik-ha) {class: agent}
}

loki: Loki {class: db}
grafana: Grafana {class: svc}

sources.containers -> alloy.sys: Docker-Socket
sources.nas -> alloy.sys: Syslog UDP 1514
sources.vms -> alloy.ansible
sources.proxmox -> alloy.ansible
sources.infra -> alloy.ansible
sources.traefik -> alloy.standalone: Compose-Logs

alloy -> loki: push
loki -> grafana: LogQL
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
