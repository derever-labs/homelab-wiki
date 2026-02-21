---
title: Zot Container Registry
description: OCI-native Container Registry mit S3 Backend und Pull-Through Cache
tags:
  - docker
  - registry
  - container
  - infrastructure
  - s3
  - zot
---

# Zot Container Registry

## Uebersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Version** | Zot v2.1.14 (ghcr.io/project-zot/zot-linux-amd64:latest) |
| **Primary URL** | localhost:5000 (jeder Node) |
| **External URL** | [registry.ackermannprivat.ch](https://registry.ackermannprivat.ch) |
| **Deployment** | Nomad System Job (`infrastructure/zot-registry.nomad`) |
| **Storage Backend** | MinIO S3 auf NAS (10.0.0.200:9000) |
| **UI** | Eingebaut (Zot UI Extension) |

## Warum Zot statt Docker Registry v2?

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

Die vollstaendige Konfiguration (Zot Config, S3 Storage, Proxy Cache, Docker Hub Credentials) ist im Nomad Job definiert: `infrastructure/zot-registry.nomad`

**Wichtig:** `compat: ["docker2s2"]` in der HTTP-Konfiguration ist noetig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlaegt der Push von Multi-Arch Images fehl mit `manifest invalid`.

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

### Docker daemon.json

Auf allen Nodes ist `localhost:5000` als Registry-Mirror konfiguriert (verwaltet durch Ansible). Docker versucht erst localhost:5000 (Zot), bei Nichterreichbarkeit automatisch Docker Hub direkt.

## Backup

| Pfad | Inhalt |
| :--- | :--- |
| MinIO: zot-registry/* | Alle Registry Blobs und Manifeste |

**Restore:** MinIO Bucket wiederherstellen, dann Nomad Job starten.

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
