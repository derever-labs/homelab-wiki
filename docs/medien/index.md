---
title: Medien
description: Big Picture des Medien-Stacks -- Wunsch-Pfad, Storage-Sicht und Nebenwege mit Jellyfin, Seerr, arr-Suite, SABnzbd, Audiobookshelf und Content-Pipeline
tags:
  - overview
  - media
---

# Medien

Der Medien-Stack macht aus einem Wunsch einen abspielbaren Titel: [Seerr](./jellyseerr.md) nimmt Anfragen entgegen, die [arr-Suite](./arr-stack/index.md) beschafft und organisiert, [Jellyfin](./jellyfin/index.md) streamt. Daneben serviert [Audiobookshelf](./audiobookshelf.md) Hörbücher, [LazyLibrarian](./media-tools.md#lazylibrarian) beschafft Bücher und die [Content Pipeline](./content-pipeline/index.md) lädt automatisiert eigene Inhalte. Diese Seite ist das Big Picture: drei Szenario-Diagramme zeigen, wie die Komponenten zusammenspielen -- der Wunsch-Pfad, die Storage-Sicht und die Nebenwege abseits des Wunsch-Pfads.

Die Details bleiben auf den Systemseiten: Transcoding und Routing in der [Jellyfin Referenz](./jellyfin/referenz.md), Quality-Profile in den [Qualitätsprofilen](./arr-stack/referenz.md), Seerr-Eigenheiten auf der [Seerr-Seite](./jellyseerr.md), die Batch-Jobs in der [Content Pipeline](./content-pipeline/index.md).

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Deployment | Nomad-Jobs unter `media/`, Batch-Jobs unter `batch-jobs/`, Profilarr unter `services/` |
| Nodes | `vm-nomad-client-05/06` -- Constraint folgt den Linstor-Volumes und der iGPU |
| Media-Storage | NFS-Share `/nfs/jellyfin` auf dem [NAS](../storage/nas/index.md) |
| Config-Storage | [Linstor CSI](../storage/linstor/index.md), je Service ein Volume |
| Datenbanken | [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md) (Sonarr, Radarr, Prowlarr, Seerr, Jellystat) |
| Auth | je Zielgruppe verschieden -- siehe [Zugriff und Authentifizierung](#zugriff-und-authentifizierung) |

### Dienste

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **[Jellyfin](./jellyfin/index.md)** | Medienserver mit QSV-Hardware-Transcoding | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| **[Seerr](./jellyseerr.md)** | Medienwünsche für Familie und Gäste | [wish.ackermannprivat.ch](https://wish.ackermannprivat.ch) |
| **[Sonarr / Radarr](./arr-stack/index.md)** | Automatische Beschaffung von Serien und Filmen | [sonarr.](https://sonarr.ackermannprivat.ch) / [radarr.ackermannprivat.ch](https://radarr.ackermannprivat.ch) |
| **[Prowlarr](./arr-stack/index.md)** | Indexer-Verwaltung für die arr-Suite | [prowlarr.ackermannprivat.ch](https://prowlarr.ackermannprivat.ch) |
| **[SABnzbd](./arr-stack/index.md)** | Usenet-Downloader | [sabnzbd.ackermannprivat.ch](https://sabnzbd.ackermannprivat.ch) (nur intern) |
| **[Audiobookshelf](./audiobookshelf.md)** | Hörbücher und Podcasts | [audio.ackermannprivat.ch](https://audio.ackermannprivat.ch) |
| **[LazyLibrarian](./media-tools.md#lazylibrarian)** | Beschaffung von E-Books und Hörbüchern | [lazylibrarian.ackermannprivat.ch](https://lazylibrarian.ackermannprivat.ch) |
| **[Content Pipeline](./content-pipeline/index.md)** | Automatisierte Downloads mit Telegram-Steuerung | — (headless) |
| **[Media-Hilfstools](./media-tools.md)** | Jellystat (Statistik), [Profilarr](./arr-stack/profilarr.md) (Profile-Sync) | siehe Seite |

## Das Gesamtbild in drei Sichten

Lese-Konvention für alle drei Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt und Inhalt. **Durchgezogene** Kanten sind synchrone Abruf- oder Schreibflüsse, **gestrichelte** Kanten sind asynchron -- ereignisgetriebene Meldungen. Farbige Kanten kodieren in der Storage-Sicht die Speicherklasse (blau NFS, violett Linstor CSI, grau lokal-flüchtig), bei den Nebenwegen den Weg (grün Bücher, orange Content-Pipeline).

### Wunsch-Pfad -- vom Request zum abspielbaren Titel

**Leitfrage:** Wie wird aus einem Wunsch in Seerr ein Titel, der in Jellyfin abspielbar ist?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  helper: { style: { border-radius: 8; stroke-dash: 2 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  async: { style: { stroke-dash: 3 } }
}

user: Familie und Gäste {
  class: svc
  tooltip: Zugriff über wish.ackermannprivat.ch mit Authentik ForwardAuth (public-auth)
}
seerr: Seerr { class: svc }
jf: Jellyfin { class: svc }
arr: Sonarr und Radarr {
  class: svc
  tooltip: Sonarr für Serien, Radarr für Filme -- je eigene Instanz mit eigenen Quality-Profilen
}
prowlarr: Prowlarr { class: svc }
idx: Usenet-Indexer (extern) { class: svc }
sab: SABnzbd { class: svc }
nfs: NFS-Share /nfs/jellyfin {
  class: data
  tooltip: downloads/ und media/ liegen auf demselben Share -- Import als Hardlink statt Kopie
}

suggest: SuggestArr { class: helper }
profilarr: Profilarr { class: helper }
rsync: request-sync Sidecar { class: helper }

user -> seerr: 1. Wunsch (HTTPS)
seerr -> jf: 2. prüft Verfügbarkeit (API)
seerr -> arr: 3. legt genehmigten Request an (API)
arr -> prowlarr: 4. sucht Release (Newznab)
prowlarr -> idx: 5. fragt Indexer ab (HTTPS)
arr -> sab: 6. übergibt NZB (API)
sab -> nfs: 7. lädt nach downloads/
arr -> nfs: 8. importiert als Hardlink und benennt um
jf -> nfs: 9. liest media/ beim Library-Scan
suggest -> seerr: erstellt Pending Requests { class: async }
profilarr -> arr: synct Quality-Profile { class: async }
rsync -> seerr: stösst hängige Requests neu an { class: async }
```

Lesehilfe:

1. Familie und Gäste stellen den Wunsch in [Seerr](./jellyseerr.md) -- über `wish.ackermannprivat.ch` mit Authentik ForwardAuth.
2. Seerr prüft über die Jellyfin-API, ob der Titel schon in der Mediathek ist ([Service-Verbindungen](./jellyseerr.md#service-verbindungen), alle intern via Consul DNS).
3. Genehmigte Requests legt Seerr per API in Sonarr (Serien) beziehungsweise Radarr (Filme) an.
4. Sonarr und Radarr suchen über die von [Prowlarr](./arr-stack/index.md) verwalteten Indexer nach einem Release, das ihrem [Quality-Profil](./arr-stack/referenz.md) entspricht.
5. Prowlarr fragt dafür die externen Usenet-Indexer ab.
6. Das gewählte Release geht als NZB an SABnzbd -- untereinander sprechen die arr-Services über Traefik-URLs ([musl-Gotcha](./arr-stack/index.md#interne-service-kommunikation)).
7. SABnzbd lädt und entpackt nach `downloads/` auf dem NFS-Share.
8. Sonarr und Radarr importieren fertige Downloads als [Hardlink statt Kopie](./arr-stack/index.md#speicher) in die Mediathek und benennen sie nach ihrem Schema um.
9. Jellyfin liest `media/` vom Share ([Storage-Mounts](./jellyfin/referenz.md#storage)) -- nach dem nächsten Library-Scan ist der Titel abspielbar.

Drei asynchrone Helfer laufen neben dem Pfad: [SuggestArr](../suggestarr/index.md) erstellt aus der Watch-History Pending Requests in Seerr, der [request-sync Sidecar](./jellyseerr.md#request-sync-sidecar) stösst hängen gebliebene Requests periodisch neu an, und [Profilarr](./arr-stack/profilarr.md) hält die Quality-Profile in Sonarr und Radarr synchron.

### Storage-Sicht -- ein Share und drei Speicherklassen

**Leitfrage:** Wo liegen Medien und Konfigurationen, und wer greift wie zu?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  grp: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  e-nfs: { style: { stroke: "#2563eb" } }
  e-csi: { style: { stroke: "#7c3aed" } }
  e-lokal: { style: { stroke: "#6b7280" } }
}

jobs: Media-Jobs auf client-05 und client-06 {
  class: grp
  tooltip: Constraint folgt den Linstor-Volumes und der durchgereichten iGPU -- der ganze Stack läuft auf diesem Node-Paar
  jf: Jellyfin { class: svc }
  abs: Audiobookshelf { class: svc }
  arr: Sonarr und Radarr { class: svc }
  sab: SABnzbd { class: svc }
  ll: LazyLibrarian { class: svc }
}

nas: NFS-Share /nfs/jellyfin auf dem NAS {
  class: grp
  media: media/ {
    class: data
    tooltip: Filme und Serien plus books/ für Bücher und Hörbücher
  }
  dl: downloads/ { class: data }
}

linstor: Linstor-CSI Config-Volumes {
  class: data
  tooltip: je Service ein DRBD-repliziertes Volume -- auch Prowlarr und Seerr
}
tmp: lokale SSD /tmp/jellyfin { class: data }

jobs.sab -> nas.dl: lädt nach downloads/ { class: e-nfs }
jobs.arr -> nas.dl: holt fertige Downloads aus downloads/ { class: e-nfs }
jobs.arr -> nas.media: importiert als Hardlink nach media/ { class: e-nfs }
jobs.jf -> nas.media: streamt die Mediathek { class: e-nfs }
jobs.abs -> nas.media: liest books/ { class: e-nfs }
jobs.ll -> nas.media: organisiert Bücher { class: e-nfs }
jobs -> linstor: Configs -- je Service ein Volume { class: e-csi }
jobs.jf -> tmp: Cache und Transcodes (flüchtig) { class: e-lokal }
```

Lesehilfe, nach Speicherklasse:

- **NFS (blau):** Der Share `/nfs/jellyfin` trägt `downloads/` und `media/` auf demselben Dateisystem -- der Import ist dadurch ein [Hardlink, keine Kopie](./arr-stack/index.md#speicher). Jellyfin streamt daraus, [Audiobookshelf](./audiobookshelf.md) liest `media/books/`, [LazyLibrarian](./media-tools.md#lazylibrarian) organisiert die Bücher dort.
- **Linstor CSI (violett):** Jeder Service hat sein eigenes DRBD-repliziertes Config-Volume -- auch Prowlarr und Seerr, die keine Mediendateien anfassen. Die Volume-Definitionen liegen im Repo unter `nomad-jobs/volumes/`.
- **Lokal (grau):** Jellyfin-Cache und Transcodes liegen bewusst auf der lokalen SSD statt auf NFS ([warum](./jellyfin/referenz.md#storage)).
- **Nicht im Bild:** Die App-Datenbanken von Sonarr, Radarr, Prowlarr, Seerr und Jellystat liegen im [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md); Jellyfin und Audiobookshelf halten ihre Daten selbst auf dem CSI-Volume.

::: warning Gebunden an client-05 und client-06
Der gesamte Medien-Stack läuft auf dem Node-Paar `vm-nomad-client-05/06`: die Linstor-Volumes und die per Passthrough durchgereichte iGPU gibt es nur dort. Fällt ein Node aus, reschedulen die Jobs auf den anderen (Volumes sind DRBD-repliziert, beide Nodes haben GPU-Zugriff) -- fällt das Paar aus, steht der komplette Stack.
:::

### Nebenwege -- Bücher und Content-Pipeline

**Leitfrage:** Welche Inhalte kommen am Wunsch-Pfad vorbei ins System, und wohin fliessen sie?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  buch: { style: { stroke: "#16a34a" } }
  pipe: { style: { stroke: "#e8710a" } }
  pipe-async: { style: { stroke: "#e8710a"; stroke-dash: 3 } }
}

ll: LazyLibrarian { class: svc }
books: media/books/ auf dem NFS-Share { class: data }
abs: Audiobookshelf { class: svc }
jf: Jellyfin { class: svc }

cron: Nomad-Cron {
  class: svc
  tooltip: beide Batch-Jobs laufen nachts gestaffelt, um NFS- und CPU-Konkurrenz zu vermeiden
}
tg: Telegram-Chat { class: svc }
tgbot: phdler-telegram-bot { class: svc }
dl: reddit-gallery-dl und ph-downloader { class: svc }
nfslogs: NFS-Volume nfs-logs { class: data }
stash: Stash { class: svc }
relay: telegram-relay { class: svc }

ll -> books: B1. lädt und organisiert Bücher und Hörbücher { class: buch }
abs -> books: B2. serviert Hörbücher und E-Books { class: buch }
jf -> books: B3. liest dieselbe Bibliothek { class: buch }

cron -> dl: P1. startet täglich nachts { class: pipe }
tgbot -> tg: P2. holt Befehle (Long-Polling) { class: pipe }
tgbot -> dl: P3. triggert Lauf (Nomad-API) { class: pipe }
dl -> nfslogs: P4. schreibt Downloads { class: pipe }
dl -> stash: P5. stösst Scan und Generate an { class: pipe-async }
dl -> relay: P6. Ergebnis-Report { class: pipe-async }
```

Lesehilfe:

1. **Bücherweg (grün):** [LazyLibrarian](./media-tools.md#lazylibrarian) beschafft E-Books und Hörbücher nach `media/books/` (B1). [Audiobookshelf](./audiobookshelf.md) serviert sie mit Kapitel-Navigation und geräteübergreifendem Fortschritt (B2), Jellyfin zeigt dieselbe Bibliothek (B3) -- ein Bestand, zwei Player.
2. **Content-Pipeline (orange):** Zwei periodische Batch-Jobs laden nachts gestaffelt eigene Inhalte (P1); zusätzlich lassen sie sich per Telegram-Befehl über den `phdler-telegram-bot` triggern (P2, P3). Details: [Content Pipeline](./content-pipeline/index.md).
3. Die Pipeline-Downloads landen im NFS-Volume `nfs-logs` (P4) -- bewusst getrennt von der Jellyfin-Mediathek.
4. Nach neuen Downloads stossen die Jobs einen Scan in [Stash](../stash/index.md) an (P5) und melden das Ergebnis über den `telegram-relay` (P6) -- beides ereignisgetrieben, darum gestrichelt.

## Zugriff und Authentifizierung

Jede Zielgruppe hat ihr eigenes Auth-Muster -- die Middleware-Chains sind in der [Traefik Referenz](../edge/traefik/referenz.md) definiert:

- **Jellyfin:** LDAP-Bind in der Applikation statt Traefik-OAuth, damit TV- und App-Clients ohne Browser-Login zugreifen können ([Jellyfin Betrieb](./jellyfin/betrieb.md#authentifizierung)).
- **Seerr:** `public-auth` -- Familie und Gäste erreichen die Wunschliste von extern über Authentik ForwardAuth ([Seerr](./jellyseerr.md)).
- **Audiobookshelf:** Dual-Router -- intern ohne Auth-Redirect für die mobilen Apps, extern mit ForwardAuth ([Audiobookshelf](./audiobookshelf.md)).
- **Arbeits-Tools** (Sonarr, Radarr, Prowlarr, SABnzbd, LazyLibrarian, Jellystat): interne Auth-Chains, SABnzbd ist nur aus dem lokalen Netz erreichbar ([Arr-Stack](./arr-stack/index.md)).

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss:

- **Was, wenn der arr-Stack oder SABnzbd down ist?** Keine Neuzugänge -- der Bestand spielt unverändert weiter, Jellyfin und Audiobookshelf sind nicht betroffen. Genehmigte Seerr-Requests gehen nicht verloren: der [request-sync Sidecar](./jellyseerr.md#request-sync-sidecar) stösst hängen gebliebene Requests periodisch neu an, sobald die Ziele wieder erreichbar sind.

- **Was, wenn Jellyfin down ist?** Kein Streaming von Filmen und Serien; Audiobookshelf läuft als eigener Server unabhängig weiter. Seerr kann die Verfügbarkeit nicht mehr prüfen. Ein geplanter Kurzausfall ist eingebaut: der [tägliche Restart-Job](./jellyfin/betrieb.md#taglicher-restart) startet Jellyfin neu, sofern keine Streams laufen.

- **Was, wenn das NAS down ist?** Der härteste Ausfall: Mediathek und Downloads sind für alle Konsumenten weg -- Jellyfin, Audiobookshelf, LazyLibrarian und SABnzbd laufen ins Leere. Die Configs überleben auf den Linstor-Volumes, die Services starten also sauber wieder, sobald NFS zurück ist. Gotcha dabei: stale NFS-Directory-Caches können SABnzbd-Downloads auch nach der Rückkehr scheitern lassen ([NAS Troubleshooting](../storage/nas/betrieb.md#troubleshooting)).

- **Was, wenn PostgreSQL down ist?** Sonarr, Radarr, Prowlarr, Seerr und Jellystat stehen (Seerr wartet im Prestart-Task auf die Datenbank). Jellyfin, Audiobookshelf und SABnzbd laufen weiter -- ihre Daten liegen nicht im [Shared Cluster](../_querschnitt/datenbank-architektur.md).

- **Was, wenn Profilarr oder SuggestArr down ist?** Unkritisch: die bereits synchronisierten Quality-Profile bleiben in Sonarr und Radarr aktiv ([Profilarr](./arr-stack/profilarr.md)), und Wünsche lassen sich weiterhin manuell in Seerr stellen.

## Verwandte Seiten

- [Jellyfin](./jellyfin/index.md) -- Medienserver mit QSV-Transcoding und LDAP-Auth
- [Jellyfin Referenz](./jellyfin/referenz.md) -- Transcoding, Storage-Mounts, Traefik-Routing
- [Jellyfin Betrieb](./jellyfin/betrieb.md) -- Authentifizierung, täglicher Restart, Kurator-Playlists
- [Arr-Stack](./arr-stack/index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Qualitätsprofile](./arr-stack/referenz.md) -- Quality Profiles und die SQP-Familie
- [Profilarr](./arr-stack/profilarr.md) -- Quality-Profile-Sync aus den TRaSH Guides
- [Seerr (Jellyseerr)](./jellyseerr.md) -- Medienwünsche mit Sonarr/Radarr-Integration
- [Audiobookshelf](./audiobookshelf.md) -- Hörbücher und Podcasts
- [Media-Hilfstools](./media-tools.md) -- Jellystat, LazyLibrarian, Handbrake (deprecated)
- [Content Pipeline](./content-pipeline/index.md) -- Batch-Downloads mit Telegram-Steuerung
- [SuggestArr](../suggestarr/index.md) -- automatische Empfehlungen als Pending Requests
- [Stash](../stash/index.md) -- Ziel der Content-Pipeline-Scans
- [Video-Download-Tools](../video-download/index.md) -- manuelle Download-UIs
- [NAS-Speicher](../storage/nas/index.md) -- NFS-Exports und Mount-Pfade (SSOT)
- [Linstor/DRBD](../storage/linstor/index.md) -- CSI-Volumes für die Configs
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- periodische Jobs rund um den Stack
