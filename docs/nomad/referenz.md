---
title: Nomad Referenz
description: Verzeichnisstruktur, Job-Konfigurationsmuster und Abhängigkeiten
tags:
  - nomad
  - referenz
  - jobs
---

# Nomad Referenz

## Verzeichnisstruktur

Alle Nomad Jobs liegen unter `/nfs/nomad/jobs/` und sind thematisch in Verzeichnisse gruppiert.

| Verzeichnis | Inhalt |
|-------------|--------|
| batch-jobs/ | Watchtower, Docker Prune, Daily Cleanup/Reboot/Restart, Daily Restart Jellyfin, Reddit Downloader, PH Downloader, PostgreSQL Backup |
| databases/ | OpenLDAP, PostgreSQL (DRBD), DbGate |
| infrastructure/ | SMTP Relay, Filebrowser, Zot Registry, GitHub Runner |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Janitorr, JellyStat, Stash, Stash-Secure, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Special-YouTube-DL, Special-YT-DLP, Video-Grabber |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, Gatus, iperf3-to-influxdb |
| services/ | VitePress Wiki, Paperless, Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Flame-Intra, Homepage-Intra, Guacamole, Tandoor, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT, Gitea, Metabase, solidtime, Kimai, n8n, MeshCommander, PHDler Telegram Bot, Swissbau Viewer |
| system/ | Alloy (Log-Collector), Linstor CSI, Linstor GUI |
| test/ | Linstor Volume Test |

## Job-Konfigurationsmuster

### Docker Driver

Alle Jobs nutzen den Docker Task Driver. Images werden von Docker Hub oder der internen [Zot Registry](../docker-registry/) bezogen. Watchtower (batch-jobs/) prüft regelmässig auf neue Image-Versionen.

### NFS Volumes

Persistente Daten liegen auf dem NAS unter `/nfs/docker/<service>/`. Die Volumes werden als `host` Volumes im Job konfiguriert. Details zum NFS-Setup: [NAS-Speicher](../nas-storage/)

### Bridge Networking

Jobs nutzen Bridge Networking mit expliziten Port Mappings. Nomad weist dynamische Host-Ports zu, die über Consul SRV-Records aufgelöst werden. Für Services hinter Traefik ist der Host-Port irrelevant -- Traefik ermittelt ihn automatisch über den Consul Catalog.

### Health Checks

Wo anwendbar definieren Jobs HTTP- oder TCP-Health-Checks in der `check {}` Stanza. Consul überwacht diese und markiert ungesunde Services, sodass Traefik sie aus dem Routing entfernt.

### Resource Limits

Jeder Task hat CPU- und Memory-Limits gesetzt. Nomad nutzt diese Werte für die Scheduling-Entscheidung (Bin-Packing) und zur Laufzeit-Begrenzung.

### Vault-Integration

Services, die Secrets benötigen, nutzen die `vault {}` Stanza zusammen mit Workload Identity. Secrets werden via `template` Stanza als Umgebungsvariablen oder Dateien injiziert. Details: [Vault](../vault/)

### Restart/Reschedule/Disconnect

CSI-Jobs haben Resilience-Stanzas auf Group-Level:

- **restart**: Lokale Neustarts bei Task-Crashes (`attempts = 3, interval = "5m", delay = "15s"`)
- **reschedule**: Rescheduling auf anderen Node (`delay = "30s", delay_function = "exponential", max_delay = "10m"`)
- **max_client_disconnect**: Wartezeit bei kurzen Netzwerk-Ausfällen (`"5m"`)
- **kill_timeout**: Für Datenbanken erhöht (`"30s"` bei PostgreSQL für WAL flush)

::: info Postgres-Sonderfall
PostgreSQL hat `reschedule { unlimited = false, attempts = 3, interval = "30m" }` und `restart { mode = "fail" }` -- bei wiederholtem Failure wird manuelles Eingreifen erwartet.
:::

### PostgreSQL-Abhängigkeiten

Jobs, die PostgreSQL benötigen, enthalten einen `wait-for-postgres` Init-Task. Dieser prüft die Erreichbarkeit der Datenbank bevor der Haupt-Task startet. Details: [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md)

## Verwandte Seiten

- [Nomad Übersicht](index.md) -- Cluster-Architektur und Rolle im Stack
- [Nomad Betrieb](betrieb.md) -- Deployment, Node Drain, Troubleshooting
- [Traefik Middlewares](../traefik/referenz.md) -- Middleware Chains für Service-Zugriffskontrolle
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Vollständiges Abhängigkeitsdiagramm
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
