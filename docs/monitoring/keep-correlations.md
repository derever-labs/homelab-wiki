---
title: "Monitoring: Keep-Correlations"
description: Correlation-Patterns fuer Keep -- Gruppierung mehrerer Alerts zu einem Incident, mit Severity- und Inhibit-Logik
tags:
  - monitoring
  - keep
  - correlations
  - alerts
  - incident
---

# Monitoring: Keep-Correlations

Diese Seite dokumentiert die Correlation-Patterns fuer Keep. Correlations gruppieren mehrere Alerts zu einem Incident, damit der Operator nicht 12 Telegram-Pings fuer ein einzelnes Storage-Outage bekommt. Stand: 2026-05-02. Status: **Design** -- Live-Anlage in Keep erst nach Welle 2, wenn Source-Alerts existieren. Quelle: Coverage-Audit 2026-04-30 / 2026-05-01.

::: info Status Design vs Live
Die Patterns sind designet, aber die Source-Alerts existieren noch nicht in Welle 2/3. Sobald Source-Alerts angelegt werden, setzen sie das Label `correlation_key=<pattern-name>`. Erst nach Welle 2 wird die Correlation-Rule in Keep angelegt -- siehe Live-Anlage-Reihenfolge unten.
:::

## Zweck

Correlations gruppieren mehrere Alerts zu einem Incident, damit der Operator nicht mehrere Telegram-Pings fuer ein einzelnes Storage-Outage bekommt. Dieses Dokument haelt die geplanten Patterns fest, bevor die Source-Alerts in Welle 2/3 gebaut werden, damit die Welle-2/3-Subtasks von Anfang an die richtigen Labels setzen.

## Konvention: Label `correlation_key`

Jeder Alert/Workflow, der Mitglied einer Correlation ist, setzt das Label `correlation_key=<pattern-name>`. Keep matcht darauf in der Correlation-Rule.

- Pattern-Namen sind cluster-uebergreifend identisch -- `auth-cascade` matcht sowohl DCLab als auch Homelab
- Cluster-Disambiguierung ueber zusaetzliches Label `cluster=dclab|homelab`
- Welle-2/3-Alert-Subtasks bekommen in der ClickUp-Description den expliziten Hinweis: "Labels: `correlation_key=<name>`, `cluster=<dclab|homelab>`"

## Severity-Logik

Keep berechnet die Effective-Severity einer Correlation aus den Member-Alerts:

- mindestens 1 Member `critical` -> Correlation `critical`
- Alle Members `warning` und mindestens 3 Stueck -> Correlation `critical` (Storm-Eskalation)
- Sonst: Correlation-Severity = hoechste Member-Severity

## Inhibit-Logik

Eine Correlation kann andere Alerts unterdruecken (Storm-Reduktion). Wird als Keep-Workflow modelliert, nicht als native Correlation-Rule. Beispiel: bei aktiver `observability-pipeline-down` werden `loki-no-data`-Alerts geschluckt, weil sie Folge der Pipeline sind, nicht eigenstaendige Issues.

## Pattern-Katalog

### 1. power-outage

- **Cluster-Scope**: beide (cluster-spezifisch via `cluster=`-Label)
- **Trigger-Alerts**: USV-On-Battery, USV-Battery-Low, PSU-Failure, Host-Down (mind. 2 gleichzeitig), ZFS-Pool-Degraded
- **Symptome**: kompletter Cluster oder Teil davon offline, ggf. ZFS-Pool im Recovery
- **Inhibit**: alle Service-Down-Alerts dieses Clusters
- **Action**: Telegram-Topic "Outage", Severity critical, Eskalation auf User-Handy

### 2. cluster-storage-outage

- **Cluster-Scope**: beide
- **Trigger-Alerts**: LINSTOR-Quorum-Lost, DRBD-Diskless, CSI-Plugin-Unhealthy, App-Volume-Mount-Failed
- **Symptome**: Multiple Apps koennen nicht mehr lesen/schreiben
- **Inhibit**: App-Crashloop-Alerts dieses Clusters
- **Action**: Forum-Topic "Storage", Severity critical

### 3. auth-cascade

- **Cluster-Scope**: beide
- **Trigger-Alerts**: Authentik-PG-Connection-Storm, ForwardAuth-502, Authentik-Worker-Restart-Loop, Outpost-Down
- **Symptome**: alle Apps hinter Authentik werfen 502
- **Inhibit**: einzelne App-502-Alerts wenn Authentik selbst betroffen ist
- **Action**: Forum-Topic "Auth", Severity escalation gemaess Severity-Logik

### 4. dns-outage

- **Cluster-Scope**: beide (cluster-spezifische Trigger)
- **Trigger-Alerts Homelab**: Pi-hole-Double-Down (10.0.2.1 + 10.0.2.2), DNS-Resolution-Failure (synthetisch)
- **Trigger-Alerts DCLab**: OPNsense-Pair-Down, DNS-Resolution-Failure (synthetisch)
- **Symptome**: Service-Discovery bricht weg, alles wirkt offline obwohl Apps laufen
- **Inhibit**: alle Service-Down-Alerts dieses Clusters
- **Action**: Telegram-Topic "Network", Severity critical

### 5. external-reachability

- **Cluster-Scope**: beide
- **Trigger-Alerts**: Cloudflared-Tunnel-Down, Traefik-5xx-Spike (mind. 10/min), LE-Cert-Expiry-imminent (<7d), Authentik-Outpost-Probe-Fail (von aussen)
- **Symptome**: Public-Endpoints von aussen nicht erreichbar, Login-Flow gebrochen
- **Inhibit**: keine (User-impacting, nicht unterdruecken)
- **Action**: Telegram-Topic "External", Severity critical

### 6. observability-pipeline-down

- **Cluster-Scope**: beide
- **Trigger-Alerts**: Telegraf-Down, Alloy-Down, Loki-Unreachable, Grafana-Down, Prometheus-Down, Tempo-Down
- **Symptome**: keine neuen Metriken/Logs, Dashboards leer, Blind-Flying
- **Inhibit**: alle "no-data"-Alerts dieses Clusters (sonst Storm)
- **Action**: Forum-Topic "Observability", Severity critical

### 7. ha-failover-broken

- **Cluster-Scope**: beide
- **Trigger-Alerts**: Watchdog-Fence-Triggered, VM-Stuck-Migrating (>5min), HA-Resource-Failed, Proxmox-HA-Quorum-Lost
- **Symptome**: Failover sollte greifen, tut es aber nicht -- Datenverlust-Risiko
- **Inhibit**: keine
- **Action**: Telegram-Topic "HA", Severity critical

### 8. backup-pipeline-down

- **Cluster-Scope**: beide
- **Trigger-Alerts**: linstor-snapshot-Heartbeat-stale (>26h), PBS-Backup-Failed, pg-backup-Failed, influx-backup-Failed, NAS-Storage-95%
- **Symptome**: Backups laufen nicht oder Storage voll, RPO verletzt
- **Inhibit**: keine
- **Action**: Forum-Topic "Backup", Severity warning (kein direkter User-Impact, aber Recovery-Blocker)

### 9. keep-hub-outage

- **Cluster-Scope**: cross-cluster (Keep laeuft pro Cluster, externer Watchdog probt beide)
- **Trigger-Alerts**: Externer-Watchdog-Probe-Fail (vom externen Proxmox pve-01-nana), Keep-API-Health-Fail (von ausserhalb)
- **Symptome**: Keep-Hub selbst offline, alle Alerts gehen verloren bis Recovery
- **Inhibit**: irrelevant -- Keep ist down, nichts wird verarbeitet
- **Action**: direkter Telegram-Push vom externen Watchdog (NICHT ueber Keep, wuerde geschluckt), Severity critical

## Live-Anlage-Reihenfolge

Wenn Source-Alerts in Welle 2/3 existieren, in dieser Reihenfolge in Keep anlegen:

1. `keep-hub-outage` -- zuerst, weil externer Watchdog-Trigger und unabhaengig von Keep selbst
2. `observability-pipeline-down` -- wegen Inhibit-Effekt auf alle anderen
3. `power-outage`, `dns-outage`, `cluster-storage-outage` -- die schweren Cascades
4. `auth-cascade`, `external-reachability` -- User-impacting
5. `ha-failover-broken`, `backup-pipeline-down` -- operativ kritisch, kein direkter User-Impact

## Welle-2/3-Mapping (Source-Alerts)

Damit die Subtasks die richtigen `correlation_key`-Labels setzen:

- **Welle 2 Cross-Cluster**:
  - Externer Watchdog -> `correlation_key=keep-hub-outage`
  - LE-Cert-Expiry -> `correlation_key=external-reachability`
  - Cookie-Domain-Drift -> kein correlation_key (eigenstaendig)
  - Consul-Health -> `correlation_key=cluster-storage-outage` (wenn Service-Health der Storage-Komponenten)
  - Authentik-Outpost-Metrics -> `correlation_key=auth-cascade`
- **Welle 3 DCLab**: konkrete Alert-Mapping pro Subtask in den ClickUp-Descriptions
- **Welle 3 Privat**: dito

## Folge-Tasks

- HSLU [`86c9kkjcv`](https://app.clickup.com/t/86c9kkjcv) -- Live-Anlage Correlations DCLab
- Privat [`86c9kkjf3`](https://app.clickup.com/t/86c9kkjf3) -- Live-Anlage Correlations Homelab

Beide Subtasks referenzieren dieses Design und fuehren die 9 Patterns einzeln als Checkliste.

## Verwandte Doku

- [Monitoring](index.md) -- Komponenten-Uebersicht
- [Monitoring: Coverage](coverage.md) -- Ist-Stand-Coverage SSOT mit allen Items
- [Monitoring: Strategie](strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Keep](keep.md) -- Alert-Hub Komponentenbeschreibung
- ClickUp HSLU [`86c9jqvtj`](https://app.clickup.com/t/86c9jqvtj) -- Welle-3-Master DCLab
- ClickUp Privat [`86c9jqw24`](https://app.clickup.com/t/86c9jqw24) -- Welle-3-Master Homelab

Memory-Pointer: `project_monitoring_routing_2026_04`, `feedback_keep_workflow_first_match`, `feedback_keep_workflow_yaml_upload`
