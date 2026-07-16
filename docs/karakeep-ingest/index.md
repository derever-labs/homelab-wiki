---
title: Karakeep Ingest
description: Anreicherungs-Ingest für Karakeep -- LinkedIn- und Instagram-Posts über Apify, YouTube-Videos gratis über oEmbed, Web-Links über Scrapfly
tags:
  - service
  - productivity
  - nomad
  - bookmarks
---

# Karakeep Ingest

Karakeep Ingest ist eine schlanke Anreicherungs-Schicht über [Karakeep](../karakeep/index.md): eine Paste-Seite, die eingefügte URLs nach Herkunft aufteilt und die fertig aufbereiteten Inhalte in Karakeep ablegt. Der Dienst hält keinen eigenen Bestand -- Karakeep bleibt der einzige Speicherort. Er ist bewusst nur intern und über Tailscale erreichbar und ein React-SPA mit Hono-BFF in einem Container nach dem [Homelab-App-Standard](../github-runner/index.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [kara-in.ackermannprivat.ch](https://kara-in.ackermannprivat.ch) (nur intern + Tailscale) |
| Deployment | Nomad Job `services/karakeep-ingest.nomad`, Image aus [github.com/derever-labs/karakeep-ingest](https://github.com/derever-labs/karakeep-ingest) |
| Storage | Linstor CSI: `karakeep-ingest-data` (SQLite-Job-DB, nur Betriebszustand) |
| Auth | `intern-api@file` (IP-Allowlist intern + Tailscale), bewusst ohne Authentik -- gleiche Vertrauenszone wie Karakeep |
| Secrets | Vault `kv/karakeep-ingest` (Scrapfly, Karakeep-API, Apify) |

## Rolle im Stack

Karakeep Ingest ist die Erfassungs-Hilfe für Fälle, die der Karakeep-eigene Crawler nicht sauber oder nicht kostenfrei abdeckt: LinkedIn-Posts hinter der Auth-Wall, Instagram-Posts und -Reels hinter dem Login, YouTube-Videos als vollwertige Karte ohne Scrapfly-Kosten und Web-Seiten mit Consent-Bannern oder fehlendem Vorschaubild. Er reichert nur an (Archiv, Vorschaubild, Metadaten) und ordnet nicht ein -- keine organisierenden Tags und keine Listen-Zuweisung; für LinkedIn, Instagram und YouTube setzt er lediglich Herkunfts-Tags (LinkedIn: Autor, erwähnte Firmen, Hashtags; Instagram: Quelle, Autor, markierte Konten, Hashtags; YouTube: Quelle und Kanal) automatisch. Die Organisation bleibt im wöchentlichen Karakeep-Batch. Stirbt Apify oder Scrapfly, funktioniert der manuelle Screenshot-Weg unverändert weiter; der Dienst ist bewusst degradierbar.

Eingefügte URLs werden nach Herkunft aufgeteilt: LinkedIn läuft über die Apify-Pipeline (Volltext und Originalbilder), Instagram über einen zweiten Apify-Actor (Caption und Originalbilder, bei Carousels alle Seiten, bei Reels das Cover-Thumbnail statt des Videos), YouTube-Videos über einen kostenlosen Pfad (oEmbed-Metadaten und das Vorschaubild aus dem Thumbnail-CDN, ohne Scrapfly), alle anderen Quellen über Scrapfly (og-Metadaten und ein Consent-Wall-freies HTML-Archiv). Alle Pfade schreiben das Ergebnis über die Karakeep-API, die intern via Consul aufgelöst wird. Bei Instagram nehmen nur einzelne Posts und Reels (`/p/`, `/reel/`) den Apify-Pfad; Profile, Explore und Stories bleiben im Web-Pfad. Bei YouTube gilt dasselbe für echte Videos (Watch-Links, Shorts, youtu.be) gegenüber Kanälen und Playlists.

```d2
classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

UI: "Paste-Seite\n(URL-Eingabe)" { class: node }

Ingest: "karakeep-ingest\n(Hono-BFF + In-Prozess-Queue)" {
  style.stroke-dash: 4
  LI: "LinkedIn-Pfad\n(Apify)" { class: node }
  IG: "Instagram-Pfad\n(Apify)" { class: node }
  YT: "YouTube-Pfad\n(oEmbed, gratis)" { class: node }
  WEB: "Web-Pfad\n(Scrapfly)" { class: node }
}

Karakeep: "Karakeep\n(einziger Bestand)" { class: node }

UI -> Ingest.LI: "linkedin.com"
UI -> Ingest.IG: "Post / Reel"
UI -> Ingest.YT: "YouTube-Video"
UI -> Ingest.WEB: "andere Quellen"
Ingest.LI -> Karakeep: "Volltext + Bilder"
Ingest.IG -> Karakeep: "Caption + Bilder"
Ingest.YT -> Karakeep: "oEmbed + Thumbnail"
Ingest.WEB -> Karakeep: "og-Meta + Archiv"
```

## Nutzungsregel

- LinkedIn-Post-URL: immer über den Ingest. Der Karakeep-eigene Crawler läuft in die Auth-Wall.
- Instagram-Post- oder Reel-URL: über den Ingest. Der Karakeep-eigene Crawler kommt nicht hinter den Login.
- YouTube-Video-URL: über den Ingest. Er baut die Karte kostenlos aus oEmbed und dem Thumbnail-CDN, statt Scrapfly-Credits zu verbrauchen.
- Alle anderen Quellen: weiterhin Karakeep-nativ (Extension, Share-Sheet). Der Ingest ist der zweite Versuch, wenn die Karte ohne Bild bleibt oder das Archiv einen Consent-Banner zeigt.
- Backlog: die My-Items-Seite im eingeloggten Browser öffnen, URLs kopieren und als Block in die Paste-Seite einfügen.

Die Kosten sind gedeckelt: ein Tageslimit für Scrapfly-Requests und eine Bestätigungsschwelle bei grossen Batches (Details im Job und im Design). Karakeep bleibt der einzige Bestand -- der Ingest speichert nur seinen Betriebszustand.

::: info LinkedIn-, Instagram-, YouTube- und Web-Pfad sind produktiv
Alle vier Pfade sind scharf geschaltet. Der LinkedIn-Pfad importiert Posts real über den Apify-Actor `vulnv~linkedin-posts-scraper`: Volltext, Originalbilder (bei Dokument-Posts alle Seiten), dazu Autor und erwähnte Firmen als Herkunfts-Tags. Der Instagram-Pfad nutzt den offiziellen Apify-Actor `apify~instagram-scraper` (directUrls fuer einzelne Post-/Reel-URLs, gleicher Token, eigener Lauf pro Quelle): Caption als Beschreibung, Originalbilder bzw. bei Reels das Cover-Thumbnail, dazu Autor, markierte Konten und Hashtags als Herkunfts-Tags; Kommentare werden nie uebernommen. Beide Apify-Pfade werden gebündelt und nach einem kurzen Sammelfenster als ein Lauf verarbeitet -- ihre Karten erscheinen deshalb mit einigen Minuten Verzögerung in Karakeep, YouTube- und Web-Karten sofort. Der YouTube-Pfad zieht Titel, Kanal und Vorschaubild kostenlos aus dem offiziellen oEmbed-Endpoint und dem Thumbnail-CDN und setzt Quelle und Kanal als Herkunfts-Tags; ist ein Video privat, gelöscht oder altersbeschränkt, endet der Job mit einer sprechenden Fehlermeldung. Die Kosten- und Fenster-Parameter stehen im Job-Template und im Design (SSOT), nicht hier.
:::

## Verwandte Seiten

- [Karakeep](../karakeep/index.md) -- Bookmark-Manager und einziger Bestand, in den der Ingest schreibt
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware-Kette `intern-api@file`
- [Linstor CSI](../storage/linstor/index.md) -- replizierter Block-Storage (DRBD) für die Job-DB
- [Monitoring: Coverage](../monitoring/coverage/index.md) -- Kuma-Probe `Karakeep Ingest` und Coverage-Status
