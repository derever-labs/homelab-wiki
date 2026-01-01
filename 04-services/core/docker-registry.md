---
title: Docker Registry v2
description: Lightweight Pull-Through Cache Registry mit S3 Backend
published: true
date: 2025-12-29T00:30:00+00:00
tags: docker, registry, container, infrastructure, s3
editor: markdown
---

# Docker Registry v2

## Uebersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Version** | registry:2 |
| **Primary URL** | localhost:5000 (jeder Node) |
| **External URL** | [registry.ackermannprivat.ch](https://registry.ackermannprivat.ch) |
| **Deployment** | Nomad System Job (alle Clients) |
| **Storage Backend** | MinIO S3 auf NAS (10.0.0.200:9000) |

## Warum Docker Registry v2 statt Harbor/Zot?

| Aspekt | Harbor | Zot | Docker Registry v2 |
| :--- | :--- | :--- | :--- |
| **Container** | 8 pro Instanz | 1 | 1 |
| **RAM** | ~2.5GB | ~200MB | ~50MB |
| **CPU** | 1300 MHz | 200 MHz | 100 MHz |
| **Konfiguration** | Komplex | ~50 Zeilen | ~15 Zeilen |
| **S3 Backend** | Ja | Kompliziert | Native |
| **Pull-Through Cache** | Ja | Sync Extension | Native |
| **UI** | Eingebaut | Eingebaut | Separat |

**Entscheidung:** Docker Registry v2 bietet alle benoetigten Features (Pull-Through Cache, S3 Backend) mit minimalem Ressourcenverbrauch.

## Architektur

```
                    MinIO S3 (NAS 10.0.0.200:9000)
                    Bucket: zot-registry/docker-registry/
                              |
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        v                     v                     v
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Registry 124  │     │ Registry 125  │     │ Registry 126  │
│ localhost:5000│     │ localhost:5000│     │ localhost:5000│
│ (client-04)   │     │ (client-05)   │     │ (client-06)   │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └───────────┬─────────┴─────────────────────┘
                    │
          Pull-through Cache
          zu Docker Hub
```

**Vorteile dieser Architektur:**
- Alle Instanzen teilen S3 Storage (kein Sync noetig)
- Ein Push auf Node A ist sofort auf B/C verfuegbar
- Pull-through Cache fuer Docker Hub eingebaut
- Fallback zu Docker Hub wenn Registry nicht erreichbar

## Konfiguration

### Nomad Job

Datei: `infrastructure/docker-registry.nomad`

```hcl
job "docker-registry" {
  type = "system"
  priority = 90

  group "registry" {
    network {
      mode = "host"
      port "registry" { static = 5000 }
    }

    task "registry" {
      driver = "docker"

      config {
        image        = "public.ecr.aws/docker/library/registry:2"
        network_mode = "host"
        volumes      = ["local/config.yml:/etc/docker/registry/config.yml:ro"]
      }

      template {
        data = <<EOF
version: 0.1
storage:
  s3:
    accesskey: admin
    secretkey: <minio-password>
    region: us-east-1
    regionendpoint: http://10.0.0.200:9000
    bucket: zot-registry
    rootdirectory: /docker-registry
    secure: false
  cache:
    blobdescriptor: inmemory
http:
  addr: :5000
proxy:
  remoteurl: https://registry-1.docker.io
EOF
        destination = "local/config.yml"
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
```

### S3 Storage

| Parameter | Wert |
| :--- | :--- |
| Endpoint | http://10.0.0.200:9000 |
| Bucket | zot-registry |
| Root Directory | /docker-registry |
| Credentials | Vault kv/minio-nas |

### Docker daemon.json (alle Nodes)

```json
{
  "registry-mirrors": ["http://localhost:5000"],
  "insecure-registries": ["localhost:5000"]
}
```

**Verhalten:**
1. Docker versucht erst localhost:5000 (Registry)
2. Falls Registry down: automatisch Docker Hub direkt

## Verwendung

### Image Pull (via Pull-Through Cache)

```bash
# Standard Docker Pull (nutzt automatisch Registry-Mirror)
docker pull nginx:alpine

# Oder explizit ueber Registry
docker pull localhost:5000/library/nginx:alpine
```

### Catalog anzeigen

```bash
curl http://localhost:5000/v2/_catalog
```

### Image Tags auflisten

```bash
curl http://localhost:5000/v2/library/nginx/tags/list
```

## Traefik Integration

Die Registry ist ueber HTTPS erreichbar:

| URL | Beschreibung |
| :--- | :--- |
| registry.ackermannprivat.ch | Registry API |

```yaml
# Traefik Tags im Nomad Job
traefik.http.routers.registry.rule=Host(`registry.ackermannprivat.ch`)
traefik.http.routers.registry.middlewares=intern-admin-chain@file
```

## Ressourcen-Vergleich

| Metrik | Harbor (3x) | Docker Registry (3x) | Ersparnis |
| :--- | :--- | :--- | :--- |
| CPU | 4200 MHz | 300 MHz | 3900 MHz |
| RAM | 7.5 GB | 384 MB | ~7 GB |
| Container | 24 | 3 | 21 weniger |

## Troubleshooting

### Registry nicht erreichbar

```bash
# Health Check
curl http://localhost:5000/v2/

# Nomad Job Status
nomad job status docker-registry

# Logs pruefen
nomad alloc logs -job docker-registry registry
```

### S3 Probleme

```bash
# MinIO erreichbar?
curl http://10.0.0.200:9000/minio/health/live

# Registry Logs auf S3-Fehler pruefen
nomad alloc logs -stderr -job docker-registry registry
```

### Pull-Through Cache funktioniert nicht

```bash
# Pruefe ob Docker Hub Rate Limits greifen
nomad alloc logs -stderr -job docker-registry registry | grep toomanyrequests
```

Bei Rate Limits: Warten oder Docker Hub Credentials konfigurieren.

### Image nicht gefunden

```bash
# Pruefe ob Image im Cache
curl http://localhost:5000/v2/_catalog

# Pull erzwingen (frischt Cache auf)
docker pull localhost:5000/library/nginx:latest
```

## Backup

### Zu sichernde Daten

| Pfad | Inhalt |
| :--- | :--- |
| MinIO: zot-registry/docker-registry/* | Alle Registry Blobs |

### Restore

1. MinIO Bucket wiederherstellen
2. Nomad Job starten: `nomad job run infrastructure/docker-registry.nomad`

## Migration von Harbor

Die Migration erfolgte am 29.12.2025:

1. Alle 47 Nomad Jobs wurden auf `localhost:5000` umgestellt
2. Docker daemon.json mit registry-mirrors konfiguriert
3. Harbor Jobs gestoppt

**Alte Referenzen:**
```
# Vorher
harbor.ackermannprivat.ch/docker-cache/library/nginx:latest

# Nachher (via Pull-Through Cache)
nginx:latest
# oder explizit
localhost:5000/library/nginx:latest
```

---
*Dokumentation erstellt am: 29.12.2025*
*Ersetzt: Harbor Container Registry*
