---
title: Immo Monitor Referenz
description: Referenz-Details des Frontends -- Statuswerte, Relationen-Datenmodell und Buildkette der Netzwerk-Diagramme
tags:
  - service
  - immobilien
  - referenz
---

# Immo Monitor Referenz

Diese Seite bündelt die Referenz-Details des Frontends: die Statuswerte der Projekt- und Unit-Ebene, das Relationen-Datenmodell für Firmen und Personen sowie die Buildkette der Netzwerk-Diagramme. Architektur, Statusmodell und Feature-Beschreibungen stehen im [Immo Monitor](./index.md), das Betriebs- und Schema-Konzept in [Betrieb](./betrieb.md).

## Status-Werte

`project_unit.status`: `planned`, `available`, `reserved`, `rented`, `sold`.
`project.status`: `planning`, `construction`, `completed`, `established`.

## Relationen-Datenmodell

Sieben Tabellen in `src/lib/server/db/schema.ts` ergänzen das Listing-/Projekt-Schema:

- **`company`** -- Stammdaten einer Firma (Name, Slug, UID, Kategorie, Adresse, Gründungsjahr, optionale `parent_company_id`).
- **`company_source`** -- Quellen-URLs pro Firma (Moneyhouse, Zefix, eigene Website, Presse).
- **`person`** -- Personen mit Name, Slug, Beschreibung. Nur Handelsregister-Öffentlichkeit, keine privaten Daten.
- **`person_company`** -- Rolle einer Person in einer Firma mit optionalem Zeitraum.
- **`project_company`** -- Rolle einer Firma in einem Projekt.
- **`project_person`** -- direkte Personen-Referenz pro Projekt.
- **`project_photo`** -- Projekt-Fotos ohne Umweg über `listing_photo`, kategorisiert nach Etappe, Typologie und Kategorie.

::: info Freitext mit kuratierter Wertetabelle
`company.category`, `person_company.role` und `project_company.role` sind `text`-Felder mit einer kuratierten Wertetabelle in `src/lib/constants/roles.ts`. Neue Werte kommen ohne Migration hinzu; unbekannte Werte werden mit einem Default-Badge gerendert, damit sie im UI sichtbar bleiben. Die `value`-Schlüssel sind die in der DB gespeicherten Enum-Werte und dürfen nicht "korrigiert" werden -- sonst fallen alle Rollen stumm auf "Andere" zurück.
:::

## Netzwerk-Diagramme

Fünf D2-Diagramme in `src/lib/diagrams/` werden über `scripts/build-diagrams.sh` statisch zu SVG nach `static/diagrams/` gerendert und als Bild eingebunden -- das vermeidet Client-seitiges Rendering. Sie zeigen die Furter-/ffbk-Gruppe, die Schäfer-Gruppe, die Verflechtung zwischen beiden, einen Zeitstrahl über vier Generationen und die Etappen-Übersicht des Holzparks.

## Verwandte Seiten

- [Immo Monitor](./index.md) -- Architektur, Statusmodell und Feature-Beschreibungen
- [Immo Monitor Betrieb](./betrieb.md) -- Schema-Migration, Deploy-Gate und Datenbank
- [Immobilien-Monitoring Referenz](../immobilien-monitoring/referenz.md) -- Referenz-Tabellen der Datenpipeline
