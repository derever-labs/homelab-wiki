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

## Uptime Kuma
Überwacht alle externen und internen Endpunkte via HTTP/TCP-Checks.
- **Benachrichtigungen:** Bei Ausfall erfolgt eine Meldung via Gotify/Telegram (konfiguriert in Vault).
- **Datenbank:** `kuma.db` (Repliziert via Litestream auf NAS).

## Wartung
### Grafana Dashboards
Dashboards werden teilweise als JSON in `infra/nomad-jobs/monitoring/grafana-dashboards/` verwaltet oder direkt in der UI erstellt.

---
*Letztes Update: 26.12.2025*
