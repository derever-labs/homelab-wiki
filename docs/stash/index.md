---
title: Stash
description: Media Organizer und Metadata Manager mit zwei getrennten Instanzen
tags:
  - service
  - media
  - nomad
  - linstor
---

# Stash

Stash ist ein selbstgehosteter Media Organizer für Videos und Bilder. Er bietet automatisches Tagging, Metadaten-Management, Szenen-Erkennung und eine durchsuchbare Mediathek. Es laufen zwei getrennte Instanzen mit identischer Storage-Strategie (Linstor CSI für Config/Cache/Metadaten, NFS für Medien-Daten).

## Übersicht

**stash** (Haupt-Instanz, Priorität 70):

| Attribut | Wert |
|----------|------|
| URL | [s.ackermannprivat.ch](https://s.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/stash.nomad` |
| Config-Storage | Linstor CSI Volume (`stash-data-r2`) |
| Media-Storage | NFS (shared mit Downloadern) |
| Auth | Authentik ForwardAuth (`intern-auth`) |

**stash-secure** (Separate Instanz, Priorität 70):

| Attribut | Wert |
|----------|------|
| URL | [secure.ackermannprivat.ch](https://secure.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/stash-secure.nomad` |
| Config-Storage | Linstor CSI Volume (`stash-secure-data`) |
| Media-Storage | NFS (separates Verzeichnis) |
| Auth | Authentik ForwardAuth (`intern-auth`) |

## Rolle im Stack

Stash ist der zentrale Media Organizer für heruntergeladene Inhalte. Die Batch Jobs ([Content Pipeline](../medien/content-pipeline/index.md)) laden neue Medien herunter und triggern anschliessend über die Stash GraphQL-API automatisch einen Library Scan und die Generierung von Vorschaubildern, Sprites und Thumbnails.

### Zwei Instanzen -- warum?

Die Haupt-Instanz (`stash`) verwaltet die primäre Mediathek und wird von den Batch Jobs automatisch aktualisiert. Die Instanz `stash-secure` ist eine separate Installation mit eigenem Storage, die keine automatische Integration mit den Downloadern hat. Beide Instanzen teilen sich das gleiche Docker-Image, sind aber vollständig voneinander isoliert.

## Architektur

```d2
direction: down

Clients: Zugriff {
  style.stroke-dash: 4
  Browser: Browser { style.border-radius: 8 }
  ATV: "Jellyfin-App\n(Apple TV)" { style.border-radius: 8 }
}

Traefik: Traefik {
  style.stroke-dash: 4
  R1: "Router s.*\nintern-auth" { style.border-radius: 8 }
  R2: "Router secure.*\nintern-auth" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  S1: "stash\n(Haupt-Instanz)" { style.border-radius: 8 }
  S2: "stash-secure\n(separate Instanz)" { style.border-radius: 8 }
  PROXY: "stash-jellyfin-proxy\n(Port 8098, ohne Traefik)" { style.border-radius: 8 }
}

Storage: Storage {
  style.stroke-dash: 4
  LCSI: "Linstor CSI\nstash-data-r2" { shape: cylinder }
  LCSI2: "Linstor CSI\nstash-secure-data" { shape: cylinder }
  NFS1: "NFS .../data" { shape: cylinder }
  NFS2: "NFS .../secure" { shape: cylinder }
}

Batch: Batch Jobs {
  style.stroke-dash: 4
  PH: ph-downloader { style.border-radius: 8 }
  GDL: reddit-gallery-dl { style.border-radius: 8 }
}

Clients.Browser -> Traefik.R1: HTTPS
Clients.Browser -> Traefik.R2: HTTPS
Clients.ATV -> Nomad.PROXY: "HTTP :8098 (nur intern)"
Traefik.R1 -> Nomad.S1
Traefik.R2 -> Nomad.S2
Nomad.PROXY -> Nomad.S1: Jellyfin-API-Emulation
Nomad.S1 -> Storage.LCSI
Nomad.S1 -> Storage.NFS1
Nomad.S2 -> Storage.LCSI2
Nomad.S2 -> Storage.NFS2
Batch -> Nomad.S1: "Stash-API: Scan + Generate" { style.stroke-dash: 4 }
```

## Konfiguration

### Priorität und Preemption

Beide Instanzen laufen mit Nomad-Priorität **70**, gleich wie Jellyfin. Hintergrund: alle teilen sich den Constraint auf die Linstor-Storage-Nodes (`vm-nomad-client-05/06`). Fällt eine der beiden Nodes aus, müssen die Services auf der verbleibenden Node zusammenlaufen. Die gegenüber dem Default (50) erhöhte Priorität schützt sie davor, von niedriger priorisierten Jobs bei Ressourcen-Knappheit verdrängt zu werden.

::: warning Metadata-Generierung läuft auf CPU
Die Metadata-Generierung (Preview-Clips, Sprites, Thumbnails, perceptual Hashes) läuft architekturbedingt immer auf der CPU. Damit bleibt das CPU-Budget der Haupt-Instanz der limitierende Faktor für die Preview-Generierung nach Batch-Downloads (Details: Nomad-Job `media/stash.nomad`).
:::

### Stash API

Stash bietet eine GraphQL-API, die von den Batch Jobs genutzt wird. Authentifizierung erfolgt über einen API-Key aus Vault (`kv/data/shared/stash`).

| Endpunkt | Zweck |
| :--- | :--- |
| `POST /graphql` mit `metadataScan` | Library Scan nach neuen Dateien |
| `POST /graphql` mit `metadataGenerate` | Generierung von Covers, Previews, Sprites, Thumbnails |

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/shared/stash` | `api_key` |

## stash-jellyfin-proxy

Der `stash-jellyfin-proxy` emuliert die Jellyfin-API vor der Haupt-Instanz, sodass die Jellyfin-App auf dem Apple TV die Stash-Mediathek durchsuchen und abspielen kann. Er ist stateless und läuft fest auf `vm-nomad-client-06` (statischer Port 8098). Traefik veröffentlicht ihn nicht: Der Service trägt keine Traefik-Router-Tags für den Consul-Catalog-Provider, und im File-Provider existiert kein Router für ihn. Der Zugriff läuft also direkt auf Port 8098 im internen Netz, von aussen nur über Tailscale -- eine öffentliche Domain hat der Proxy nicht. Deployment: Nomad Job `media/stash-jellyfin-proxy.nomad`, Secrets in Vault (`kv/data/stash-jellyfin-proxy`).

## Verwandte Seiten

- [Content Pipeline](../medien/content-pipeline/index.md) -- Batch Jobs die Stash füttern
- [Video-Download-Tools](../video-download/index.md) -- Manuelle Download-UIs
- [Arr-Stack](../medien/arr-stack/index.md) -- Medien-Automatisierung (Sonarr, Radarr, etc.)
- [Jellyfin](../medien/jellyfin/index.md) -- Media Player
- [Linstor](../storage/linstor/index.md) -- CSI Storage für beide Instanzen
