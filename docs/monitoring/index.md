---
title: Monitoring Stack
description: Übersicht des Monitoring Stacks -- Grafana, InfluxDB, Loki, Alloy, Telegraf, CheckMK, Uptime Kuma und Gatus
tags:
  - service
  - monitoring
  - nomad
---

# Monitoring Stack

## Übersicht

Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit.

- **Nomad Jobs** -- `monitoring/`, `system/alloy.nomad`
- **Deployment** -- Mehrere Nomad Jobs + Ansible (Alloy systemd)
- **IPs** -- [Hosts und IPs](../_referenz/hosts-und-ips.md)

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Keep** | Incident-Hub, Alert-Routing, Dedup | [keep.ackermannprivat.ch](https://keep.ackermannprivat.ch) |
| **Grafana** | Dashboards, Metriken, Log-Alerts | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) |
| **InfluxDB** | Time-Series Metriken-Backend | [influx.ackermannprivat.ch](https://influx.ackermannprivat.ch) |
| **Telegraf** | Metriken-Collector (SNMP, Prometheus, Exec) | — (Nomad Job) |
| **Loki** | Zentrales Log-Storage | [loki.ackermannprivat.ch](https://loki.ackermannprivat.ch) |
| **Grafana Alloy** | Log-Collector (System-Job + systemd + Docker) | — (läuft auf 15 Nodes) |
| **CheckMK** | Host-Level Monitoring (CPU, RAM, Disk, SMART) | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| **Uptime Kuma** | Verfügbarkeits-Checks | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |
| **Gatus** | Öffentliche Status-Seite | [status.ackermannprivat.ch](https://status.ackermannprivat.ch) |

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
Grafana Unified Alerting ist die zentrale Stelle, an der metrikbasierte und log-basierte Alert-Rules ausgewertet werden. Der Versand an Telegram laeuft seither nicht mehr direkt aus Grafana, sondern ueber den zentralen Hub [Keep](keep.md).

**Contact Point:** Webhook auf `https://keep.ackermannprivat.ch/alerts/event/grafana`
**Notification Policy:** Alle Alerts -> Keep, Group-Wait 30s, Repeat 4h

Keep uebernimmt anschliessend Source-Routing in Forum-Topics, Severity-Eskalation an den VIP-Bot und Deduplizierung. Details siehe [Keep](keep.md).

**Metrik-basierte Alert Rules (InfluxDB):**

| Rule | Bedingung | For | Severity |
| :--- | :--- | :--- | :--- |
| LVM Thin Pool > 75% | `data_percent > 75` | 5min | Warning |
| LVM Thin Pool > 85% | `data_percent > 85` | 2min | Critical |
| LVM Metadata > 75% | `metadata_percent > 75` | 5min | Warning |
| DRBD Out-of-Sync | `outofsync_bytes > 0` | 10min | Warning |
| DRBD Disconnected | `Connected != 1` | 5min | Critical |

**Log-basierte Alert Rules (Loki):**

| Rule | Bedingung | For | Severity |
| :--- | :--- | :--- | :--- |
| Failed SSH Logins | `>5 "Failed password" in 5min` | sofort | Warning |
| Traefik 5xx Spike | `>20 HTTP-5xx in 5min` | sofort | Warning |
| Nomad Alloc Failed | `"alloc failed" in 10min` | sofort | Critical |
| Vault Permission Denied | `>10 "permission denied" in 5min` | sofort | Warning |

**Hinweis:** Die Alert-Annotations verwenden Grafana Template-Variablen (`$labels`, `$values`), die für Nomads Template-Engine escaped werden müssen (doppelte geschweifte Klammern in HCL-Templates).

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
  gatus: Gatus {class: svc}
  kuma: Uptime Kuma {class: svc}
  authentik: Authentik {class: svc}
  arr: Sonarr/Radarr/Prowlarr {class: svc}
  notifiarr: Notifiarr {class: svc}
  immo: Immo-Scraper {class: svc}
  checkmk: CheckMK {class: svc}
}

# --- Logs/Metrics fuer Pfad 2/3 ---
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
  tooltip: "Standard-Schiene; postet in Forum-Topics"
}
bot_vip: vip-Bot\ntop_uptime_ackermann_bot {
  class: agent
  tooltip: "Critical-Eskalation; postet im 1:1-Chat"
}

homelab_alerts: Homelab Alerts\nForum-Channel\n(chat-id -1003971798942) {
  class: container
  monitoring: Topic 3 monitoring {class: sink}
  security: Topic 4 security {class: sink}
  cicd: Topic 5 ci-cd {class: sink}
  backup: Topic 6 backup {class: sink}
  downloader: Topic 7 downloader {class: sink}
  immo: Topic 8 immo {class: sink}
}

vip_chat: 1:1 Chat\n(chat-id 813893907) {
  class: sink
}

# Pfad 1: Direct-Webhook
direct.gatus -> keep: webhook
direct.kuma -> keep: webhook
direct.authentik -> keep: webhook
direct.arr -> keep: webhook
direct.notifiarr -> keep: webhook
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

# Keep -> Bots -> Topics
keep -> bot_batch: "default + alle Severitaeten"
keep -> bot_vip: "critical / high / page"
bot_batch -> homelab_alerts.monitoring
bot_batch -> homelab_alerts.security
bot_batch -> homelab_alerts.cicd
bot_batch -> homelab_alerts.backup
bot_batch -> homelab_alerts.downloader
bot_batch -> homelab_alerts.immo
bot_vip -> vip_chat
```

::: info Routing-Logik
**Source -> Topic** wird vom Keep-Workflow per Source-Regex bestimmt (`homelab-route-monitoring|security|cicd|backup|downloader|immo`). **Severity -> Bot** laeuft als `if`-Condition innerhalb desselben Workflows. Standard-Alerts gehen ueber den batch-Bot in den passenden Forum-Topic, `critical|high|page` eskaliert zusaetzlich an den vip-Bot in den 1:1-Chat.
:::

### Admin-Zugang zur Grafana-HTTP-API

Interner Admin-Zugang (ohne Authentik-ForwardAuth) läuft über einen Grafana Service Account mit Bearer-Token:

- 1P-Item `Grafana API Claude` (Vault `PRIVAT Agent`) -- SA-Name `claude-automation`, Admin-Rolle, ewiges Token
- Aufruf-Pfad: SSH-Tunnel auf einen Nomad-Client, Target ist `grafana.service.consul` mit dynamischem Nomad-Port aus dem Consul-Catalog
- Authentik-Kette entfällt, solange der Tunnel direkt auf die Container-Adresse zielt

Für GitOps-Deploys (Dashboards) existiert weiterhin der separate SA `gitops-dashboards`, dessen Token über Vault gezogen wird -- siehe [Deployment](#deployment).

### Alerts silencen

Silences werden über die Alertmanager-API gesetzt, nicht über die UI -- so bleibt die Silence-Historie im Git-Workflow nachvollziehbar und Silences sind scriptbar.

- Endpoint: `POST /api/alertmanager/grafana/api/v2/silences`
- Matcher nach `alertname` (mit `isRegex` für Pattern), Laufzeit per `startsAt`/`endsAt`, Grund ins `comment`-Feld mit ClickUp-Task-Referenz
- Silence-ID in den ClickUp-Task schreiben, damit das Entfernen nach Fix zurückverfolgbar ist

::: info Silence-Policy
Silences müssen einen ClickUp-Task referenzieren und eine Laufzeit (14--30 Tage) haben. Ohne Laufzeit-Limit verlieren sich Silences im Noise. Wenn ein Silence ausläuft bevor die Ursache gefixt ist, erzeugt der erneute Alert den Druck, den Fix zu priorisieren.
:::

## Verfuegbarkeits-Monitoring (Gatus + Uptime Kuma)

Das Homelab hat **zwei** Verfuegbarkeits-Monitore, bewusst mit Aufgabenteilung statt Ueberlappung:

- **Gatus** -- Nur Kern-Infrastruktur (Ingress, SSO, DNS, Nomad/Consul/Vault x3, Speicher). Jeder Endpoint alarmiert sofort via `custom`-Provider → `telegram-relay` → Topic `monitoring`. Details: [Gatus](../gatus/index.md).
- **Uptime Kuma** -- Alles andere (Media, Productivity, AI, IoT, Apps) plus Push-Monitore fuer Batch-Jobs. Alarmierung optional pro Monitor. Details: [Uptime Kuma](../uptime-kuma/index.md).

Die Kern-Infra wird zusaetzlich als zweite Meinung in Kuma dupliziert -- faellt Gatus aus, bleibt die Sicht auf die Basisdienste bestehen. Der SOLL-Zustand dieser Kopie ist in [Uptime Kuma](../uptime-kuma/index.md#kern-infra-mindestabdeckung) gepflegt.

## Backup-Monitoring

### Linstor Backup Monitor
Ein separates Script (`/usr/local/bin/linstor-backup-monitor.sh`) prüft um 06:00 Uhr den Status der S3-Backups und meldet via Uptime Kuma Push.

### PostgreSQL Backup
Der Nomad Batch-Job `postgres-backup` führt täglich ein `pg_dumpall` durch und sichert auf NFS (`/nfs/backup/postgres/`). Status wird via Uptime Kuma Push gemeldet.

## Zentrales Logging (Loki + Alloy)

### Gesamtarchitektur

```d2
direction: right

Sources: Infrastruktur-Quellen {
  style.stroke-dash: 4
  Containers: "Nomad Container\n(3 Client-Nodes)"
  Servers: "HashiCorp VMs\n(Server + Client)"
  Traefik: "Traefik VMs (2x)"
  Proxmox: "Proxmox Hosts (3x)"
  Infra: "Infra VMs\n(CheckMK, PBS, DNS)"
  NAS: "NAS / Router\n(Syslog)"
}

Collectors: Collector-Layer {
  style.stroke-dash: 4
  Alloy: "Grafana Alloy\n(System-Job + systemd)"
  Telegraf: "Telegraf\n(Nomad Job)"
  CMK: "CheckMK Agent"
  Kuma: "Uptime Kuma"
  Gatus: Gatus
}

Storage: Storage-Layer {
  style.stroke-dash: 4
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
Sources.NAS -> Collectors.Telegraf: SNMP
Sources.Servers -> Collectors.Telegraf: Prometheus
Sources.Proxmox -> Storage.Influx: direkt (nativ)

Collectors.Alloy -> Storage.Loki
Collectors.Telegraf -> Storage.Influx
Collectors.CMK -> Storage.CheckMK
Collectors.Kuma -> GRAF: "HTTP/TCP-Checks"
Collectors.Gatus -> GRAF: "Public Status"

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

Alloy sammelt Logs aus allen Infrastruktur-Komponenten und leitet sie an Loki weiter. Je nach Deployment-Art gibt es drei Varianten:

#### Variante 1: Nomad System-Job (Container-Logs)
- **Nomad Job:** `system/alloy.nomad` (System-Job, läuft auf jedem Client-Node)
- **Docker-Socket:** `/var/run/docker.sock` (read-only) für Container-Discovery
- **Labels:** Extrahiert `nomad_task` aus Container-Name, `nomad_alloc_id` aus Docker-Labels
- **External Label:** `node` (Hostname des Client-Nodes)
- **Syslog-Receiver:** Port 1514 (TCP+UDP, statisch) für externe Quellen (NAS, Router)

#### Variante 2: Ansible-Rolle `alloy` (systemd-Service)
- **Rolle:** `ansible/roles/alloy/`
- **Config-Template:** `config.alloy.j2` (River-Syntax)
- **Quellen:** systemd-Journal + optionale Datei-Targets
- **Loki-Endpoint:** `loki.service.consul:3100` (via Consul DNS)

| Playbook | Hosts | Source-Label | Besonderheiten |
| :--- | :--- | :--- | :--- |
| `deploy-alloy.yml` | Server- & Client-Nodes | `journal` / `nomad-client` | Client-Nodes: Linstor-Logs als File-Target |
| `deploy-alloy-proxmox.yml` | pve00, pve01, pve02 | `proxmox` | `www-data`-Gruppe für pveproxy-Logs |
| `deploy-alloy-infra.yml` | CheckMK, PBS, PDM, lxc-dns-01/02, Traefik, Zigbee | je nach Host | CheckMK: Core/Web/Notify-Logs |

#### Variante 3: Systemd-Service (vm-traefik-01/02)
- **Config:** Ansible-Rolle `alloy`
- **Quelle:** systemd-Journal + optionale Datei-Targets (Traefik Access Logs)
- **DNS:** Pi-hole-Resolver für Consul-Auflösung (IPs: [Hosts und IPs](../_referenz/hosts-und-ips.md))

### Übersicht aller Log-Quellen

| Host / Gruppe | Methode | Source-Label |
| :--- | :--- | :--- |
| vm-nomad-client-04/05/06 | Nomad System-Job | `docker` |
| vm-nomad-server-04/05/06 | Ansible (systemd) | `journal` |
| vm-nomad-client-04/05/06 | Ansible (systemd) | `nomad-client` |
| vm-traefik-01/02 | Ansible (systemd) | `traefik` |
| pve00, pve01, pve02 | Ansible (systemd) | `proxmox` |
| CheckMK | Ansible (systemd) | `checkmk` |
| PBS | Ansible (systemd) | `pbs` |
| Datacenter Manager | Ansible (systemd) | `datacenter-manager` |
| lxc-dns-01/02 | Ansible (systemd) | `dns` |
| Zigbee-Node | Ansible (systemd) | `iot` |
| Vault Audit-Log (Server VMs) | Ansible (systemd) | `vault-audit` |
| Synology NAS | Syslog → Alloy Receiver | `syslog` |
| UniFi | Syslog → Alloy Receiver | `syslog` |

### Log-Levels

| Komponente | Log-Level | Konfigurationsort |
| :--- | :--- | :--- |
| Loki | `warn` | `monitoring/loki.nomad` |
| Grafana | `info` | `monitoring/grafana.nomad` |
| Nomad | `INFO` | `ansible/roles/nomad/defaults/main.yml` |
| Consul | `WARN` | `ansible/roles/consul/defaults/main.yml` |
| Vault | `INFO` | `ansible/roles/vault/defaults/main.yml` |
| Authentik | `info` | `identity/authentik.nomad` |
| Traefik (Core) | `WARN` | `traefik.yml.j2` |
| Traefik (Access) | aktiv (JSON, stdout) | Filter: `statusCodes: 400-599` + `minDuration: 2s` + `retryAttempts`; Rotation via Docker-Log-Driver |

### Log-Abfrage in Grafana
- Datasource: **Loki** (uid: `loki-logs`)
- Beispiel-Queries:
  - `{nomad_task="grafana"}` — Alle Grafana-Logs
  - `{node="vm-nomad-client-05"}` — Alle Logs von client-05
  - `{nomad_task="prowlarr"} |= "error"` — Prowlarr-Fehler
  - `{source="proxmox"}` — Alle Proxmox-Host-Logs
  - `{source="checkmk"}` — CheckMK-Logs
  - `{source="syslog"}` — Syslog-Quellen (NAS, Router)
  - `{job="journal"} |= "error"` — Journal-Fehler aller Infra-VMs

## Wartung
### Grafana Dashboards
Dashboards sind als JSON unter `nomad-jobs/monitoring/grafana-dashboards/` im Git versioniert. Jeder Merge auf `main` triggert den Workflow `deploy-grafana-dashboards.yml`, der nur die geänderten Dashboards via API nach Grafana pusht. Rollbacks laufen über `git revert` -- der Workflow pushed die vorherige Version zurück. Manuelle UI-Änderungen gehen bis zum nächsten API-Push -- für dauerhafte Änderungen muss das JSON ins Git.

::: tip Initial-Upload / force-all
Der Workflow kennt einen `workflow_dispatch` mit Flag `force_all`, der alle Dashboards (ausser `_backup`/`_research`) einmal durchpusht. Wird nach grösseren Refactorings oder bei Neueinrichtung einer Grafana-Instanz genutzt.
:::

### InfluxDB Downsampling-Tasks
6 Flux-Tasks in der InfluxDB-UI aggregieren Rohdaten in 1y- und 5y-Buckets (`telegraf`, `proxmox`, `homeassistant`). Source-of-Truth ist `nomad-jobs/monitoring/influxdb-tasks/` -- das README dort dokumentiert Task-IDs, Zeitpläne und den Import-Pfad in die UI. Jeder Task sendet einen Heartbeat an einen Uptime-Kuma Push-Monitor, sodass ein Task-Ausfall innert ~1h auffällt.

## Verwandte Seiten

- [Keep](./keep.md) -- Incident-Hub mit Source/Severity-Routing in die Telegram-Forum-Topics
- [Telegram-Bots](./telegram-bots.md) -- Bot- und Channel-Inventar (default/vip/batch + Topic-IDs)
- [Migration Flux → InfluxQL](./migration-flux-zu-influxql.md) -- Retrospektive der April-2026 Query-Sprach-Migration, Trade-offs, HART-Budget, entdeckte Source-Drifts
- [CheckMK Monitoring](../checkmk/index.md) -- Host-Level Monitoring (CPU, RAM, Disk)
- [Gatus](../gatus/index.md) -- Öffentliche Status-Seite für Endpoint-Verfügbarkeit
- [Backup-Strategie](../backup/index.md) -- Backup-Monitoring via Uptime Kuma Push
- [Linstor/DRBD](../linstor-storage/index.md) -- CSI Volume für Loki
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Periodische Monitoring- und Wartungs-Jobs
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Dediziertes NAS-Dashboard mit Telegraf SNMP und Alerting
- [USV (APC)](../ups/index.md) -- USV-Monitoring via NUT und Grafana Alerting
