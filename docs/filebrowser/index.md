---
title: Filebrowser
description: Web-basierter Dateimanager als System-Job auf allen Nomad-Nodes
tags:
  - infrastructure
  - nomad
  - system-job
  - filebrowser
---

# Filebrowser

Filebrowser läuft als Nomad System Job -- eine Instanz pro Node -- und dient als Debugging- und Inspektions-Tool für die Nomad Nodes. Der Zugriff auf das Dateisystem ist read-only.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `infrastructure/filebrowser.nomad` (System Job) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Zugriff | Read-only auf gesamtes lokales Dateisystem |
| URLs | Siehe [Web-Interfaces](../_referenz/web-interfaces.md) (pro Node) |

## Architektur

Filebrowser läuft als **System Job** -- das heisst eine Instanz pro Nomad Client Node. Jede Instanz hat eine eigene URL basierend auf dem Hostnamen des Nodes.

| Node | URL |
| :--- | :--- |
| vm-nomad-client-04 | `https://files-vm-nomad-client-04.ackermannprivat.ch` |
| vm-nomad-client-05 | `https://files-vm-nomad-client-05.ackermannprivat.ch` |
| vm-nomad-client-06 | `https://files-vm-nomad-client-06.ackermannprivat.ch` |

```d2
direction: right

User: Admin User
Traefik: "Traefik\nintern-auth"

FB04: "Filebrowser\nclient-04"
FB05: "Filebrowser\nclient-05"
FB06: "Filebrowser\nclient-06"

FS04: "Filesystem\nclient-04 (ro)" { shape: cylinder }
FS05: "Filesystem\nclient-05 (ro)" { shape: cylinder }
FS06: "Filesystem\nclient-06 (ro)" { shape: cylinder }

User -> Traefik: HTTPS
Traefik -> FB04
Traefik -> FB05
Traefik -> FB06
FB04 -> FS04
FB05 -> FS05
FB06 -> FS06
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

## Verwandte Seiten

- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-Nodes
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Mounts die über Filebrowser inspiziert werden
- [Traefik Middlewares](../traefik/referenz.md) -- `intern-auth` Authentifizierung
- [Nomad Architektur](../nomad/index.md) -- System Job Deployment
