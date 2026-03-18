---
title: Nomad Job-Übersicht
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

## Infrastructure

Alle VMs und IPs: [Proxmox Cluster](../infrastructure/proxmox-cluster.md)

## DNS

Siehe [DNS-Architektur](dns-architecture.md) fuer die vollstaendige Dokumentation der DNS-Kette (Pi-hole v6, Unbound, Consul DNS).

## Litestream SQLite Replikation

Siehe [Data Strategy](../architecture/data-strategy.md) fuer die vollstaendige Dokumentation der Litestream-Replikation.

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
