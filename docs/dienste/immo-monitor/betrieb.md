---
title: Immo Monitor Betrieb
description: Betriebs- und Schema-Konzept des Frontends -- Drizzle-Migration, Deploy-Gate und Datenbank
tags:
  - service
  - immobilien
  - betrieb
---

# Immo Monitor Betrieb

Betriebs- und Schema-Konzept des Frontends. Architektur, Statusmodell und Feature-Beschreibungen stehen im [Immo Monitor](./index.md), die Referenz-Details in [Referenz](./referenz.md).

## Schema und Deploy

Schemaänderungen laufen über den Drizzle-Migrationsverlauf: `schema.ts` anpassen, `npm run db:generate`, die erzeugte SQL prüfen, dann `npm run db:migrate`. `drizzle-kit push` wird bewusst nicht gegen die Produktionsdatenbank gefahren -- es protokolliert nichts und entfernt, was es nicht kennt; genau daraus sind frühere stille Schema-Drifts entstanden.

Vor dem Deploy greift ein CI-Gate: `lint` (prettier + eslint) und `check` (svelte-check) müssen grün sein, bevor der Nomad-Job neu ausgerollt wird.

## Datenbank

Die App nutzt die PostgreSQL-Datenbank `immo`, in der der DB-User `immo` volle Rechte hat. Verbindungsdaten, User und Vault-Pfad sind kanonisch in [Datenbanken](../../_referenz/datenbanken.md) hinterlegt.

## Verwandte Seiten

- [Immo Monitor](./index.md) -- Architektur, Statusmodell und Feature-Beschreibungen
- [Immo Monitor Referenz](./referenz.md) -- Statuswerte, Relationen-Datenmodell und Netzwerk-Diagramme
- [Datenbanken](../../_referenz/datenbanken.md) -- Verbindungsdaten, User und Vault-Pfad
