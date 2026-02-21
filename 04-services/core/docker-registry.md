---
title: Zot Container Registry
description: OCI-native Container Registry mit S3 Backend und Pull-Through Cache
published: true
date: 2026-02-21T00:00:00+00:00
tags: docker, registry, container, infrastructure, s3, zot
editor: markdown
---

# Zot Container Registry

## Uebersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Version** | Zot v2.1.14 (ghcr.io/project-zot/zot-linux-amd64:latest) |
| **Primary URL** | localhost:5000 (jeder Node) |
| **External URL** | [registry.ackermannprivat.ch](https://registry.ackermannprivat.ch) |
| **Deployment** | Nomad System Job (alle Clients) |
| **Storage Backend** | MinIO S3 auf NAS (10.0.0.200:9000) |
| **UI** | Eingebaut (Zot UI Extension) |

## Warum Zot statt Docker Registry v2?

Docker Registry v2 wurde Ende 2025 als Zwischenloesung nach Harbor eingesetzt, wurde aber durch Zot ersetzt:

| Aspekt | Docker Registry v2 | Zot |
| :--- | :--- | :--- |
| **Pull-Through Cache** | Nur Docker Hub | Docker Hub, ghcr.io, quay.io, lscr.io |
| **UI** | Keines | Eingebaut |
| **Search** | Nein | Ja (GraphQL API) |
| **OCI-native** | Nein (Docker Schema) | Ja |
| **Docker-Kompatibilitaet** | Native | Via `compat: ["docker2s2"]` |

## Architektur

```
                    MinIO S3 (NAS 10.0.0.200:9000)
                    Bucket: zot-registry
                              |
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        v                     v                     v
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Zot 124       │     │ Zot 125       │     │ Zot 126       │
│ localhost:5000│     │ localhost:5000│     │ localhost:5000│
│ (client-04)   │     │ (client-05)   │     │ (client-06)   │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └───────────┬─────────┴─────────────────────┘
                    │
          On-Demand Proxy Cache
          Docker Hub, ghcr.io,
          quay.io, lscr.io
```

**Vorteile:**
- Alle Instanzen teilen S3 Storage (kein Sync noetig)
- Ein Push auf Node A ist sofort auf B/C verfuegbar
- On-Demand Proxy Cache fuer 4 Upstream-Registries
- Fallback zu Docker Hub wenn Registry nicht erreichbar

## Konfiguration

### Nomad Job

Datei: `infrastructure/zot-registry.nomad`

Wichtige Konfigurationsparameter:

```json
{
  "http": {
    "address": "0.0.0.0",
    "port": 5000,
    "compat": ["docker2s2"]
  },
  "storage": {
    "storageDriver": {
      "name": "s3",
      "regionendpoint": "http://10.0.0.200:9000",
      "bucket": "zot-registry"
    },
    "dedupe": false
  }
}
```

**Wichtig:** `compat: ["docker2s2"]` ist noetig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlaegt der Push von Multi-Arch Images fehl mit `manifest invalid`.

### Proxy Cache Registries

| Registry | URL | Beschreibung |
| :--- | :--- | :--- |
| Docker Hub | registry-1.docker.io | Mit Docker Hub Credentials (Rate Limit 200/6h) |
| GitHub CR | ghcr.io | On-Demand |
| Quay.io | quay.io | On-Demand |
| LinuxServer | lscr.io | On-Demand |

### S3 Storage

| Parameter | Wert |
| :--- | :--- |
| Endpoint | http://10.0.0.200:9000 |
| Bucket | zot-registry |
| Root Directory | /zot |
| Credentials | Vault kv/minio-nas |

### Docker daemon.json (alle Nodes)

```json
{
  "registry-mirrors": ["http://localhost:5000"],
  "insecure-registries": ["localhost:5000"]
}
```

**Verhalten:**
1. Docker versucht erst localhost:5000 (Zot)
2. Falls Zot down: automatisch Docker Hub direkt

## Verwendung

### Image Pull (via On-Demand Cache)

```bash
# Standard Docker Pull (nutzt automatisch Registry-Mirror)
docker pull nginx:alpine

# Oder explizit ueber Zot
docker pull localhost:5000/library/nginx:alpine

# Images von ghcr.io (via Proxy Cache)
docker pull localhost:5000/ghcr.io/paperless-ngx/paperless-ngx:latest
```

### Multi-Arch Image Push

```bash
# Multi-Arch Build und Push (funktioniert dank docker2s2 compat)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t localhost:5000/myimage:latest \
  .

# Einzelnes Image Push
docker tag myimage:latest localhost:5000/myimage:latest
docker push localhost:5000/myimage:latest
```

### Catalog und Search

```bash
# Catalog anzeigen
curl http://localhost:5000/v2/_catalog

# Image Tags auflisten
curl http://localhost:5000/v2/library/nginx/tags/list

# GraphQL Search (Zot Extension)
curl -s http://localhost:5000/v2/_zot/ext/search -X POST \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ImageList(repo:\"\"){Results{RepoName Tag}}}"}'
```

### Zot Web UI

Die eingebaute UI ist unter `http://localhost:5000/` erreichbar (nur intern).

## Troubleshooting

### Registry nicht erreichbar

```bash
# Health Check
curl http://localhost:5000/v2/

# Nomad Job Status
nomad job status zot-registry

# Logs pruefen
nomad alloc logs -job zot-registry zot
```

### "manifest invalid" beim Push

Sicherstellen dass `compat: ["docker2s2"]` in der Zot-Config gesetzt ist. Alternativ Image vor dem Push in OCI-Format konvertieren:

```bash
skopeo copy --format oci docker://source:tag docker://localhost:5000/dest:tag
```

### S3 Probleme

```bash
# MinIO erreichbar?
curl http://10.0.0.200:9000/minio/health/live

# Zot Logs auf S3-Fehler pruefen
nomad alloc logs -stderr -job zot-registry zot
```

## Backup

### Zu sichernde Daten

| Pfad | Inhalt |
| :--- | :--- |
| MinIO: zot-registry/* | Alle Registry Blobs und Manifeste |

### Restore

1. MinIO Bucket wiederherstellen
2. Nomad Job starten: `nomad job run infrastructure/zot-registry.nomad`

## Historie

| Datum | Aenderung |
| :--- | :--- |
| ~2025-11 | Harbor (3-way Replication, 8 Container pro Instanz) |
| 29.12.2025 | Migration zu Docker Registry v2 (Zwischenloesung) |
| 29.12.2025 | Migration zu Zot Registry (OCI-native, On-Demand Cache) |
| 21.02.2026 | Fix: `compat: ["docker2s2"]` fuer Multi-Arch Push Support |

---
*Dokumentation aktualisiert am: 21.02.2026*
*Ersetzt: Docker Registry v2 (Zwischenloesung), Harbor Container Registry*
