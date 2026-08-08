---
title: Karakeep Ingest
description: Anreicherungs-Ingest für Karakeep -- LinkedIn- und Instagram-Posts über Apify, YouTube-Videos gratis über oEmbed, Web-Links über Scrapfly, dazu Überholspur für Einzel-Abrufe, Rezept-Zweig nach Tandoor und stündlicher LinkedIn-Saves-Pull
tags:
  - service
  - productivity
  - nomad
  - bookmarks
---

# Karakeep Ingest

Karakeep Ingest ist eine schlanke Anreicherungs-Schicht über [Karakeep](../karakeep/index.md): eine Paste-Seite, die eingefügte URLs nach Herkunft aufteilt und die fertig aufbereiteten Inhalte in Karakeep ablegt. Der Dienst hält keinen eigenen Bestand -- Karakeep bleibt der einzige Speicherort. Er ist bewusst nur intern und über Tailscale erreichbar und ein React-SPA mit Hono-BFF in einem Container nach dem [Homelab-App-Standard](../github-runner/index.md).

Seit dem 30.07.2026 hat der Dienst neben der Paste-Seite eine zweite, authentisierte Schnittstelle: die [Überholspur für Einzel-Abrufe](#uberholspur-fur-einzel-abrufe), über die [Todo Ingest](../todo-ingest/index.md) diktierte Links im laufenden Verarbeitungslauf liest. Dazu kommen zwei Fähigkeiten aus dem Juli 2026: der [Rezept-Zweig](#rezept-zweig-tandoor), der aus einem Ingest zusätzlich ein strukturiertes Rezept in [Tandoor](../tandoor/index.md) anlegt, und der [stündliche LinkedIn-Saves-Pull](#linkedin-saves-pull), der gespeicherte LinkedIn-Posts ohne Handgriff einsammelt.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [kara-in.ackermannprivat.ch](https://kara-in.ackermannprivat.ch) (nur intern + Tailscale) |
| Deployment | Nomad Job `services/karakeep-ingest.nomad`, Image aus [github.com/derever-labs/karakeep-ingest](https://github.com/derever-labs/karakeep-ingest) |
| Storage | Linstor CSI: `karakeep-ingest-data` (SQLite-Job-DB, nur Betriebszustand) |
| Auth | `intern-api@file` (IP-Allowlist intern + Tailscale), bewusst ohne Authentik -- gleiche Vertrauenszone wie Karakeep, die Überholspur zusätzlich mit eigenem Bearer-Token |
| Secrets | Vault `kv/karakeep-ingest` (Scrapfly, Karakeep-API, Apify, OpenAI, Tandoor, LinkedIn-DMA, ntfy, Kuma-Push, Token der Überholspur) |
| Browser-Backend | Geteilter Dienst [Browserless](../browserless/) für den Consent-Fallback |

## Rolle im Stack

Karakeep Ingest ist die Erfassungs-Hilfe für Fälle, die der Karakeep-eigene Crawler nicht sauber oder nicht kostenfrei abdeckt: LinkedIn-Posts hinter der Auth-Wall, Instagram-Posts und -Reels hinter dem Login, YouTube-Videos als vollwertige Karte ohne Scrapfly-Kosten und Web-Seiten mit Consent-Bannern oder fehlendem Vorschaubild. Er reichert nur an (Archiv, Vorschaubild, Metadaten) und ordnet nicht ein -- keine organisierenden Tags und keine Listen-Zuweisung; für LinkedIn, Instagram und YouTube setzt er lediglich Herkunfts-Tags (LinkedIn: Autor, erwähnte Firmen, Hashtags; Instagram: Quelle, Autor, markierte Konten, Hashtags; YouTube: Quelle und Kanal) automatisch. Die Organisation bleibt im wöchentlichen Karakeep-Batch. Stirbt Apify oder Scrapfly, funktioniert der manuelle Screenshot-Weg unverändert weiter; der Dienst ist bewusst degradierbar.

Eingefügte URLs werden nach Herkunft aufgeteilt: LinkedIn läuft über die Apify-Pipeline (Volltext und Originalbilder), Instagram über einen zweiten Apify-Actor (Caption und Originalbilder, bei Carousels alle Seiten, bei Reels das Cover-Thumbnail statt des Videos), YouTube-Videos über einen kostenlosen Pfad (oEmbed-Metadaten und das Vorschaubild aus dem Thumbnail-CDN, ohne Scrapfly), alle anderen Quellen über Scrapfly (og-Metadaten und ein Consent-Wall-freies HTML-Archiv). Alle Pfade schreiben das Ergebnis über die Karakeep-API, die intern via Consul aufgelöst wird. Bei Instagram nehmen nur einzelne Posts und Reels (`/p/`, `/reel/`) den Apify-Pfad; Profile, Explore und Stories bleiben im Web-Pfad. Bei YouTube gilt dasselbe für echte Videos (Watch-Links, Shorts, youtu.be) gegenüber Kanälen und Playlists.

```d2
classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

UI: "Paste-Seite\n(URL-Eingabe)" { class: node }

Read: "todo-ingest\n(Überholspur)" {
  class: node
  tooltip: "Einzel-Abruf eines diktierten Links, Bearer-authentisiert. Leiht einen Slot des Pipeline-Pools mit Vorrang und nimmt das Karakeep-Lesezeichen als Beifang mit"
}

DMA: "LinkedIn-DMA-Snapshot\n(gespeicherte Posts)" {
  class: node
  tooltip: "Stündlicher Abruf der Member-Data-Portability-API. Neue Saves laufen über den normalen LinkedIn-Pfad ein, eine Hochwassermarke macht den Nachzug verlustfrei"
}

Ingest: "karakeep-ingest\n(Hono-BFF + In-Prozess-Queue)" {
  style.stroke-dash: 4
  LI: "LinkedIn-Pfad\n(Apify)" { class: node }
  IG: "Instagram-Pfad\n(Apify)" { class: node }
  YT: "YouTube-Pfad\n(oEmbed, gratis)" { class: node }
  WEB: "Web-Pfad\n(Scrapfly)" { class: node }
}

Karakeep: "Karakeep\n(einziger Bestand)" { class: node }

Tandoor: "Tandoor\n(Rezepte)" { class: node }

BL: "browserless\n(Consent-Klick)" { class: node }

UI -> Ingest.LI: "linkedin.com"
UI -> Ingest.IG: "Post / Reel"
UI -> Ingest.YT: "YouTube-Video"
UI -> Ingest.WEB: "andere Quellen"
DMA -> Ingest.LI: "stündlicher Saves-Pull"
Ingest.LI -> Karakeep: "Volltext + Bilder"
Ingest.IG -> Karakeep: "Caption + Bilder"
Ingest.YT -> Karakeep: "oEmbed + Thumbnail"
Ingest.WEB -> Karakeep: "og-Meta + Archiv"
Ingest.WEB -> BL: "Fallback: Consent-Klick,\nArtikel-HTML"
Ingest -> Tandoor: "Rezept-Toggle:\nLLM-Extraktion" { style.stroke: "#16a34a" }
Read -> Ingest: "POST /api/read (Bearer):\neine URL, Volltext zurück" { style.stroke: "#2563eb" }
```

**Belegt gegen** `server/api.ts`, `server/engine.ts`, `server/pipeline.ts`, `server/linkedin-pull.ts` und `server/recipe-extract.ts` im App-Repo, Stand 08.08.2026.

## Nutzungsregel

- LinkedIn-Post-URL: immer über den Ingest. Der Karakeep-eigene Crawler läuft in die Auth-Wall.
- Instagram-Post- oder Reel-URL: über den Ingest. Der Karakeep-eigene Crawler kommt nicht hinter den Login.
- YouTube-Video-URL: über den Ingest. Er baut die Karte kostenlos aus oEmbed und dem Thumbnail-CDN, statt Scrapfly-Credits zu verbrauchen.
- Alle anderen Quellen: weiterhin Karakeep-nativ (Extension, Share-Sheet). Der Ingest ist der zweite Versuch, wenn die Karte ohne Bild bleibt oder das Archiv einen Consent-Banner zeigt.
- Backlog: die My-Items-Seite im eingeloggten Browser öffnen, URLs kopieren und als Block in die Paste-Seite einfügen.
- Diktierte Links brauchen keinen Handgriff: [Todo Ingest](../todo-ingest/index.md) ruft die Überholspur selbst auf, und das Lesezeichen entsteht dabei mit.

Die Kosten sind gedeckelt: ein Tageslimit für Scrapfly-Requests und eine Bestätigungsschwelle bei grossen Batches (Details im Job und im Design). Karakeep bleibt der einzige Bestand -- der Ingest speichert nur seinen Betriebszustand.

## Überholspur für Einzel-Abrufe

Die Paste-Seite ist ein Batch-Weg: URLs gehen in die Queue, die Karten erscheinen, wenn sie fertig sind. Für einen wartenden Aufrufer taugt das nicht -- [Todo Ingest](../todo-ingest/index.md) muss einen diktierten Link innerhalb seines Verarbeitungslaufs lesen oder ehrlich aufgeben. Dafür trägt der Dienst seit dem 30.07.2026 eine zweite, schmale Schnittstelle: `POST /api/read` holt genau eine URL und gibt deren Inhalt zurück, statt eine Karte zu bauen. Sie nutzt dieselben vier Pfade wie der Batch, und dieser Abschnitt ist die kanonische Beschreibung der Schnittstelle.

- **Authentisiert, nie offen:** Zusätzlich zur internen Netz-Grenze verlangt die Route einen eigenen Bearer-Token (`INGEST_READ_TOKEN` aus Vault). Fehlt er, antwortet sie `503`, statt offen zu stehen -- dasselbe fail-closed-Muster wie beim öffentlichen Ingest. Der Aufrufer hält denselben Wert in seinem eigenen Vault-Pfad.
- **Antwort oder Ticket:** `200` bei terminalem Zustand, `202` mit Ticket, solange der Abruf läuft, nachgefragt wird über `GET /api/read/:id`. Zurück kommen der gekappte Volltext (`INGEST_READ_MAX_CHARS`, Standard 3000 Zeichen), Titel und og-Metadaten, die finale URL nach Weiterleitungen, der Wall-Status und der Credit-Verbrauch.
- **Ein Fehlschlag ist ein Ergebnis, kein HTTP-Fehler:** Fachliche Fehlschläge kommen als `status: "failed"` mit einem stabilen `code` -- `consent_wall`, `no_apify_access`, `budget_scrapfly`, `budget_apify`, `fetch_failed`, `no_content`, `unsupported_url` oder `interrupted`. Der Aufrufer soll den Grund sichtbar vermerken statt zu wiederholen: Eine Consent-Wall ist beim zweiten Versuch dieselbe Wall, und ein HTTP-Fehler hätte genau die Wiederholung eingeladen, die Credits verbrennt.
- **Slot-Leihe mit Vorrang statt zweiter Pfad:** Der Abruf leiht einen Slot des bestehenden Pipeline-Pools und drängelt sich vor -- solange ein Abruf wartet, kommt keine neue Batch-Arbeit dazwischen. Der Pool ist der Begrenzer des Scrapfly-Kontos und nicht bloss eine Warteschlange, ein eigener Weg daneben hätte ihn umgangen und das Tageslimit überzogen. Am Batch-Verhalten ändert die Überholspur nichts, der Batch wartet nur kurz.
- **LinkedIn ohne Sammelfenster:** Im Abruf-Pfad läuft ein eigener Apify-Einzel-Run mit kurzem Wartebudget statt der gebündelten Batch-Verarbeitung, weil ein wartender Aufrufer kein Sammelfenster abwarten kann. Ohne Apify-Token endet der Abruf mit `no_apify_access`. Der Preis ist der Flat-Anteil eines eigenen Actor-Runs, der im Batch amortisiert wäre.
- **Lesezeichen als Beifang:** Verlangt der Aufrufer es, legt der Abruf aus dem schon geholten Dokument zusätzlich ein Karakeep-Lesezeichen an, in der Liste `INGEST_READ_LIST` (Standard "Diktat-Links"). Ein zweiter Abruf allein für die Karte wäre reine Geldverbrennung. Der Schritt ist best-effort -- ein Fehler dabei erscheint als eigenes Feld in der Antwort und blockiert das Ergebnis nie.

::: info Die Überholspur ist kein zweiter Bestand
Auch der Einzel-Abruf speichert nichts Dauerhaftes: Der Volltext geht an den Aufrufer, das Lesezeichen nach Karakeep. In der Job-DB bleibt nur der Betriebszustand des Abrufs, damit ein Ticket nachfragbar ist. Wie die Anreicherung im Zieldienst weiterverarbeitet wird, steht bei [Todo Ingest](../todo-ingest/betrieb.md#beilagen-aus-links).
:::

## Rezept-Zweig (Tandoor)

Seit dem 19.07.2026 kann jeder Ingest zusätzlich ein Rezept anlegen: Ist beim Einreichen der Toggle «Rezept» gesetzt, extrahiert nach dem erfolgreichen Karakeep-Import ein Sprachmodell (OpenAI, Redaktions-Prompt) aus dem geholten Inhalt ein strukturiertes Rezept und legt es in [Tandoor](../tandoor/index.md) an -- mit Portionen, Zutaten je Zubereitungsschritt und übernommenem Vorschaubild. Der Zweig ist bewusst entkoppelt: Ein Fehler dort macht den Import nie kaputt, das Lesezeichen entsteht immer; die Fehlermeldung erscheint als Hinweis am Job. Erkennt das Modell kein nachkochbares Rezept (keine Zutatenmengen, keine Schritte), lehnt es mit Begründung ab, statt eines zu erfinden.

Als Quelle dient der Text, den der jeweilige Pfad ohnehin holt: bei Instagram die vollständige Caption, im Web-Pfad das archivierte HTML, bei YouTube seit dem 08.08.2026 die vollständige Videobeschreibung statt der auf rund 160 Zeichen gekappten og-Kurzfassung -- bei Kochkanälen steht das Rezept klassisch genau dort.

::: warning Rezept nur im gesprochenen Wort
Steckt das Rezept ausschliesslich im Video oder Reel selbst (Caption und Beschreibung ohne Zutaten und Schritte), lehnt der Zweig sauber ab -- eine Transkription der Tonspur findet nicht statt.
:::

## LinkedIn-Saves-Pull

Gespeicherte LinkedIn-Posts laufen seit dem 19.07.2026 ohne Handgriff ein: Ein stündlicher Abruf holt den Snapshot der Member-Data-Portability-API (DMA, Domain der gespeicherten Posts) und reicht neue Saves über den normalen LinkedIn-Pfad ein -- gleiche Budget-Deckel, gleiche Dedup-Logik wie beim Einfügen von Hand. Eine Hochwassermarke merkt sich den zuletzt übernommenen Zeitstempel; ein Neustart oder eine tagelange Lücke der API holt deshalb verlustfrei nach.

Überwacht wird zweistufig: Ein Kuma-Push-Monitor (Dead-Man) schlägt aus, wenn der Abruf selbst nicht mehr läuft. Meldet die API dagegen über eine Woche hinweg «kein Snapshot», warnt eine gedrosselte ntfy-Meldung -- der Dead-Man prüft bewusst nur, ob der Code läuft, nicht, ob Daten fliessen.

::: warning DMA-Snapshot: 404 ist doppeldeutig
Die Snapshot-API beendet die Pagination seit Juli 2026 mit einem 404 auf der Folgeseite («No data found for this domain and memberId»); nur auf der ersten Seite bedeutet derselbe Status «Snapshot noch nicht generiert». Wer jeden Nicht-200 als Abbruch wertet, verwirft stillschweigend gültige Daten -- so entstand zwischen dem 21.07. und dem 08.08.2026 ein 18-tägiger unbemerkter Stillstand. Die Changelog-API ist kein Ersatz: sie führt keine Save-Ereignisse.
:::

## Consent-Walls im Web-Pfad

Eine Consent-Interstitial-Seite hat einen brauchbaren Titel und würde ungeprüft als vollwertige, inhaltsleere Karte in Karakeep landen. Der Web-Pfad erkennt sie deshalb und eskaliert in zwei Stufen, bevor er aufgibt.

Zuerst läuft ein einmaliger Zweitversuch über Scrapfly mit einer GeoIP-Herkunft ausserhalb der EU. Das löst die Klasse von Walls, die nur wegen der DSGVO-Geolokalisierung erscheint. Bleibt die Wall auch danach stehen, handelt es sich um die cookie-gebundene Klasse (Sourcepoint-Muster, etwa golem.de): dort liefert der Server ohne Consent-Cookie aus jedem Land die Zustimmungsseite, der GeoIP-Versuch läuft also ins Leere. Für diesen Fall klickt seit dem 28.07.2026 ein echter Browser über [Browserless](../browserless/) den Zustimmungs-Knopf und lädt den Artikel danach unter der Original-URL. Der Klick funktioniert, weil der Consent-Knopf im Cross-Origin-iFrame des Consent-Managers über das Browser-Protokoll erreichbar bleibt -- die Same-Origin-Grenze gilt nur für Skripte im Seiten-Kontext.

Scheitert auch der Browser-Versuch oder landet er erneut auf einer Zustimmungsseite, endet der Job terminal als `failed` mit der Stufe `consent-wall`. Das ist Absicht: eine leere Consent-Karte in Karakeep wäre teurer als ein sichtbarer Fehlschlag.

::: info Der Browser-Versuch kostet keine Scrapfly-Credits
Der Aufruf geht direkt an den internen Browser-Dienst und zählt nicht gegen das Scrapfly-Tageslimit. Der Ingest bringt dafür keine eigene Browser-Bibliothek mit, sondern schickt den Automatisierungs-Code als Text an dessen REST-Schnittstelle. Ist die Umgebungsvariable `BROWSERLESS_URL` leer, entfällt der Schritt ersatzlos und der Ablauf endet wie zuvor beim GeoIP-Zweitversuch. Details zur Umsetzung im App-Repo (`server/consent-browser.ts`, Einhängepunkt in `server/pipeline.ts`).
:::

::: info LinkedIn-, Instagram-, YouTube- und Web-Pfad sind produktiv
Alle vier Pfade sind scharf geschaltet. Der LinkedIn-Pfad importiert Posts real über den Apify-Actor `vulnv~linkedin-posts-scraper`: Volltext, Originalbilder (bei Dokument-Posts alle Seiten), dazu Autor und erwähnte Firmen als Herkunfts-Tags. Der Instagram-Pfad nutzt den offiziellen Apify-Actor `apify~instagram-scraper` (directUrls fuer einzelne Post-/Reel-URLs, gleicher Token, eigener Lauf pro Quelle): Caption als Beschreibung, Originalbilder bzw. bei Reels das Cover-Thumbnail, dazu Autor, markierte Konten und Hashtags als Herkunfts-Tags; Kommentare werden nie uebernommen. Beide Apify-Pfade werden im Batch der Paste-Seite gebündelt und nach einem kurzen Sammelfenster als ein Lauf verarbeitet -- ihre Karten erscheinen deshalb mit einigen Minuten Verzögerung in Karakeep, YouTube- und Web-Karten sofort. Nur die [Überholspur](#uberholspur-fur-einzel-abrufe) fährt für einen einzelnen LinkedIn- oder Instagram-Link einen eigenen Actor-Run ohne Sammelfenster. Der YouTube-Pfad zieht Titel, Kanal und Vorschaubild kostenlos aus dem offiziellen oEmbed-Endpoint und dem Thumbnail-CDN und setzt Quelle und Kanal als Herkunfts-Tags; ist ein Video privat, gelöscht oder altersbeschränkt, endet der Job mit einer sprechenden Fehlermeldung. Die Kosten- und Fenster-Parameter stehen im Job-Template und im Design (SSOT), nicht hier.
:::

## Verwandte Seiten

- [Karakeep](../karakeep/index.md) -- Bookmark-Manager und einziger Bestand, in den der Ingest schreibt
- [Tandoor](../tandoor/index.md) -- Rezept-Verwaltung, Ziel des Rezept-Zweigs
- [Todo Ingest](../todo-ingest/index.md) -- Aufrufer der Überholspur für diktierte Links
- [Browserless](../browserless/) -- geteilter Headless-Browser für den Consent-Fallback
- [Traefik Referenz](../../edge/traefik/referenz.md) -- Middleware-Kette `intern-api@file`
- [Linstor CSI](../../storage/linstor/index.md) -- replizierter Block-Storage (DRBD) für die Job-DB
- [Monitoring: Coverage](../../monitoring/coverage/index.md) -- Kuma-Probe `Karakeep Ingest` und Coverage-Status
