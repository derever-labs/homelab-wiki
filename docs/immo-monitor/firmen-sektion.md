---
title: Firmen- und Personen-Sektion
description: Datenmodell und Funktionsweise der /firmen und /personen Routes im Immo Monitor
tags:
  - service
  - immobilien
  - sveltekit
  - datenmodell
---

# Firmen- und Personen-Sektion

Erweiterung des Immo Monitors (April 2026) um eine eigenständige Sektion für beteiligte Firmen und Personen, bidirektional mit Projekten verknüpft. Hintergrund war die Tiefenrecherche zum Furter-Areal in Dottikon, bei der sich zeigte, dass die textuellen `developer`/`architect`/`general_contractor`-Felder nicht reichen: Eine Firma hat mehrere Projekte, eine Person hat mehrere Firmen, und die Netzwerk-Analyse (wer sitzt mit wem im VR) ist der eigentliche Wert.

## Warum eine neue Sektion

Die ursprüngliche `project`-Tabelle hatte pro Projekt drei Freitextfelder `developer`, `architect`, `general_contractor`. Das ist einfach, skaliert aber nicht:

- Eine Firma wie `ffbk Architekten AG` taucht in mehreren Projekten auf und würde als Text mehrfach mit Tippfehlern existieren.
- Eine Person wie Alexander Furter Renold ist **gleichzeitig Partner bei ffbk und VR-Präsident bei Furter Immotrade** — die Verflechtung ist die eigentliche Recherche-Aussage, nicht eine Randnotiz.
- Schäfer Holzbautechnik AG ist Holzbauer auf allen Furter-Projekten, hat aber auch eigene Projekte (Museum Setz, Fussgängerbrücke Dottikon, Kita la maison).

Mit einer `company`- und `person`-Entität lassen sich diese Beziehungen sauber abbilden und auf einer eigenen Detailseite visualisieren.

## Datenmodell

Sieben neue Tabellen ergänzen das Schema von `src/lib/server/db/schema.ts`:

- **`company`** — Stammdaten einer Firma (Name, Slug, UID, Kategorie, Adresse, Gründungsjahr, optionale `parent_company_id`). Die `category` ist ein Freitextfeld mit kuratierter Liste in `src/lib/constants/roles.ts`.
- **`company_source`** — Quellen-URLs pro Firma (Moneyhouse, Zefix, eigene Website, Presse).
- **`person`** — Personen mit Namen, Slug, Beschreibung. Keine privaten Daten wie Geburtsdatum oder Wohnadresse — nur Handelsregister-Öffentlichkeit.
- **`person_company`** — Rolle einer Person in einer Firma mit optionalem Zeitraum (`start_year`, `end_year`, `active`). Beispiel: `alexander-furter-renold` → `ffbk-architekten-ag` als `partner` seit 2021.
- **`project_company`** — Rolle einer Firma in einem Projekt. Beispiel: `ffbk-architekten-ag` → project 35 als `architect`, `schaefer-holzbautechnik-ag` → project 55 als `holzbau`.
- **`project_person`** — Direkte Personen-Referenz pro Projekt (falls die Person nicht über eine Firma im Projekt steckt).
- **`project_photo`** — Projekt-Fotos ohne Umweg über `listing_photo`, kategorisiert nach `etappe`, `typologie`, `category` (exterior, interior, floorplan, site, rendering, historical). Wird vom Downloader-Script parallel zur DB-Migration befüllt.

Zusätzlich bekommt `project` ein Feld `estimated_total_cost_chf` für Bausummen-Recherche.

::: info Freitext mit Konstanten-Liste
Die Felder `company.category`, `person_company.role` und `project_company.role` sind `text`-Felder, aber mit einer kuratierten Wertetabelle in `src/lib/constants/roles.ts` hinterlegt. Neue Werte können ohne Migration hinzugefügt werden. Unbekannte Werte werden mit einem Default-Badge gerendert, damit sie im UI sichtbar bleiben.
:::

## Routes

### `/firmen` — Grid mit Kategorie-Filter

Lädt alle Firmen mit aggregierter Projekt- und Personen-Zahl. Sort-Reihenfolge: Firmen mit den meisten Projekten zuerst. Die Filter-Chips oben sind dynamisch aus den verwendeten `category`-Werten generiert und werden wie Kategorie-Badges eingefärbt.

### `/firmen/[id]` — Firmen-Detail

Zeigt Steckbrief (Sidebar rechts), Beschreibung, Research-Notizen, Projekte gruppiert nach Rolle, Personen mit ihren Rollen und Zeiträumen, Quellen. Für die zentralen Firmen (`furter-immotrade-ag`, `schaefer-holzbautechnik-ag`, `schaefer-generalunternehmung-ag`) wird zusätzlich ein D2-Diagramm eingeblendet, das die Verflechtung visualisiert.

### `/personen` und `/personen/[id]`

Analoge Struktur für Personen. Die Detail-Seite zeigt alle Mandate (Firmen + Rollen, aktive zuerst) und direkt verknüpfte Projekte.

### `/projekte/[id]` — Beteiligte-Sektion

Die existierende Projekt-Detail-Seite wurde um eine "Beteiligte"-Box zwischen Header und Unit-Tabelle erweitert. Firmen sind nach Rolle gruppiert und verlinken auf `/firmen/[id]`, Personen auf `/personen/[id]`. Die textuellen Fallback-Felder `project.developer` etc. bleiben im Sidebar-Steckbrief erhalten, falls ein Projekt noch keine Relation hat.

## D2-Diagramme

Fünf D2-Diagramme in `src/lib/diagrams/` werden statisch zur SVG gerendert und liegen in `static/diagrams/`:

- **`furter-netzwerk.d2`** — Die komplette Furter-/ffbk-Gruppe mit Baar-Cluster, verbindenden Personen und Revisoren.
- **`schaefer-netzwerk.d2`** — Schäfer-Gruppe (Holzbautechnik + Generalunternehmung + Zimmerei Aarau) mit VR und Geschäftsleitung.
- **`furter-schaefer-verflechtung.d2`** — Der zentrale Graph zur Frage "Wie hängen Schäfer und Furter zusammen?". Schlüsselaussagen: Furter Immotrade ist Grundeigentümerin, Schäfer ist Mieter und bevorzugter Holzbauer, Auslöser war die Übergabe von Severin Furter 2013 (gesundheitliche Gründe), 2015 Umfirmierung Furter Systembau → Schäfer Generalunternehmung (selbe UID CHE-109.389.986).
- **`furter-timeline.d2`** — Zeitstrahl 1905–2026 mit den vier Generationen Emil, Josef, Severin, Alexander und den wichtigsten Firmengründungen/Umfirmierungen.
- **`furter-holzpark-etappen.d2`** — Etappen-Übersicht der Wohnsiedlung Im Holzpark (Gebäude A/B/C/D + Silo + Etappe 4 MFH).

Rendering via d2 CLI lokal (`brew install d2`):

::: tip Build-Script
Das Script `scripts/build-diagrams.sh` im Immo-Monitor-Repo rendert alle .d2-Files aus `src/lib/diagrams/` nach `static/diagrams/`. Alternativ direkt pro Datei mit `d2 --theme 1 src/lib/diagrams/<name>.d2 static/diagrams/<name>.svg`.
:::

Die SVGs werden als statische Assets via `<img src="/diagrams/..."/>` eingebunden. Das vermeidet Client-side-Rendering und zusätzliche Laufzeit-Abhängigkeiten.

## Seeds und Research-Scripts

Die Seed-Scripts liegen unter `scripts/seed/` und werden mit `node scripts/seed/<name>.mjs` ausgeführt. Sie sind idempotent (`ON CONFLICT DO UPDATE`):

- **`furter-areal.mjs`** — Basisfirmen + Personen + person_company/project_company-Links.
- **`furter-enrich.mjs`** — Minergie + Stammbaum + 40 Units für Etappe 1-3 aus Wayback-Recherche.
- **`furter-projects.mjs`** — 6 weitere Furter-Projekte + Sommerpark Villmergen + Cleanup von project 57.
- **`furter-photos.mjs`** — Photo-Migration in `project_photo` (31 URLs).
- **`download-project-photos.mjs`** — HTTP-Downloader mit Wayback-Fallback, schreibt in `$PHOTOS_DIR`.

Der Research-Scraper `scripts/research/scrape.ts` nutzt Playwright mit Browser-User-Agent (Chrome 131 Mac). Er ersetzt die klassische Kombination curl+grep für JS-gerenderte Seiten wie ffbk.ch oder archive.org.

::: warning Drizzle-Kit Permission-Workaround
Das Repo liegt in `/Users/Shared/git/github/PRIVAT/immo-monitor`. In einigen Nutzerkontexten sind die `node_modules/*`-Binaries nicht ausführbar, weil sie einem anderen User gehören. Der Schema-Push läuft deshalb als direktes SQL via `scripts/research/apply-firmen-schema.mjs` statt `npm run db:push`. Für den normalen Dev-Workflow bleibt `drizzle-kit push` aber die empfohlene Variante.
:::

## Aktueller Datenstand (2026-04-14)

- 38 Firmen (ffbk/Schäfer/Furter/Baar-Cluster/Ingenieure/Lieferanten)
- 18 Personen inkl. historischer Generationen (Emil/Josef/Severin Furter)
- 48 `person_company`-Verknüpfungen
- 30+ `project_company`-Verknüpfungen
- 62 Projekte total, 9 davon Furter-Areal-nah
- 197 Units (40 für Im Holzpark Etappe 1-3 aus Wayback 2019, 9 für Etappe 4)
- 31 `project_photo`-Einträge, alle heruntergeladen und auf NFS deployed

## Verwandte Seiten

- [Immo Monitor](index.md) — Basis-Architektur
- [Immobilien-Monitoring](../immobilien-monitoring/index.md) — Scraper und Datenbank-Schema
