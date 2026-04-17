---
title: Monitor-Liste
description: Vollständige Liste aller Uptime-Kuma-Monitore, gruppiert nach Tag (Export 2026-04-17)
tags:
  - uptime-kuma
  - monitoring
---

# Monitor-Liste

Exportiert am 2026-04-17 via `sqlite3 /app/data/kuma.db` im Container. Die SQLite-DB liegt auf dem Linstor-CSI-Volume `uptime-kuma-data` und läuft auf `vm-nomad-client-0[56]`.

::: info Pflege
Diese Seite wird nicht automatisch aktualisiert. Bei grösseren Monitor-Änderungen im Wiki nachziehen. Massenänderungen laufen per SQL direkt auf der DB (siehe [Uptime Kuma Betrieb](./index.md#kuma-crud-nur-per-direkt-sql)).
:::

## AI

- **Hollama** -- `https://hollama.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Ollama** -- `https://ollama.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **OpenWebUI** -- `https://chat.ackermannprivat.ch/` -- HTTP, 60s, kein Alert

## Backup

- **Linstor GUI** -- `https://linstor.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Linstor S3** -- Push-Monitor, Intervall 93600s (~26h), Alert aktiv
- **Linstor Snaps** -- Push-Monitor, Intervall 93600s (~26h), Alert aktiv
- **PBS Backup** -- Push-Monitor, Intervall 93600s (~26h), Alert aktiv
- **PBS Web** -- `https://10.0.2.50:8007` -- HTTP, 60s, Alert aktiv

## Dokumente

- **DbGate** -- `https://dbgate.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Paperless** -- `https://paperless.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Paperless AI** -- `https://paperless-ai.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Wiki** -- `https://wiki.ackermannprivat.ch/` -- HTTP, 60s, kein Alert

## Extern

- **Main HTTP** -- `https://login.ackermannprivat.ch:40001/` -- Keyword `HomeServer`, 60s, Alert aktiv
- **Main PING** -- `10.0.0.200:40001` -- TCP-Port, 60s, Alert aktiv
- **NanaSrv** -- `https://10.0.0.200:40001/` -- HTTP, 60s, Alert aktiv
- **Wish** -- `https://wish.ackermannprivat.ch/` -- HTTP, 20s, Alert aktiv

## Infrastruktur

- **Authentik** -- `https://auth.ackermannprivat.ch/-/health/ready/` -- HTTP, 60s, kein Alert
- **Authentik Login-Flow** -- `https://auth.ackermannprivat.ch/if/flow/default-authentication-flow/` -- HTTP, 60s, kein Alert
- **Consul API 04** -- `http://10.0.2.104:8500/v1/status/leader` -- HTTP, 60s, kein Alert
- **Consul API 05** -- `http://10.0.2.105:8500/v1/status/leader` -- HTTP, 60s, kein Alert
- **Consul API 06** -- `http://10.0.2.106:8500/v1/status/leader` -- HTTP, 60s, kein Alert
- **Flame Intra** -- `https://intra.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Keepalived T-01** -- Push-Monitor, Intervall 120s, Alert aktiv (2 Benachrichtigungen)
- **Keepalived T-02** -- Push-Monitor, Intervall 120s, Alert aktiv (2 Benachrichtigungen)
- **Linstor Ctrl** -- `http://10.0.2.125:3370/v1/controller/version` -- HTTP, 60s, kein Alert
- **Nomad API 04** -- `https://10.0.2.104:4646/v1/status/leader` -- HTTP, 60s, kein Alert
- **Nomad API 05** -- `https://10.0.2.105:4646/v1/status/leader` -- HTTP, 60s, kein Alert
- **Nomad API 06** -- `https://10.0.2.106:4646/v1/status/leader` -- HTTP, 60s, kein Alert
- **PiHole 01 TCP 53** -- `10.0.2.1:53` -- TCP-Port, 60s, kein Alert
- **PiHole 02 TCP 53** -- `10.0.2.2:53` -- TCP-Port, 60s, kein Alert
- **Traefik Dashboard** -- `https://traefik.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Uptime Kuma** -- `https://uptime.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Vault Health 04** -- `http://10.0.2.104:8200/v1/sys/health?standbyok=true&perfstandbyok=true` -- HTTP, 60s, kein Alert
- **Vault Health 05** -- `http://10.0.2.105:8200/v1/sys/health?standbyok=true&perfstandbyok=true` -- HTTP, 60s, kein Alert
- **Vault Health 06** -- `http://10.0.2.106:8200/v1/sys/health?standbyok=true&perfstandbyok=true` -- HTTP, 60s, kein Alert
- **Welcome Page** -- `https://welcome.ackermannprivat.ch/` -- HTTP, 60s, Alert aktiv

## Media

- **Audiobooks** -- `https://audio.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Jellyfin** -- `https://watch.ackermannprivat.ch/` -- HTTP, 60s, Alert aktiv
- **Jellystat** -- `https://jellystat.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **LazyLibrarian** -- `https://lazylibrarian.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Prowlarr** -- `https://prowlarr.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Radarr** -- `https://radarr.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **SABnzbd** -- `https://sabnzbd.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Sonarr** -- `https://sonarr.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Stash** -- `https://s.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Stash Ext** -- `https://secure.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Vid-Grab** -- `https://grab.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **YT-DL** -- `https://download.ackermannprivat.ch/` -- HTTP, 60s, kein Alert

## Monitoring

- **Changedetect** -- `https://change.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **CheckMK** -- `http://10.0.2.150/homelab/` -- HTTP, 60s, Alert aktiv
- **Gatus** -- `http://10.0.2.200:8080/health` -- HTTP, 60s, Alert aktiv
- **Grafana** -- `https://graf.ackermannprivat.ch/api/health` -- HTTP, 60s, kein Alert
- **InfluxDB** -- `https://influx.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **Notifiarr** -- `https://notifiarr.ackermannprivat.ch/` -- HTTP, 60s, kein Alert

## Netzwerk

- **PiHole-1 DNS** -- DNS-Query `golem.de` auf `10.0.2.1:53`, 60s, Alert aktiv
- **PiHole-1 Web** -- `http://10.0.2.1/admin/login` -- Keyword `Pi-hole`, 60s, Alert aktiv
- **PiHole-2 DNS** -- DNS-Query `golem.de` auf `10.0.2.2:53`, 60s, Alert aktiv
- **PiHole-2 Web** -- `http://10.0.2.2/admin/login` -- Keyword `Pi-hole`, 60s, Alert aktiv

## Remote

- **Guacamole** -- `https://remote.ackermannprivat.ch/` -- HTTP, 60s, kein Alert
- **MeshCentral** -- `https://mesh.ackermannprivat.ch/` -- HTTP, 60s, kein Alert

## Smart Home

- **Home Assistant** -- `http://10.0.0.100:8123/` -- HTTP, 60s, Alert aktiv
- **Zigbee2MQTT** -- `https://zigbee.ackermannprivat.ch/` -- HTTP, 60s, Alert aktiv

## Push-Monitore ohne Tag

- **InfluxDB Task: downsample_homeassistant_1y_to_5y** -- Push, Intervall 93600s, Alert aktiv
- **InfluxDB Task: downsample_homeassistant_to_1y** -- Push, Intervall 5400s, Alert aktiv
- **InfluxDB Task: downsample_proxmox_1y_to_5y** -- Push, Intervall 93600s, Alert aktiv
- **InfluxDB Task: downsample_proxmox_to_1y** -- Push, Intervall 5400s, Alert aktiv
- **InfluxDB Task: downsample_telegraf_1y_to_5y** -- Push, Intervall 93600s, Alert aktiv
- **InfluxDB Task: downsample_telegraf_to_1y** -- Push, Intervall 5400s, Alert aktiv
- **Renovate** -- Push, Intervall 90000s (~25h), Alert aktiv
