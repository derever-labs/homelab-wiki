---
title: Frühsignal-Pipeline
description: Zweite unabhängige Pipeline, die Neubauprojekte vor dem Inserat erkennt
tags:
  - service
  - scraping
  - nomad
---

# Frühsignal-Pipeline

Neben dem Inserate-Scraper läuft eine zweite, unabhängige Pipeline, die Neubauprojekte erkennt, **bevor** sie als Inserat auftauchen. Ein eigener Nomad-Job scannt täglich um 08:00 Uhr öffentliche Frühindikatoren und legt Treffer als Kandidaten ab; die Kandidaten-Inbox im [Immo-Monitor-Frontend](../immo-monitor/index.md) arbeitet sie manuell ab. Der Zeitpunkt liegt bewusst ausserhalb des Fensters, in dem sich die Vault-Templates der übrigen Batch-Jobs erneuern, damit der Job nicht mit deren Secret-Renewal kollidiert.

Die Datenpipeline für Inserate (Scraper, Enrichment, Foto-Download) beschreibt das [Immobilien-Monitoring](./index.md); die Referenz-Tabellen stehen in der [Immobilien-Monitoring Referenz](./referenz.md).

## Quellen

Der Kanton Aargau publiziert ordentliche Baugesuche nicht zentral (nur Sonderfälle wie Bauten ausserhalb der Bauzone), und die API von amtsblattportal.ch führt den Aargau nicht -- deshalb greift die Pipeline die 28 Zielgemeinden einzeln ab. Alle Quellen werden täglich in **einem** sequenziellen Lauf gepollt; RSS ist dabei nur das robusteste Format (stabile Item-IDs, Datum), wo es fehlt, parst ein Extraktor je CMS-Familie die Baugesuchs- bzw. Aktuelles-Seite. Die konkreten URLs und Belege je Quelle pflegt `src/fruehsignal/sources.ts` im Scraper.

| Abgriff | Gemeinden / Quellen | Status |
|---------|--------------------|--------|
| WordPress-RSS | Dottikon, Fischbach-Göslikon | aktiv |
| Medien-RSS | Wohler Anzeiger (Ortserkennung für alle 28 Gemeinden) | aktiv |
| HTML-Poll GOViS | Mellingen, Boniswil, Seon, Seengen, Waltenschwil, Widen, Künten | aktiv |
| HTML-Poll TYPO3 | Wohlenschwil | aktiv |
| HTML-Poll Drupal | Niederwil | aktiv |
| HTML-Poll ReNav | Dintikon, Hendschiken | aktiv |
| zurückgestellt (Hosting-Sperre i-web) | Villmergen, Wohlen, Bremgarten, Tägerig, Sarmenstorf, Uezwil, Hägglingen, Othmarsingen, Rupperswil, Berikon, Lenzburg | Folge-Phase |
| zurückgestellt (kein stabiler Anker) | Möriken-Wildegg, Mägenwil | bei Website-Umbau neu prüfen |
| kein maschineller Kanal | Ammerswil, Büttikon | dokumentierte Lücke |

Die elf i-web-Gemeinden teilen sich eine Hosting-Range, die auf gebündelte Abrufe mit einer Sperre reagiert -- ihre Anbindung folgt nach einer schonenden Markup-Analyse. Als Lehre daraus hält der Lauf Höflichkeits-Abstände ein (30 Sekunden zwischen Abrufen derselben Hosting-Range, keine automatischen Wiederholversuche). Bis dahin deckt der Wohler Anzeiger diese Gemeinden über die Ortserkennung mit ab.

Google News ist bewusst **keine** Quelle: Die robots.txt von news.google.com sperrt die Such-Feeds für generische Abrufe, und diese Regel wird nicht für eine bessere Abdeckung aufgeweicht.

::: info Fail-loud-Verhalten
Jede Quelle, die einen Fehler wirft oder verdächtig wenige Einträge liefert (Erkennung von Markup-Brüchen), meldet den Lauf als down an Kuma. Bei über einem Dutzend fremder Gemeinde-Websites sind gelegentliche Alarme ohne Handlungsbedarf einkalkuliert -- dafür fällt kein stiller Ausfall einer einzelnen Quelle mehr unter den Tisch.
:::

## Regel-Klassifikation (kein LLM)

Die Treffer werden **regelbasiert** eingeordnet, ohne Sprachmodell. Jeder Kandidat bekommt eine Klassifikation (`neubau`, `baugesuch`, `sonstiges`, `unklar`) und eine Konfidenz zwischen 0.00 und 1.00, die sich aus der gewichteten Zahl der Treffer-Signale ergibt. Die Inbox sortiert danach und zeigt Quelle, Klassifikation und Konfidenz pro Kandidat.

Die Kandidaten liegen in der Tabelle **`project_candidate`** (im Frontend-Schema via Drizzle-Migration verwaltet): Quelle und stabiler Quellen-Schlüssel, Titel, URL (unique), Veröffentlichungsdatum, Gemeinde, Textausschnitt, Klassifikation, Konfidenz, Status (`neu` / `gesichtet` / `verworfen` / `projekt_erstellt`) und eine optionale Referenz auf ein recherchiertes `project`. Aus einem Kandidaten wird **kein** Projekt automatisch angelegt -- die Neuanlage bleibt dem Research-Skill mit seinen Geocode- und Duplikat-Guards vorbehalten.

## Dead-Man-Monitoring

Der Job meldet nach jedem Lauf einen Heartbeat an einen Uptime-Kuma Push-Monitor. Bleibt der Push aus, schlägt Kuma Alarm -- ein stiller Ausfall der Pipeline fällt so auf.

::: info Vault-Cross-Job-Leseausnahme
Der Frühsignal-Job liest Secrets, deren Pfad nicht seinem eigenen Job-Namen entspricht. Weil die `nomad-workload`-Policy per Template auf den eigenen Job-Namen zugeschnitten ist, braucht dieser Cross-Job-Zugriff eine statische Leseausnahme in der Policy. Sie ist im `homelab-hashicorp-stack`-Repo gepflegt; hier nur der Hinweis, dass sie existiert.
:::

## Verwandte Seiten

- [Immobilien-Monitoring](./index.md) -- Inserate-Datenpipeline: Scraper, Enrichment, Foto-Download
- [Immobilien-Monitoring Referenz](./referenz.md) -- DB-Schema, Vault-Secrets und weitere Referenz-Tabellen
- [Immo-Monitor Frontend](../immo-monitor/index.md) -- Kandidaten-Inbox und Neubau-Recherche
