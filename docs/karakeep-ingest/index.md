---
title: Karakeep Ingest
description: Anreicherungs-Ingest für Karakeep -- LinkedIn-Posts über Apify, Web-Links über Scrapfly
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

Karakeep Ingest ist die Erfassungs-Hilfe für zwei Fälle, die der Karakeep-eigene Crawler nicht sauber abdeckt: LinkedIn-Posts hinter der Auth-Wall und Web-Seiten mit Consent-Bannern oder fehlendem Vorschaubild. Er reichert nur an (Archiv, Vorschaubild, Metadaten) und ordnet nicht ein -- kein Tagging, keine Listen-Zuweisung. Die Organisation bleibt im wöchentlichen Karakeep-Batch. Stirbt Apify oder Scrapfly, funktioniert der manuelle Screenshot-Weg unverändert weiter; der Dienst ist bewusst degradierbar.

Eingefügte URLs werden nach Domain aufgeteilt: LinkedIn läuft über die Apify-Pipeline (Volltext und Originalbilder), alle anderen Quellen über Scrapfly (og-Metadaten und ein Consent-Wall-freies HTML-Archiv). Beide Pfade schreiben das Ergebnis über die Karakeep-API, die intern via Consul aufgelöst wird.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

UI: "Paste-Seite\n(URL-Eingabe)" { class: node }

Ingest: "karakeep-ingest\n(Hono-BFF + In-Prozess-Queue)" {
  style.stroke-dash: 4
  LI: "LinkedIn-Pfad\n(Apify)" { class: node }
  WEB: "Web-Pfad\n(Scrapfly)" { class: node }
}

Karakeep: "Karakeep\n(einziger Bestand)" { class: node }

UI -> Ingest.LI: "linkedin.com"
UI -> Ingest.WEB: "andere Quellen"
Ingest.LI -> Karakeep: "Volltext + Bilder"
Ingest.WEB -> Karakeep: "og-Meta + Archiv"
```

## Nutzungsregel

- LinkedIn-Post-URL: immer über den Ingest. Der Karakeep-eigene Crawler läuft in die Auth-Wall.
- Alle anderen Quellen: weiterhin Karakeep-nativ (Extension, Share-Sheet). Der Ingest ist der zweite Versuch, wenn die Karte ohne Bild bleibt oder das Archiv einen Consent-Banner zeigt.
- Backlog: die My-Items-Seite im eingeloggten Browser öffnen, URLs kopieren und als Block in die Paste-Seite einfügen.

Die Kosten sind gedeckelt: ein Tageslimit für Scrapfly-Requests und eine Bestätigungsschwelle bei grossen Batches (Details im Job und im Design). Karakeep bleibt der einzige Bestand -- der Ingest speichert nur seinen Betriebszustand.

::: info LinkedIn-Pfad hält Jobs bis Apify aktiv ist
Der Web-Pfad (Scrapfly) ist vollständig produktiv. Der LinkedIn-Pfad (Apify) ist im Dienst angelegt, aber noch nicht scharf geschaltet: eingereichte LinkedIn-URLs werden angenommen und bleiben mit dem Hinweis "wartet auf Apify-Pipeline" in der Warteschlange, bis das Apify-Token in Vault liegt und die Pipeline aktiviert wird. Das Job-Template zieht das Token dann automatisch nach.
:::

## Verwandte Seiten

- [Karakeep](../karakeep/index.md) -- Bookmark-Manager und einziger Bestand, in den der Ingest schreibt
- [Traefik Referenz](../traefik/referenz.md) -- Middleware-Kette `intern-api@file`
- [Linstor CSI](../linstor-storage/index.md) -- replizierter Block-Storage (DRBD) für die Job-DB
- [Monitoring: Coverage](../monitoring/coverage.md) -- Kuma-Probe `Karakeep Ingest` und Coverage-Status
