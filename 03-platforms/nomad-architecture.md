---
title: Nomad Jobs
description:
published: true
date: 2025-12-26T17:52:12+00:00
tags:
editor: markdown
dateCreated: 2025-12-26T17:52:12+00:00
---

## Verzeichnisstruktur

| Verzeichnis | Inhalt |
|-------------|--------|
| batch-jobs/ | Watchtower, Docker Prune, Daily Cleanup/Reboot/Restart, Reddit/PH Downloader |
| databases/ | OpenLDAP |
| infrastructure/ | Zot Registry, MinIO Peer (Litestream), SMTP Relay, Filebrowser |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Maintainerr, JellyStat, Stash, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Janitorr |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, iperf3-to-influxdb |
| services/ | WikiJS, Paperless, Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Guacamole, Tandoor, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT |
| system/ | Alloy (Log-Collector), Linstor CSI, Linstor GUI, Zot Registry |

## Traefik Middlewares

Siehe [Traefik Middleware Chains](traefik-middlewares.md) fuer die vollstaendige Dokumentation der v2 Middleware Chains.

## Infrastructure VMs

| VM | IP | Rolle |
|----|-----|-------|
| vm-proxy-dns-01 | 10.0.2.1 | Primary DNS, Traefik, Keycloak, CrowdSec |
| vm-vpn-dns-01 | 10.0.2.2 | Secondary DNS, ZeroTier |
| vm-nomad-server-04/05/06 | 10.0.2.104-106 | Nomad/Consul/Vault Server |
| vm-nomad-client-04/05/06 | 10.0.2.124-126 | Nomad Client |

## DNS-Kette

```
Client (Port 53)
      ↓
  dnsmasq ─┬─ *.consul → Consul Server (8600)
           ├─ *.local → Router (10.0.0.1)
           ├─ *.ackermannprivat.ch → Traefik (10.0.2.1)
           └─ andere → Pi-hole (1153) → Unbound (2253)
```

### Pi-hole

- **Blocklists**: ~709K unique Domains (29 Listen inkl. OISD Big)
- **DNSSEC**: Via Unbound (recursive resolver)
- **Web UI**: http://10.0.2.1:5480/admin, http://10.0.2.2:5480/admin

## Litestream SQLite Replikation

Siehe [Data Strategy](../01-architecture/data-strategy.md) fuer die vollstaendige Dokumentation der Litestream-Replikation.

## Job Configuration

- Docker als Task Driver
- Volumes von `/nfs/docker/` fuer persistente Daten
- Bridge Networking mit Port Mappings
- Health Checks wo anwendbar
- Resource Limits gesetzt

## Dependencies

- **NFS Storage**: Jobs erwarten NFS Mounts unter `/nfs/docker/`
- **Docker**: Alle Jobs nutzen Docker Task Driver
- **Network**: Jobs nutzen verschiedene Ports

---
*Letztes Update: 21.02.2026*
