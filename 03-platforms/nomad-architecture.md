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
| infrastructure/ | Harbor (Container Registry), MinIO Peer (Litestream) |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Maintainerr, JellyStat, Stash, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Janitorr |
| monitoring/ | Grafana, InfluxDB, Uptime Kuma, iperf3-to-influxdb |
| services/ | WikiJS, Paperless, Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Guacamole, Tandoor, Docker Registry, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT |

## Deployment

```bash
# Nomad Adresse setzen
export NOMAD_ADDR=http://vm-nomad-server-04:4646

# Einzelnen Job deployen
nomad job run <job-file>.nomad

# Alle Jobs deployen
./all-up.sh

# Job Status
nomad job status <job-name>

# Job stoppen
nomad job stop <job-name>
```

## Traefik Middlewares

| Middleware | Beschreibung | Gruppen | Beispiel-Services |
|------------|--------------|---------|-------------------|
| `admin-chain-v2@file` | OAuth2 + Internal Network | admin | Grafana, Prowlarr, Traefik Dashboard |
| `family-chain@file` | OAuth2 + Internal Network | admin, family | Jellyseerr |
| `guest-chain@file` | OAuth2 + Internal Network | admin, family, guest | WikiJS |
| `internal-network@file` | Nur interne IPs (10.0.0.0/8) | - | Ollama, Paperless, Vaultwarden |
| `api-chain@file` | Internal Network (für API-Zugriff) | - | *-api Routen, InfluxDB, AudioBookShelf |
| `secured-chain@file` | Basic Auth + Internal Network | - | Flame, MeshCmd |

**Wichtig**: Für jeden neuen Host mit OAuth2 Auth muss ein Callback-Router in der Traefik config hinzugefügt werden.

### Beispiel: Service schützen

```hcl
service {
  tags = [
    "traefik.enable=true",
    "traefik.http.routers.my-service.middlewares=admin-chain-v2@file"
  ]
}
```

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

### Consul DNS in Jobs

```hcl
config {
  dns_servers = ["10.0.2.1", "10.0.2.2"]
}
```

Beispiele: `ollama.service.consul`, `mosquitto.service.consul`

### Pi-hole

- **Blocklists**: ~709K unique Domains (29 Listen inkl. OISD Big)
- **DNSSEC**: Via Unbound (recursive resolver)
- **Web UI**: http://10.0.2.1:5480/admin, http://10.0.2.2:5480/admin

## Litestream SQLite Replikation

SQLite-basierte Services werden automatisch mit Litestream auf S3-kompatiblen Storage repliziert.

### Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                     Litestream Replikation                       │
├─────────────────────────────────────────────────────────────────┤
│   Node-05 ◄───── Thunderbolt (11 Gbps) ─────► Node-06           │
│   MinIO:9100                                  MinIO:9100         │
│   10.99.1.105                                 10.99.1.106        │
│        └──────────► Peer Replica (5s) ◄──────────┘              │
│                            │                                     │
│                            ▼                                     │
│                       NAS MinIO                                  │
│                    10.0.0.200:9000                               │
│                   (60s, 7d retention)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Services mit Litestream

| Service | DB-Pfad | Sync-Intervall |
|---------|---------|----------------|
| uptime-kuma | kuma.db | Peer: 5s, NAS: 60s |
| jellyseerr | db/db.sqlite3 | Peer: 5s, NAS: 60s |
| maintainerr | maintainerr.sqlite | Peer: 5s, NAS: 60s |
| radarr | radarr.db | Peer: 5s, NAS: 60s |
| sonarr | sonarr.db | Peer: 5s, NAS: 60s |
| prowlarr | prowlarr.db | Peer: 5s, NAS: 60s |
| vaultwarden | db.sqlite3 | Peer: 5s, NAS: 60s |

### Performance

| Metrik | Wert |
|--------|------|
| Peer Sync-Intervall | 5 Sekunden |
| NAS Sync-Intervall | 60 Sekunden |
| Restore-Zeit | ~50ms |
| RPO (Recovery Point Objective) | 5 Sekunden |
| Thunderbolt Bandbreite | ~11 Gbps |
| NAS Retention | 7 Tage |

### Wie es funktioniert

1. **Constraint**: Jobs können auf vm-nomad-client-05 ODER vm-nomad-client-06 laufen
2. **Restore (prestart)**: Bei Job-Start automatisch von Peer (schnell) oder NAS (Fallback)
3. **Replicate (sidecar)**: Während Laufzeit kontinuierliche Replikation

### Failover testen

```bash
# Job stoppen
nomad job stop radarr

# DB löschen
ssh sam@10.0.2.126 "sudo rm -f /local-docker/radarr/config/radarr.db*"

# Job starten - Restore erfolgt automatisch
nomad job run media/radarr.nomad

# Restore-Logs prüfen
nomad alloc logs -job radarr restore
```

## Job Configuration

- Docker als Task Driver
- Volumes von `/nfs/docker/` für persistente Daten
- Bridge Networking mit Port Mappings
- Health Checks wo anwendbar
- Resource Limits gesetzt

## Dependencies

- **NFS Storage**: Jobs erwarten NFS Mounts unter `/nfs/docker/`
- **Docker**: Alle Jobs nutzen Docker Task Driver
- **Network**: Jobs nutzen verschiedene Ports
