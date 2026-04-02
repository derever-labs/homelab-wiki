---
title: Filebrowser
description: Web-basierter Dateimanager als System Job auf allen Nomad Nodes
tags:
  - infrastructure
  - nomad
  - system-job
  - filebrowser
---

# Filebrowser

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Deployment** | Nomad System Job (`infrastructure/filebrowser.nomad`) |
| **Auth** | Authentik ForwardAuth (`intern-auth`) |
| **Zugriff** | Read-only auf gesamtes lokales Dateisystem |
| **Image** | `filebrowser/filebrowser:latest` (via lokale Registry) |

## Architektur

Filebrowser läuft als **System Job** -- das heisst eine Instanz pro Nomad Client Node. Jede Instanz hat eine eigene URL basierend auf dem Hostnamen des Nodes.

| Node | URL |
| :--- | :--- |
| vm-nomad-client-04 | `https://files-vm-nomad-client-04.ackermannprivat.ch` |
| vm-nomad-client-05 | `https://files-vm-nomad-client-05.ackermannprivat.ch` |
| vm-nomad-client-06 | `https://files-vm-nomad-client-06.ackermannprivat.ch` |

```mermaid
flowchart LR
    User:::entry["Admin User"]
    User -->|HTTPS| Traefik:::svc["Traefik<br/>intern-auth"]

    Traefik --> FB04:::svc["Filebrowser<br/>client-04"]
    Traefik --> FB05:::svc["Filebrowser<br/>client-05"]
    Traefik --> FB06:::svc["Filebrowser<br/>client-06"]

    FB04 --> FS04:::db["Filesystem<br/>client-04 (ro)"]
    FB05 --> FS05:::db["Filesystem<br/>client-05 (ro)"]
    FB06 --> FS06:::db["Filesystem<br/>client-06 (ro)"]

    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
```

## Einsatzzweck

Filebrowser dient als Debugging- und Inspektions-Tool für die Nomad Nodes. Typische Anwendungsfälle:

- NFS-Mounts prüfen (unter `/nfs/`)
- Container-Volumes inspizieren
- Log-Dateien einsehen
- DRBD-Volumes auf den Storage Nodes überprüfen

## Mount-Pfade

Das gesamte Root-Dateisystem des Hosts wird **read-only** unter `/srv` im Container gemountet. Wichtige Pfade auf den Nodes:

| Pfad | Inhalt |
| :--- | :--- |
| `/nfs/docker/` | NFS-Mounts für Container-Daten |
| `/nfs/media/` | NFS-Mounts für Medien |
| `/var/lib/linstor/` | Linstor Controller DB (nur client-05/06) |
| `/var/run/docker.sock` | Docker Socket |

## Sicherheit

- **Read-only:** Der Container kann keine Dateien verändern (`/:/srv:ro`)
- **Keine eigene Auth:** Filebrowser läuft mit `--noauth`, die gesamte Authentifizierung erfolgt über Traefik (`intern-auth`)
- **Nur Admins:** Durch die Auth-Chain ist der Zugriff auf Benutzer mit Admin-Gruppenzugehörigkeit in Authentik beschränkt

## Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 100 MHz |
| Memory | 128 MB |
| Priorität | 90 (hoch -- soll auch bei Ressourcenknappheit laufen) |

## Verwandte Seiten

- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-Nodes
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Mounts die über Filebrowser inspiziert werden
- [Traefik Middlewares](../traefik/referenz.md) -- `intern-auth` Authentifizierung
- [Nomad Architektur](../nomad/index.md) -- System Job Deployment
