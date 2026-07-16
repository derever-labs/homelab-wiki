---
title: Karakeep
description: Selbstgehosteter Bookmark-Manager als zentrale Sammelstelle für Lehrmaterial
tags:
  - service
  - productivity
  - nomad
  - bookmarks
---

# Karakeep

Karakeep ist ein selbstgehosteter Bookmark-Manager und dient als zentrale Sammelstelle für Lehrmaterial. Gespeicherte Links werden mit Screenshot, Volltext und Vorschaubild archiviert und lassen sich in einer Karten-Ansicht durchstöbern. Der Dienst ist bewusst nur intern und über Tailscale erreichbar; Erfassung und Zugriff laufen über die Web-UI, die Browser-Extension und die Mobile-App.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [kara.ackermannprivat.ch](https://kara.ackermannprivat.ch) (nur intern + Tailscale) |
| Deployment | Nomad Job `services/karakeep.nomad` |
| Storage | Linstor CSI: `karakeep-data` (SQLite + Assets), `karakeep-meili` (Suchindex) |
| Backup | App-Level, täglich 03:30, age-verschlüsselt nach `/nfs/backup/karakeep` (Details: [Backup](../storage/backup/index.md)) |
| Auth | `intern-api@file` (IP-Allowlist intern + Tailscale) plus Karakeep-Eigen-Login, bewusst ohne Authentik |
| Secrets | Vault `kv/karakeep` |

## Rolle im Stack

Karakeep ist die Sammel- und Stöber-Schicht des Wissensmanagements: die visuelle Arbeitsfläche mit Vorschaubildern, gegliedert nach Modul-Listen und Tags. Die inhaltliche Verdichtung und das Schreiben passieren in Obsidian, nicht in Karakeep.

Diese Trennung ist Absicht. Bilder leben ausschliesslich in Karakeep und kommen nie in den Obsidian-Vault, aus drei Gründen: Der Obsidian Web Clipper lädt Bilder nicht herunter, sondern verlinkt sie nur, und pre-signed Bild-URLs (etwa aus LinkedIn-Posts) verfallen -- ein bildlastiger Obsidian-Sammler hätte binnen Wochen eine leere Galerie. Zusätzlich hat obsidian-livesync einen bekannten Aufblähungs-Effekt bei bildhaltigen Notizen. Karakeep umgeht beides, indem es die Bild-Bytes selbst persistiert.

## Architektur

```d2
classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

direction: right

BACKUPDIR: "NAS /nfs/backup/karakeep\n(age-verschlüsselt, GFS-Rotation)" {
  shape: cylinder
  class: node
}
KV: "Vault kv/karakeep" { class: node }
MON: "Uptime Kuma\n(Push-Monitor)" { class: node }

Storage: Storage {
  style.stroke-dash: 4
  DATA: "Linstor CSI karakeep-data\n(SQLite + Assets)" {
    shape: cylinder
    class: node
  }
  MEILIVOL: "Linstor CSI karakeep-meili\n(Suchindex)" {
    shape: cylinder
    class: node
  }
}

Karakeep: "Nomad-Group karakeep" {
  style.stroke-dash: 4
  WEBT: "web\n(App)" { class: node }
  CHROME: "chrome\n(Screenshots)" { class: node }
  MEILI: "meilisearch\n(Volltextsuche)" { class: node }
  BACKUP: "backup\n(Sidecar, täglich)" { class: node }
}

Traefik: Traefik {
  style.stroke-dash: 4
  R: "Router kara.*\nintern-api (intern + Tailscale)" { class: node }
}

Clients: Zugriff {
  style.stroke-dash: 4
  EXT: "Browser-Extension / Mobile-App\n(Bearer-Token auf /api)" { class: node }
  WEB: "Web-UI\n(Karakeep-Login)" { class: node }
}

Clients.EXT -> Traefik.R: HTTPS
Clients.WEB -> Traefik.R: HTTPS
Traefik.R -> Karakeep.WEBT
Karakeep.WEBT -> Karakeep.CHROME: Screenshots
Karakeep.WEBT -> Karakeep.MEILI: Suche
Karakeep.WEBT -> Storage.DATA
Karakeep.MEILI -> Storage.MEILIVOL
Karakeep.BACKUP -> Storage.DATA: liest SQLite + Assets
Karakeep.BACKUP -> BACKUPDIR: age-Archiv
Karakeep.BACKUP -> MON: Heartbeat
Karakeep.WEBT -> KV: Secrets
Karakeep.MEILI -> KV: Master-Key
```

## Exposition und Authentifizierung

Karakeep steht bewusst **nicht** hinter der Authentik-ForwardAuth-Kette, sondern nur hinter dem IP-Allowlist-Filter `intern-api@file` (interne Netze plus Tailscale-Bereich). Der Grund: Die Mobile-App und die Browser-Extension sprechen mit Bearer-Token gegen `/api`, und eine Authentik-Weiterleitung würde diesen Token-Fluss brechen. Die Anmeldung übernimmt Karakeep selbst; wer nicht im Netz oder auf Tailscale ist, erreicht die Login-Seite gar nicht erst. Als Folge setzt mobiles Erfassen ein aktives Tailscale-Profil voraus.

Weil vor Karakeep keine SSO-Schicht liegt, sind die Registrierung deaktiviert und das Rate-Limiting aktiv -- neben CrowdSec der einzige Brute-Force-Schutz auf dem Login. Details zur Middleware-Kette: [Traefik Referenz](../edge/traefik/referenz.md).

## Storage und Suche

Die SQLite-Datenbank (WAL-Modus) und alle Bild-Assets liegen auf dem replizierten Linstor-CSI-Volume `karakeep-data`. SQLite gehört nicht auf NFS (File-Locking), DRBD verhält sich dagegen wie eine lokale Disk. Die Volltextsuche liefert Meilisearch aus einem zweiten CSI-Volume `karakeep-meili`.

::: info Warum der Suchindex auf CSI liegt
Der Meilisearch-Index ist ein abgeleiteter Datenbestand und liesse sich jederzeit neu aufbauen. Läge er auf lokalem Host-Storage, wäre er nach einem Reschedule auf einen anderen Client aber still leer, und die Suche würde ohne Fehlermeldung nichts mehr liefern, bis jemand von Hand reindext. Ein stiller Suchausfall ist teurer als fünf Gigabyte repliziertes Volume, deshalb liegt auch der Index auf CSI.
:::

## Verwandte Seiten

- [Karakeep Referenz](./referenz.md) -- Container-Tasks, Volumes, Secrets, Backup-Parameter
- [Karakeep Betrieb](./betrieb.md) -- Erfassung, Restore, Reindex, Troubleshooting
- [Backup](../storage/backup/index.md) -- übergeordnetes Backup-Konzept
- [Obsidian LiveSync](../obsidian-livesync/index.md) -- Verdichtungs- und Schreibschicht
- [Linstor CSI](../storage/linstor/index.md) -- replizierter Block-Storage (DRBD)
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware-Kette `intern-api@file`
