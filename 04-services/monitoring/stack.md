---
title: Monitoring Stack
description: Übersicht der Überwachungswerkzeuge (Grafana, Uptime Kuma)
published: true
date: 2025-12-26T19:25:00+00:00
tags: service, monitoring, nomad
editor: markdown
---

# Monitoring Stack

## Übersicht
Der Monitoring Stack dient der Visualisierung von Metriken und der Überwachung der Service-Verfügbarkeit.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Grafana** | Dashboards & Metriken | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) |
| **Uptime Kuma** | Verfügbarkeits-Checks | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |

## Grafana
### Datenquellen
- **InfluxDB:** Speichert Metriken von Nomad, Consul und Proxmox.
- **CheckMK:** Integriert über das CheckMK-Plugin für Infrastruktur-Status.

### Authentifizierung
Erfolgt via OAuth2 (Keycloak). Nur Benutzer der Gruppe `admin` haben Zugriff.

### Stateless Setup
Grafana läuft vollständig stateless:
- **Dashboards:** Werden als JSON Dateien unter `/nfs/docker/grafana/dashboards/` bereitgestellt (aus Git).
- **Datasources:** Werden beim Start via Nomad Template aus Vault Secrets (`kv/grafana`, `kv/influxdb`) provisioniert.
- **Alerting:** Deaktiviert, da kein persistenter Storage für State vorhanden ist.

## Uptime Kuma
Überwacht alle externen und internen Endpunkte via HTTP/TCP-Checks.
- **Benachrichtigungen:** Bei Ausfall erfolgt eine Meldung via Gotify/Telegram (konfiguriert in Vault).
- **Datenbank:** `kuma.db` (Repliziert via Litestream auf NAS).

## Backup-Monitoring

### Linstor Backup Monitor
Ein separates Script (`/usr/local/bin/linstor-backup-monitor.sh`) prueft um 06:00 Uhr den Status der S3-Backups und meldet via Uptime Kuma Push.

### PostgreSQL Backup
Der Nomad Batch-Job `postgres-backup` fuehrt taeglich ein `pg_dumpall` durch und sichert auf NFS (`/nfs/backup/postgres/`). Status wird via Uptime Kuma Push gemeldet.

## Wartung
### Grafana Dashboards
Dashboards werden teilweise als JSON in `infra/nomad-jobs/monitoring/grafana-dashboards/` verwaltet oder direkt in der UI erstellt.

---
*Letztes Update: 21.02.2026*
