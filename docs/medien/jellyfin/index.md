---
title: Jellyfin
description: Medienserver für Filme und Serien mit Intel QSV Hardware-Transcoding und LDAP-Authentifizierung
tags:
  - service
  - nomad
  - media
  - linstor
---

# Jellyfin

Jellyfin ist der zentrale Medienserver für Filme und Serien. Er nutzt Intel QSV Hardware-Transcoding für 4K HDR-Streams und authentifiziert Benutzer direkt via LDAP gegen den Authentik LDAP Outpost.

Die Referenz -- Hardware-Transcoding-Codecs, Storage-Mounts, Traefik-Routing und Wartungsbanner -- steht in der [Jellyfin Referenz](./referenz.md); die Betriebsprozeduren (LDAP-Authentifizierung, IPv6-Handling, täglicher Restart, Kurator-Playlists) in [Jellyfin Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| Deployment | Nomad Job `media/jellyfin.nomad` |
| Nodes | `vm-nomad-client-05/06` (Constraint, folgt dem CSI Volume) |
| Config Storage | Linstor CSI Volume `jellyfin-config` (DRBD-repliziert) |
| Media Storage | NFS `/nfs/jellyfin` ([NAS](../../storage/nas/index.md)) |
| Auth | LDAP Bind via [Authentik LDAP Outpost](../../edge/authentik/index.md) (kein OAuth/ForwardAuth) |
| GPU | Intel Iris Xe (i9-12900H) via Full Passthrough von [Proxmox](../../infrastruktur/proxmox/index.md) |
| Transcoding | Intel QSV (Hardware), OpenCL Tone Mapping (HDR→SDR) |

## Architektur

Zwei mechanisch verschiedene Abläufe treffen sich bei Jellyfin: der **Stream-Pfad**, auf dem ein Client synchron ein Video abruft, und die **Medien-Ankunft**, bei der ein Wunsch Minuten bis Stunden später als Datei auf dem Share landet. Die zwei Szenario-Diagramme zeigen je einen Ablauf; das Big Picture des gesamten Medien-Stacks inklusive Indexer-Suche und Helfern steht auf der [Medien-Übersicht](../index.md#wunsch-pfad-vom-request-zum-abspielbaren-titel).

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt und Inhalt -- Request und Antwort teilen sich einen Pfeil. **Durchgezogene** Kanten sind synchron (der Initiator wartet auf die Antwort), **gestrichelte** laufen zyklisch oder im Hintergrund. Farben kodieren die Wege: Grün der Login, Violett Browse und API, Blau die Wiedergabe, Orange die Beschaffungskette, Grau Nebenwege.

### Stream-Pfad -- vom Login zum laufenden Video

**Leitfrage:** Welchen Weg nimmt ein Stream vom Client bis zur Mediendatei -- und warum sehen Login, Browse und Video drei verschiedene Traefik-Router?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  login: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  browse: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  stream: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  neben: { style: { stroke: "#6b7280"; font-color: "#6b7280"; stroke-dash: 3 } }
}

direction: right

client: Browser und Player-Apps {
  class: node
  tooltip: "Web, Mobile-Apps, TV-Clients wie Infuse -- alle über watch.ackermannprivat.ch"
}

trf: Traefik {
  class: container

  rlogin: jellyfin-login (Prio 10) {
    class: node
    tooltip: "nur /Users/AuthenticateByName -- public-noauth plus Rate-Limit gegen Brute-Force"
  }
  rdefault: jellyfin (Default) {
    class: node
    tooltip: "Web-UI, JSON-APIs, Poster -- volle Chain public-noauth (CrowdSec, Security-Header, Error-Pages)"
  }
  rstream: jellyfin-stream (Prio 100) {
    class: node
    tooltip: "binäre und Streaming-Pfade -- bewusst kurze Chain ohne Error-Pages"
  }
}

jf: Jellyfin {
  class: node
  tooltip: "Nomad-Job auf client-05/06 -- QSV-Transcoding über die durchgereichte Iris Xe"
}

ldap: Authentik LDAP Outpost {
  class: node
  tooltip: "authentik-ldap.service.consul Port 3389 -- Cached Bind im Outpost-Memory"
}

nfs: NFS /nfs/jellyfin { class: data }
ssd: lokale SSD /tmp/jellyfin { class: data }
csi: Linstor CSI jellyfin-config { class: data }

client -> trf.rlogin: "1. Login (Benutzername und Passwort)" { class: login }
trf.rlogin -> jf: "2. leitet rate-limitiert weiter" { class: login }
jf -> ldap: "3. LDAP-Bind prüft die Credentials" { class: login }
client -> trf.rdefault: "4. Browse -- UI, Metadaten, Poster" { class: browse }
trf.rdefault -> jf: "5. volle Middleware-Chain" { class: browse }
client -> trf.rstream: "6. Play -- Video- und Audio-Pfade (Range, HLS)" { class: stream }
trf.rstream -> jf: "7. kurze Chain -- keine Error-Pages im Binärstrom" { class: stream }
jf -> nfs: "8. liest die Mediendatei" { class: stream }
jf -> ssd: "9. schreibt Transcode-Segmente (QSV)" { class: stream }
jf -> csi: "Config und interne DB" { class: neben }
```

Lesehilfe:

1. **Login (grün):** Der Client schickt die Credentials an den Login-Router -- nur dieser Pfad (`/Users/AuthenticateByName`) trägt das Rate-Limit gegen Brute-Force ([Referenz -- Traefik-Routing](./referenz.md#traefik-routing-und-streaming-bypass)).
2. Jellyfin prüft die Credentials selbst per LDAP-Bind gegen den Authentik LDAP Outpost -- kein ForwardAuth vor Jellyfin, damit TV- und App-Clients ohne Browser-Login funktionieren ([Betrieb -- Authentifizierung](./betrieb.md#authentifizierung)).
3. Nach dem Login läuft die Session über Jellyfin-eigene Access-Tokens -- LDAP wird nur beim Anmelden gebraucht ([Ausfallverhalten](#ausfallverhalten)).
4. **Browse (violett):** UI, Metadaten und Poster nehmen den Default-Router mit der vollen Chain inklusive Error-Pages.
5. **Play (blau):** Binäre und Streaming-Pfade matcht der Stream-Router mit der höchsten Priorität und bewusst kurzer Chain -- Error-Pages würden HTML in Binär- und Range-Antworten schreiben ([Referenz -- Streaming-Bypass](./referenz.md#traefik-routing-und-streaming-bypass)).
6. Jellyfin liest die Datei vom NFS-Share; passt das Format nicht zum Client, transkodiert QSV auf die lokale SSD statt auf NFS ([Referenz -- Hardware-Transcoding](./referenz.md#hardware-transcoding), [Storage](./referenz.md#storage)).
7. Config und interne Datenbank liegen auf dem DRBD-replizierten CSI-Volume -- Hintergrundverkehr ohne Schrittnummer ([Backup](#backup)).

### Medien-Ankunft -- vom Wunsch zum Titel in der Bibliothek

**Leitfrage:** Wer stösst nach einem Wunsch in Seerr den Download an -- und wie erfährt Jellyfin vom neuen Titel?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  kette: { style: { stroke: "#e8710a"; font-color: "#e8710a" } }
  scan: { style: { stroke: "#2563eb"; font-color: "#2563eb"; stroke-dash: 3 } }
}

direction: right

seerr: Seerr {
  class: node
  tooltip: "Wunschliste wish.ackermannprivat.ch -- Familie und Gäste"
}
arr: Sonarr und Radarr {
  class: node
  tooltip: "suchen das Release über die Prowlarr-Indexer -- vollständige Kette auf der Medien-Übersicht"
}
sab: SABnzbd { class: node }

nas: NFS-Share /nfs/jellyfin {
  class: data
  tooltip: "downloads/ und media/ auf demselben Share -- der Import ist ein Hardlink, keine Kopie"
}

jf: Jellyfin { class: node }

seerr -> jf: "1. prüft die Verfügbarkeit (API)" { class: kette }
seerr -> arr: "2. legt den genehmigten Request an (API)" { class: kette }
arr -> sab: "3. übergibt das gewählte Release als NZB" { class: kette }
sab -> nas: "4. lädt und entpackt nach downloads/" { class: kette }
arr -> nas: "5. importiert als Hardlink nach media/" { class: kette }
jf -> nas: "6. Library-Scan liest media/" { class: scan }
```

Lesehilfe:

1. Ein Wunsch in [Seerr](../jellyseerr.md) startet die Kette -- Seerr prüft zuerst per Jellyfin-API, ob der Titel schon in der Mediathek ist ([Service-Verbindungen](../jellyseerr.md#service-verbindungen)).
2. **Den Download initiiert Sonarr beziehungsweise Radarr**, nicht Seerr und nicht Jellyfin: sie suchen das passende Release und übergeben es als NZB an SABnzbd -- die Indexer-Suche und die asynchronen Helfer zeigt der [Wunsch-Pfad der Medien-Übersicht](../index.md#wunsch-pfad-vom-request-zum-abspielbaren-titel).
3. SABnzbd lädt und entpackt nach `downloads/` auf dem Share.
4. Sonarr und Radarr importieren den fertigen Download als Hardlink nach `media/` -- gleicher Share, keine Kopie ([Arr-Stack -- Speicher](../arr-stack/index.md#speicher)).
5. Jellyfin erfährt vom neuen Titel über seinen Library-Scan des Shares -- danach ist er abspielbar ([Storage-Mounts](./referenz.md#storage)).
6. Kein Schritt dieser Kette blockiert das Streaming: fällt die Beschaffung aus, spielt der Bestand unverändert weiter ([Medien-Übersicht -- Ausfallverhalten](../index.md#ausfallverhalten)).

## Ausfallverhalten

**Leitfrage:** Was fällt aus, wenn eine Station des Stream-Pfads fehlt?

- **LDAP Outpost down:** Neue Anmeldungen schlagen fehl -- der Bind in Schritt 3 hat kein Ziel, und der Cached Bind liegt im Outpost-Memory, hilft also nur, solange der Outpost läuft. Bereits angemeldete Clients streamen weiter: ihre Sessions laufen über Jellyfin-eigene Access-Tokens, LDAP wird nur beim Login konsultiert ([Betrieb -- Authentifizierung](./betrieb.md#authentifizierung)).
- **Seerr oder die Arr-Kette down:** Betrifft nur Neuzugänge, nie die Wiedergabe -- hängen gebliebene Requests holt der request-sync Sidecar nach ([Medien-Übersicht -- Ausfallverhalten](../index.md#ausfallverhalten)).
- **NAS down:** Der härteste Ausfall -- ohne Share keine Wiedergabe; Folgen und Rückkehr-Gotchas ebenfalls in der [Medien-Übersicht](../index.md#ausfallverhalten).

## Beziehung zu Jellyseerr

[Jellyseerr](../jellyseerr.md) ist das Wunschsystem für neue Medien: Benutzer (Familie, Gäste) fordern über `wish.ackermannprivat.ch` Filme und Serien an, die Beschaffung läuft wie in der [Medien-Ankunft](#medien-ankunft-vom-wunsch-zum-titel-in-der-bibliothek) gezeigt.

## Abhängigkeiten

- [Authentik](../../edge/authentik/index.md) -- LDAP Bind Authentifizierung (via LDAP Outpost)
- [Jellyseerr](../jellyseerr.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [NAS-Speicher](../../storage/nas/index.md) -- Medienbibliothek unter `/nfs/jellyfin`
- [Linstor](../../storage/linstor/index.md) -- CSI Storage für das Config-Volume

## Backup

- **Config:** Linstor CSI Volume `jellyfin-config` -- DRBD-repliziert über `client-05/06`. Zusätzlich durch die allgemeine [Backup-Strategie](../../storage/backup/index.md) abgedeckt.
- **Cache/Transcodes:** Flüchtig auf `/tmp`, kein Backup notwendig.
- **Mediendaten:** NFS-Share auf dem [NAS](../../storage/nas/index.md), unterliegt der NAS-eigenen Backup-Strategie.

## Verwandte Seiten

- [Jellyfin Referenz](./referenz.md) -- Transcoding, Storage, Traefik-Routing, Wartungsbanner
- [Jellyfin Betrieb](./betrieb.md) -- Authentifizierung, IPv6, täglicher Restart, Kurator-Playlists
- [Medien-Übersicht](../index.md) -- Big Picture des Stacks mit Wunsch-Pfad, Storage-Sicht und Nebenwegen
- [Jellyseerr](../jellyseerr.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [Audiobookshelf](../audiobookshelf.md) -- Teilt die Bücher-Mediathek
- [Authentik](../../edge/authentik/index.md) -- Authentifizierung (LDAP Outpost)
- [NAS-Speicher](../../storage/nas/index.md) -- NFS-Storage für Medien
- [Batch Jobs](../../_querschnitt/batch-jobs.md) -- Täglicher Restart-Job
