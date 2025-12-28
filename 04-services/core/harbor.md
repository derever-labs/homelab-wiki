---
title: Harbor Container Registry
description: Private Container Registry mit Proxy Cache und 3-Wege-Replikation
published: true
date: 2025-12-28T20:00:00+00:00
tags: harbor, docker, registry, container, infrastructure
editor: markdown
---

# Harbor Container Registry

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Version** | v2.11.2 |
| **Primary URL** | [harbor.ackermannprivat.ch](https://harbor.ackermannprivat.ch) |
| **Deployment** | Nomad Jobs (3 Instanzen) |
| **Storage Backend** | MinIO S3 auf NAS (10.0.0.200:9000) |
| **Secrets** | Vault (kv/data/harbor) |

## Architektur

### 3-Wege-Replikation
Harbor läuft in einer hochverfügbaren Konfiguration mit bidirektionaler Replikation:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  harbor-vm-05   │◄───►│  harbor-vm-06   │◄───►│   harbor-nas    │
│  (client-05)    │     │  (client-06)    │     │  (NAS VM)       │
│  Port 8880      │     │  Port 8880      │     │  Port 8880      │
│                 │◄────────────────────────────►│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                        ┌───────▼───────┐
                        │   MinIO S3    │
                        │  10.0.0.200   │
                        │  harbor/      │
                        │  harbor-05/   │
                        └───────────────┘
```

### Instanzen
| Instanz | Node | Port | URL | S3 Bucket |
| :--- | :--- | :--- | :--- | :--- |
| harbor-vm-06 | vm-nomad-client-06 | 8880 | harbor.ackermannprivat.ch | harbor |
| harbor-vm-05 | vm-nomad-client-05 | 8880 | harbor-05.ackermannprivat.ch | harbor-05 |
| harbor-nas | NAS (10.0.0.200) | 8880 | harbor-nas.ackermannprivat.ch | harbor-nas |

## Komponenten

Jede Harbor-Instanz besteht aus 8 Containern im Docker-Netzwerk `harbor-net`:

| Container | Image | Funktion |
| :--- | :--- | :--- |
| database | goharbor/harbor-db | PostgreSQL für Metadaten |
| redis | goharbor/redis-photon | Cache und Job Queue |
| registry | goharbor/registry-photon | OCI Registry (Blob Storage) |
| registryctl | goharbor/harbor-registryctl | Registry Controller |
| core | goharbor/harbor-core | Harbor API und Business Logic |
| portal | goharbor/harbor-portal | Web UI (Angular) |
| jobservice | goharbor/harbor-jobservice | Background Jobs (GC, Replication) |
| nginx | goharbor/nginx-photon | Reverse Proxy |

## Proxy Caches

Harbor fungiert als Proxy Cache für externe Registries. Alle Nomad Jobs verwenden Harbor als Image-Quelle:

| Projekt | Upstream Registry | Beispiel |
| :--- | :--- | :--- |
| docker-cache | Docker Hub | `harbor.../docker-cache/library/nginx:latest` |
| ghcr-cache | GitHub Container Registry | `harbor.../ghcr-cache/linuxserver/sonarr:latest` |
| lscr-cache | LinuxServer.io | `harbor.../lscr-cache/linuxserver/jellyfin:latest` |
| quay-cache | Quay.io | `harbor.../quay-cache/prometheus/node-exporter` |
| library | Private Images | `harbor.../library/custom-app:v1.0` |

### Vorteile
- Schnellere Pulls (lokaler Cache)
- Unabhängigkeit von externen Ausfällen
- Bandbreitenersparnis
- Rate-Limit-Umgehung (Docker Hub)

## Konfiguration

### Voraussetzungen
Auf jedem Node muss das Docker-Netzwerk existieren:
```bash
docker network create harbor-net
```

### Storage (S3)
```yaml
storage:
  s3:
    accesskey: harbor-5dd6a6b7
    secretkey: <in Vault>
    region: us-east-1
    regionendpoint: http://10.0.0.200:9000
    bucket: harbor  # oder harbor-05
    secure: false
    v4auth: true
    rootdirectory: /registry
```

### Secrets (Vault)
Pfad: `kv/data/harbor`
| Key | Beschreibung |
| :--- | :--- |
| db_password | PostgreSQL Passwort |
| admin_password | Harbor Admin Passwort |

### Private Key
Für Token-Signierung wird ein PKCS#1 RSA Key benötigt:
```
/nfs/docker/harbor/secret/core/private_key.pem
/nfs/docker/harbor-05/secret/core/private_key.pem
```

## Nomad Jobs

### Deployment
```bash
# Primary (VM-06)
nomad job run infrastructure/harbor-vm-06.nomad

# Secondary (VM-05)
nomad job run infrastructure/harbor-vm-05.nomad
```

### Job-Dateien
- `infrastructure/harbor-vm-06.nomad` - Primary Instanz
- `infrastructure/harbor-vm-05.nomad` - Secondary Instanz

### Ressourcen pro Instanz
| Task | CPU | Memory | Memory Max |
| :--- | :--- | :--- | :--- |
| database | 200 | 512 MB | 1024 MB |
| redis | 100 | 256 MB | 512 MB |
| registry | 200 | 256 MB | 512 MB |
| registryctl | 100 | 128 MB | 256 MB |
| core | 300 | 512 MB | 1024 MB |
| portal | 100 | 128 MB | 256 MB |
| jobservice | 200 | 256 MB | 512 MB |
| nginx | 100 | 128 MB | 256 MB |
| **Total** | **1300** | **2176 MB** | **4352 MB** |

## Verwendung

### Docker Login
```bash
docker login harbor.ackermannprivat.ch
# Username: admin
# Password: <aus Vault>
```

### Image Push
```bash
docker tag myimage:latest harbor.ackermannprivat.ch/library/myimage:latest
docker push harbor.ackermannprivat.ch/library/myimage:latest
```

### Image Pull (via Proxy Cache)
```bash
# Statt: docker pull nginx:latest
docker pull harbor.ackermannprivat.ch/docker-cache/library/nginx:latest

# Statt: docker pull ghcr.io/linuxserver/sonarr:latest
docker pull harbor.ackermannprivat.ch/ghcr-cache/linuxserver/sonarr:latest
```

## Replikation einrichten

1. **Harbor UI öffnen**: https://harbor.ackermannprivat.ch
2. **Administration > Registries > New Endpoint**:
   - Provider: Harbor
   - Name: harbor-05
   - Endpoint URL: http://10.0.2.125:8880
   - Access ID/Secret: admin / <password>
3. **Administration > Replications > New Rule**:
   - Name: sync-to-harbor-05
   - Replication Mode: Push
   - Source: library/**
   - Destination Registry: harbor-05
   - Trigger: Event Based

## Garbage Collection

Ungenutzte Blobs werden via JobService entfernt:
1. **Administration > Garbage Collection**
2. **Schedule**: Weekly (Sonntag 03:00)
3. **Workers**: 1

## Troubleshooting

### Container starten nicht
```bash
# Prüfen ob harbor-net existiert
docker network ls | grep harbor-net

# Falls nicht:
docker network create harbor-net
```

### Registry nicht erreichbar
```bash
# Health Check
curl -s http://10.0.2.126:8880/api/v2.0/health | jq

# Logs prüfen
nomad alloc logs -job harbor-vm-06 core
```

### Replikation fehlgeschlagen
1. Harbor UI > Jobs > Prüfen
2. Netzwerk-Konnektivität zwischen Instanzen prüfen
3. Credentials in Registry-Endpoint verifizieren

### S3 Storage Probleme
```bash
# MinIO erreichbar?
curl http://10.0.0.200:9000/minio/health/live

# Bucket existiert?
mc ls minio/harbor
```

## Backup

### Zu sichernde Daten
| Pfad | Inhalt |
| :--- | :--- |
| /nfs/docker/harbor/database | PostgreSQL Daten |
| /nfs/docker/harbor/secret | Private Keys |
| MinIO: harbor/* | Registry Blobs |

### Restore
1. Vault Secrets wiederherstellen
2. NFS Volumes wiederherstellen
3. MinIO Bucket wiederherstellen (optional - wird via Replikation synchronisiert)
4. Nomad Jobs starten

---
*Dokumentation erstellt am: 28.12.2025*
