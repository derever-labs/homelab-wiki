---
title: Monitoring Stack
description: Big Picture des Monitoring Stacks -- Sammelpfad, Check-Pfad und Alarm-Pfad mit Grafana, InfluxDB, Loki, Alloy, Telegraf, CheckMK, Uptime Kuma und Keep
tags:
  - service
  - monitoring
  - nomad
---

# Monitoring Stack

Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit. Er bündelt mehrere Dienste für Metriken, Logs, Verfügbarkeit und Alert-Routing. Diese Seite ist das Big Picture: drei Szenario-Diagramme zeigen, wie die Komponenten zusammenspielen -- Daten sammeln, aktiv prüfen, alarmieren.

Die Referenz-Tabellen (Alert-Regeln, Log-Quellen, Log-Levels) stehen in der [Monitoring Referenz](./referenz.md), die Betriebs-Prozeduren (Grafana-Admin, Silencing, Backup-Monitoring, Wartung) im [Monitoring Betrieb](./betrieb.md). Was überwacht wird und was bewusst nicht, hält die [Coverage](./coverage/) fest.

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
| **Telegraf** | Metriken-Collector (Prometheus, Exec, File) | — (Nomad Job) |
| **Loki** | Zentrales Log-Storage | [loki.ackermannprivat.ch](https://loki.ackermannprivat.ch) |
| **Grafana Alloy** | Log-Collector (System-Job + systemd + Docker) | — (läuft auf 15 Nodes) |
| **CheckMK** | Host-Level Monitoring (CPU, RAM, Disk, SMART) | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| **Uptime Kuma** | Synthetic-Monitoring (Kern-Infra + Flächenabdeckung + Push) | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |
| **USV (APC)** | USV-Monitoring via NUT-Server und Grafana Alerting | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) (`ups-apc-dashboard`) |
| **Synology NAS Monitoring** | NAS-Hardware-Health via CheckMK, lokaler Telegraf und NAS-Dashboard | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) (`synology-nas-health`) |

## Das Gesamtbild in drei Pfaden

Das Monitoring beantwortet drei Fragen, und jede hat ihren eigenen Pfad: Der **Sammelpfad** bringt Metriken und Logs in die Backends, der **Check-Pfad** prüft aktiv, ob Hosts und Services gesund sind, und der **Alarm-Pfad** macht aus einer Störung eine Telegram-Nachricht.

Lese-Konvention für alle drei Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer, Protokoll und Inhalt. **Durchgezogene** Kanten sind synchrone Abruf- oder Schreibflüsse (der Initiator wartet auf die Antwort), **gestrichelte** Kanten sind asynchron -- ereignisgetriebene Meldungen oder verbindungslose Streams.

### Sammelpfad -- Metriken und Logs

**Leitfrage:** Wie kommt eine Metrik oder eine Logzeile von der Quelle in die Grafana-Dashboards?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  agent: { style: { border-radius: 8; stroke-dash: 2 } }
  db: { shape: cylinder; style: { border-radius: 8 } }
  async: { style: { stroke-dash: 3 } }
}

mq: Metrik-Quellen {
  class: svc
  tooltip: Prometheus-Endpoints (Nomad, Linstor, DRBD, ZOT, Authentik) plus Jellyfin/arr via exec und file
}
lokal: Container-Logs + Journale {
  class: svc
  tooltip: Nomad-Container via Docker-Socket, VMs/Proxmox/Infra-Journale via Ansible-Alloy
}
netz: NAS + UniFi { class: svc }

telegraf: Telegraf { class: agent }
direkt: Direkt-Schreiber {
  class: agent
  tooltip: Proxmox (nativ), CheckMK-Forwarder, Telegraf-Host-Agenten der Nodes
}
alloy: Grafana Alloy { class: agent }

influx: InfluxDB { class: db }
loki: Loki { class: db }
grafana: Grafana { class: svc }

telegraf -> mq: 1. holt Metriken (HTTP / exec)
telegraf -> influx: 2. schreibt Zeitreihen (HTTP)
direkt -> influx: 3. schreiben direkt (HTTP)
alloy -> lokal: 4. liest Logs lokal
netz -> alloy: 5. sendet Syslog 1514 { class: async }
alloy -> loki: 6. pusht Logs (HTTP)
grafana -> influx: 7. fragt Metriken ab (InfluxQL)
grafana -> loki: 8. fragt Logs ab (LogQL)
```

Lesehilfe:

1. [Telegraf](./influxdb.md#telegraf-inputs) scrapt die Prometheus-Endpoints (Nomad-Cluster, Linstor, DRBD Reactor u.a.) und fragt Media-Stats via exec/file ab -- Initiator ist immer Telegraf.
2. Telegraf schreibt die Zeitreihen ins [InfluxDB](./influxdb.md) (`influxdb.service.consul:8086`, Bucket `telegraf`).
3. Drei Quellen schreiben ohne Telegraf-Umweg direkt: Proxmox (nativer Export), der [CheckMK-Forwarder](./influxdb.md#checkmk-als-zusatzliche-quelle) und die lokalen [Telegraf-Host-Agenten](./influxdb.md#node-metriken-ohne-nfs-telegraf-host-agent) der Nodes.
4. [Grafana Alloy](./alloy.md) liest auf jedem Node lokal: Container-Logs über den Docker-Socket, systemd-Journale über die Ansible-Variante.
5. NAS und UniFi senden ihre Logs selbst als Syslog an den Alloy-Receiver (Port 1514) -- verbindungslos, darum gestrichelt.
6. Alloy pusht alle Logs an [Loki](#zentrales-logging-loki-alloy) (`loki.service.consul:3100`).
7. Grafana fragt InfluxDB bei jedem Dashboard-Aufruf und jeder Alert-Auswertung ab (InfluxQL, für Alt-Queries Flux).
8. Grafana fragt Loki mit LogQL ab -- dieselben Queries treiben die log-basierten [Alert-Regeln](./referenz.md#alert-regeln).

### Check-Pfad -- aktive Überwachung

**Leitfrage:** Wer prüft aktiv, ob Hosts, Hardware und Services gesund sind -- und wer merkt es, wenn ein Batch-Job still stirbt?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  agent: { style: { border-radius: 8; stroke-dash: 2 } }
  db: { shape: cylinder; style: { border-radius: 8 } }
  async: { style: { stroke-dash: 3 } }
}

kuma: Uptime Kuma { class: svc }
checkmk: CheckMK {
  class: svc
  tooltip: Eigenständige VM auf pve02 (Site homelab), kein Nomad-Job
}

endpoints: Service-Endpoints {
  class: svc
  tooltip: Kern-Infra (Nomad/Consul/Vault, DNS, Ingress, Storage) plus Fläche (Media, Apps, IoT)
}
batch: Batch-Jobs {
  class: svc
  tooltip: Backups, Snapshots, Crons -- bei Fehler expliziter Down-Push mit Fehlergrund
}
agents: Agent-Hosts {
  class: svc
  tooltip: VMs und Proxmox-Hosts mit CheckMK-Agent, Nomad-Container via Docker-Piggyback
}
snmp: SNMP-Geräte {
  class: svc
  tooltip: Beide Synology-NAS (synology-nas, nana-nas via Tailscale)
}
pve: Proxmox-API { class: svc }
influx: InfluxDB { class: db }

kuma -> endpoints: 1. probt zyklisch (HTTP / TCP)
batch -> kuma: 2. pusht Heartbeat (HTTP /api/push) { class: async }
checkmk -> agents: 3. pollt Agenten (TLS 6556)
checkmk -> snmp: 4. pollt Hardware (SNMPv3)
checkmk -> pve: 5. proxmox_ve (HTTPS)
checkmk -> influx: 6. streamt Perf-Metriken (Forwarder, HTTP)
kuma -> checkmk: 7. probt die CheckMK-Site (HTTP)
```

Lesehilfe:

1. [Uptime Kuma](./uptime-kuma/) probt zyklisch HTTP- und TCP-Endpoints -- Kern-Infrastruktur alarmiert sofort, dazu Flächenabdeckung über alle End-User-Services.
2. Batch-Jobs (Backups, Crons) [pushen nach Erfolg einen Heartbeat](./uptime-kuma/index.md#push-monitore-batch-jobs); bleibt der Push aus, geht der Monitor auf Down. Ereignisgetrieben, darum gestrichelt.
3. [CheckMK](./checkmk/) pollt seine Agenten über TLS auf Port 6556; Nomad-Container kommen als Docker-Piggyback-Hosts mit.
4. Die Hardware beider Synology-NAS (Disks, RAID, Lüfter) fragt CheckMK über SNMPv3 ab.
5. Der Special-Agent `proxmox_ve` holt VM-Status und Hypervisor-Sicht über die Proxmox-API.
6. Die Service-Performance-Metriken streamt CheckMK zusätzlich in den `telegraf`-Bucket von [InfluxDB](./influxdb.md#checkmk-als-zusatzliche-quelle) -- nur für Dashboards, der Alert-Zustand bleibt im CheckMK-Core.
7. Checker prüft Checker: Kuma probt die CheckMK-Web-UI, denn CheckMK ist Single-Instance ohne Failover -- siehe [Ausfallverhalten](#ausfallverhalten).

Die Aufgabenteilung der beiden Checker -- was über CheckMK, was über Telegraf, Loki oder Kuma läuft -- ist in der [Strategie](./coverage/strategie.md) festgehalten. Wohin beide Checker ihre Befunde melden, zeigt der [Alarm-Pfad](#alarm-pfad-von-der-storung-zur-telegram-nachricht).

### Alarm-Pfad -- von der Störung zur Telegram-Nachricht

**Leitfrage:** Wie wird aus einem erkannten Problem eine Telegram-Nachricht -- und wer meldet sich, wenn Keep selbst tot ist?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  agent: { style: { border-radius: 8; stroke-dash: 2 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  sink: { shape: hexagon; style: { border-radius: 8 } }
  async: { style: { stroke-dash: 3 } }
}

grafana: Grafana Unified Alerting {
  class: svc
  tooltip: wertet Alert-Rules gegen InfluxDB (Metriken) und Loki (Logs) aus
}
kuma: Uptime Kuma { class: svc }
apps: Apps + Melde-Jobs {
  class: svc
  tooltip: Authentik, arr-Stack, Immo-Scraper, renovate-backlog-watchdog, Stale-CRIT-Melder, keep-escalate-stale
}
checkmk: CheckMK {
  class: svc
  tooltip: eine aktive Notification-Rule Keep Hub Notifier (Webhook-Plugin an Keep)
}

keep: Keep (Incident-Hub) {
  class: svc
  tooltip: Identification, dann Correlation (2 Rules), dann 4 Incident-Workflows
}
bot: batch-Bot {
  class: agent
  tooltip: alleiniger Sender in den Telegram-Channel Homelab Alerts
}
wd: Watchdog-Tier {
  class: agent
  tooltip: keep-heartbeat-watch plus drei Kuma-Instanzen (in-cluster, wd-home, wd-nana Dottikon)
}

topics: Homelab Alerts (Telegram-Forum) {
  class: container
  krit: Kritisch { class: sink }
  warn: Warnung { class: sink }
  info: Info { class: sink }
}

grafana -> keep: 1. Webhook bei Rule-Verletzung { class: async }
kuma -> keep: 2. Webhook bei Down/Up { class: async }
apps -> keep: 3. Webhook bei App-Fehler { class: async }
checkmk -> keep: 4. Webhook bei Statusänderung { class: async }
keep -> bot: 5. Incident-Workflows senden (Bot-API) { class: async }
bot -> topics.krit: 6. critical / high / fail-open { class: async }
bot -> topics.warn: 6. warning { class: async }
bot -> topics.info: 6. info / low { class: async }
wd -> bot: 7. meldet Keep-Ausfall (Keep-unabhängig) { class: async }
```

Lesehilfe (alle Kanten ereignisgetrieben, darum durchgehend gestrichelt):

1. Grafana Unified Alerting postet verletzte Rules als Webhook auf `keep.ackermannprivat.ch/alerts/event/grafana` (Contact Point `keep-webhook`, Group-Wait 30s, Repeat 4h).
2. Uptime Kuma meldet Down/Up über den Single-Notifier ["Keep"](./uptime-kuma/index.md#alerting) an `/alerts/event/uptime-kuma`.
3. Apps mit eigenem Alerting (Authentik, arr-Stack, Immo-Scraper) und periodische Melde-Jobs (renovate-backlog-watchdog, [Stale-CRIT-Melder](#ausfallverhalten), keep-escalate-stale) posten direkt an `/alerts/event/...`.
4. [CheckMK](./checkmk/index.md#alarmierung) meldet jede Host- und Service-Statusänderung über seine einzige aktive Benachrichtigungsregel "Keep Hub Notifier" (Webhook-Notification-Plugin, Single-Notifier seit 2026-05-01) an denselben Hub.
5. [Keep](./keep/) reichert an, korreliert zu Incidents (zwei Grouping-Rules) und sendet über die vier `type:incident`-Workflows -- alle über den [batch-Bot](./keep/telegram-bots.md).
6. Der Bot postet nach **Incident-Severity** in eines von drei Forum-Topics: Kritisch (`critical`/`high` + fail-open), Warnung (`warning`), Info (`info`/`low`). Stummschalten ist Telegram-natives Per-Topic-Mute.
7. Das [Watchdog-Tier](./keep/index.md#dead-man-switch-und-watchdog-tier) (Dead-Man-Switch plus drei Kuma-Instanzen) umgeht die Keep-Engine und meldet einen Keep-Ausfall über den batch-Bot direkt ins Kritisch-Topic.

::: info Routing-Logik
Keep korreliert eingehende Alerts zu **Incidents** (zwei disjunkte Grouping-Rules). Die vier `type:incident`-Workflows posten je nach **Incident-Severity** über den batch-Bot in eines von drei Forum-Topics: Kritisch (`critical`/`high` + fail-open), Warnung (`warning`), Info (`info`/`low`). Der frühere VIP-Bot-1:1-Pfad ist seit 2026-06-09 abgelöst. Details: [Keep](./keep/), [Telegram-Bots](./keep/telegram-bots.md).
:::

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss -- je mit dem Mechanismus, der den blinden Fleck abdeckt:

- **Was, wenn Keep down ist?** Dann sind alle vier Quellen betroffen -- seit der Keep-Anbindung von CheckMK gibt es keinen Alarmweg mehr an Keep vorbei. Eingehende Webhooks gehen während der Downtime verloren (kein Retry-Buffer); wiederholende Quellen wie Grafana liefern beim nächsten Re-Send nach, einmalige Events und CheckMK-Zustandswechsel (CheckMK notifiziert nur beim Übergang) nicht. Sichtbar wird der Ausfall durch das Keep-unabhängige [Watchdog-Tier](./keep/index.md#dead-man-switch-und-watchdog-tier): der Dead-Man-Switch pusht alle 3 Minuten einen Kuma-Heartbeat, drei Kuma-Instanzen (in-cluster, wd-home, wd-nana in Dottikon) alarmieren über den batch-Bot direkt ins Kritisch-Topic. Echte Unabhängigkeit vom Cluster liefert nur `wd-nana`.

- **Was, wenn InfluxDB voll oder tot ist?** Telegraf-Writes schlagen fehl und die Metrik-Alerts (Pfad 3) werden blind. Den Totalausfall fängt der periodische Job `metrics-deadman` (alle 5 Minuten): er prüft, ob InfluxDB frische Nomad-Metriken hat, und pusht einen Kuma-Heartbeat -- bleibt der aus, alarmiert Kuma. Hintergrund: Ein Telegraf/InfluxDB-Totalausfall blieb im Juni 2026 neun Tage unbemerkt. Gegen Volllaufen: Retention 90 Tage plus [Downsampling-Tasks](./betrieb.md#influxdb-downsampling-tasks); die Retention-Policies müssen manuell gesetzt sein (siehe [InfluxDB & Telegraf](./influxdb.md#buckets)).

- **Was, wenn Grafana down ist?** Metrik- und Log-Alerts (Pfad 2/3) sind still -- die Schwellwert-Logik lebt ausschliesslich in Grafana. Der Check-Pfad läuft weiter: Uptime Kuma probt Grafana selbst (externe Watchdog-Probe), CheckMK und Kuma melden unabhängig weiter.

- **Was, wenn die CheckMK-VM down ist?** Alle Special-Agent- und SNMP-Targets (NAS-Hardware, Proxmox-Sicht) sind silent -- CheckMK ist Single-Instance ohne Failover. Eine Kuma-Probe gegen die CheckMK-Site macht den Ausfall sichtbar; die Innensicht der VMs liefert weiterhin der Sammelpfad.

- **Was, wenn ein Problem stumm bleibt, weil nie ein Zustandswechsel eintritt?** Zwei periodische Jobs schliessen die Event-Lücken: der **Stale-CRIT-Melder** fragt die CheckMK-REST-API nach Hard-Problemen, die nie notifiziert wurden (`current_notification_number=0`), und meldet sie aggregiert an Keep; **keep-escalate-stale** eskaliert firing-Incidents, die älter als 24 Stunden unbeantwortet auf `warning` stehen, ins Kritisch-Topic (siehe [Keep -- Zeit-Eskalation](./keep/index.md#zeit-eskalation-unbeantworteter-incidents)).

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
- **Alerting:** Unified Alerting aktiv, Alert Rules via File Provisioning.
- **Scheduling:** Kein Node-Constraint mehr (CSI-Abhängigkeit entfällt), Affinität auf client-05/06 beibehalten.

::: info Auth-Kette für den GitOps-Push
Der Runner holt sich das Grafana Service-Account Token aus Vault: JWT-Role `github-runner-deploy` (gebunden an `nomad_job_id=github-runner`) bekommt die Policy `grafana-deploy-fetch`, die nur das Feld `service_account_token` in `kv/data/grafana` lesen darf. Die Grafana-Adresse wird dynamisch über den Consul-Catalog aufgelöst, damit der Workflow unabhängig von dynamischen Nomad-Ports funktioniert und Authentik umgeht. Pattern ist symmetrisch zu `nomad-deploy-fetch` -- siehe [GitHub Runner Referenz](../dienste/github-runner/referenz.md).
:::

### Alerting (Unified Alerting)

Grafana Unified Alerting ist die zentrale Stelle, an der metrikbasierte und log-basierte Alert-Rules ausgewertet werden. Der Versand an Telegram läuft nicht direkt aus Grafana, sondern über den zentralen Hub [Keep](./keep/) -- siehe [Alarm-Pfad](#alarm-pfad-von-der-storung-zur-telegram-nachricht).

**Contact Point:** Webhook auf `https://keep.ackermannprivat.ch/alerts/event/grafana`
**Notification Policy:** Alle Alerts -> Keep, Group-Wait 30s, Repeat 4h

Die vollständigen metrik- und log-basierten Alert-Regel-Tabellen stehen in der [Monitoring Referenz](./referenz.md#alert-regeln). Der interne Admin-Zugang zur Grafana-HTTP-API (Service Account) und das Silencing von Alerts über die Alertmanager-API sind im [Monitoring Betrieb](./betrieb.md) beschrieben.

## Verfügbarkeits-Monitoring (Uptime Kuma)

Uptime Kuma ist seit dem Gatus-Rückbau (2026-06-10) die einzige Synthetic-Monitoring-Schicht:

- **Kern-Infrastruktur** (Ingress, SSO, DNS, Nomad/Consul/Vault x3, Speicher) -- jeder Endpoint alarmiert sofort, gruppiert in `Plattform` / `Netz` / `Auth` / `Storage & Backup`.
- **Flächenabdeckung** (Media, Productivity, AI, IoT, Apps) plus Push-Monitore für Batch-Jobs.

Alle Monitore senden via Single-Notifier "Keep" mit Default Enabled; Severity- und Topic-Routing entscheidet Keep. Details: [Uptime Kuma](./uptime-kuma/index.md#alerting).

## Zentrales Logging (Loki + Alloy)

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

Das Architektur-Diagramm der drei Deployment-Arten, die Playbook-Tabelle, das Label-Schema und Log-Query-Beispiele sind in [Grafana Alloy](./alloy.md) gepflegt. Die SSOT für die Zuordnung Host -> Methode -> Source-Label ist die [Log-Quellen-Übersicht](./referenz.md#log-quellen) in der Referenz.

Die Log-Level je Komponente listet die [Monitoring Referenz](./referenz.md#log-levels). Grafana-Admin, Silencing, Backup-Monitoring und die Wartung (Grafana Dashboards, InfluxDB Downsampling-Tasks) sind im [Monitoring Betrieb](./betrieb.md) beschrieben.

## Verwandte Seiten

- [Monitoring Referenz](./referenz.md) -- Alert-Regeln, Log-Quellen und Log-Levels
- [Monitoring Betrieb](./betrieb.md) -- Grafana-Admin, Silencing, Backup-Monitoring, Wartung
- [Coverage](./coverage/) -- Welcher Host und Service wird wie überwacht und was bewusst ausgelassen
- [Strategie](./coverage/strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [CheckMK](./checkmk/) -- Host-Level Monitoring (CPU, RAM, Disk) inkl. Cluster-Inventar
- [CheckMK Discovery-Policy](./checkmk/discovery.md) -- Service-Klassifikation pro Host-Typ und Discovery-Filter (Free-Tier-Limit-Mitigation)
- [Uptime Kuma](./uptime-kuma/) -- Synthetic-Monitoring (Kern-Infra + Flächenabdeckung + Push)
- [Keep](./keep/) -- Incident-Hub mit Source/Severity-Routing in die Telegram-Forum-Topics
- [Telegram-Bots](./keep/telegram-bots.md) -- Bot- und Channel-Inventar (batch-Bot + Severity-Topics; vip idle)
- [InfluxDB & Telegraf](./influxdb.md) -- Metriken-Backend, Buckets, Inputs und Direkt-Schreiber
- [Grafana Alloy](./alloy.md) -- Log-Collector mit drei Deployment-Arten
- Die Migration der Grafana-Dashboards und Alert-Rules von Flux auf InfluxQL erfolgte im April 2026, Details in der Git-History.
- [Backup-Strategie](../storage/backup/index.md) -- Backup-Monitoring via Uptime Kuma Push
- [Linstor/DRBD](../storage/linstor/index.md) -- CSI Volume für Loki
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Periodische Monitoring- und Wartungs-Jobs
- [Synology NAS Monitoring](./synology-monitoring/index.md) -- Dediziertes NAS-Dashboard (CheckMK-Hardware-Health) mit Alerting
- [USV (APC)](./ups/index.md) -- USV-Monitoring via NUT und Grafana Alerting
