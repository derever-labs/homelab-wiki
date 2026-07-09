---
title: Todo Ingest
description: To-dos per iPhone-Diktat erfassen -- asynchrone Verarbeitung mit Claude-Klassifikation und ClickUp-Anlage
tags:
  - service
  - productivity
  - nomad
  - clickup
---

# Todo Ingest

Todo Ingest nimmt diktierte To-dos vom iPhone entgegen und legt daraus die passenden ClickUp-Tasks an. Die Aktionstaste startet einen iOS-Kurzbefehl mit nativem Diktat, der den Text als fire-and-forget-POST an den Dienst schickt; die Verarbeitung (Zerlegung in einzelne Tasks, Klassifikation des Ziel-Workspace, Anlage in ClickUp) läuft asynchron. Der Dienst ist ein Node/TypeScript-Service (Hono) nach dem [Homelab-App-Standard](../app-standard/index.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [todo.ackermannprivat.ch](https://todo.ackermannprivat.ch) (öffentlich via Traefik) |
| Deployment | Nomad Job `tools/todo-ingest.nomad`, Image aus [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) |
| Storage | Linstor CSI: `todo-ingest-data` (SQLite, Betriebszustand) |
| Auth | Bearer-Token im Service (kein Authentik); extern `public-noauth@file` plus Rate-Limit, intern `intern-noauth@file` |
| Secrets | Vault `kv/todo-ingest` |

## Rolle im Stack

Todo Ingest ist die Erfassungs-Schicht zwischen iPhone-Diktat und ClickUp. Der zentrale Entwurfsentscheid ist die Entkopplung von Erfassung und Verarbeitung: Der Kurzbefehl setzt den POST ab und erhält sofort ein `202` zurück, während die eigentliche Verarbeitung im Dienst weiterläuft. Damit entfällt das iOS-Kurzbefehl-Timeout, an dem die frühere Lösung (Kurzbefehl wartet auf die fertige Antwort) scheiterte. Kein Diktat geht verloren, weil der Rohtext vor der Verarbeitung persistiert wird.

Das Werkzeug ist bewusst generisch: Es erfasst jede Art von Aufgabe (privat, HSLU, Alltag), nicht nur IT-Themen. Die Klassifikation entscheidet ausschliesslich über den Ziel-Workspace, nicht über die Art der Aufgabe.

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

Shortcut: "iOS-Kurzbefehl\n(Aktionstaste, natives Diktat)" { class: node }

Ingest: "todo-ingest\n(Hono, POST /api/dictate)" {
  style.stroke-dash: 4
  DB: "SQLite\n(Persistenz vor Verarbeitung)" { shape: cylinder; class: node }
  AI: "Klassifikation\n(Claude, Structured Output)" { class: node }
  SWEEP: "Sweeper\n(4h-Timeout, 15-min-Takt)" { class: node }
}

ClickUp: "ClickUp\n(HSLU oder Privat)" { class: node }
Ntfy: "ntfy\n(Bestaetigung, Rueckfrage)" { class: node }

Shortcut -> Ingest.DB: "202 sofort"
Ingest.DB -> Ingest.AI: "asynchron"
Ingest.AI -> ClickUp: "eindeutig"
Ingest.AI -> Ntfy: "unklar: HSLU oder Privat"
Ntfy -> Ingest: "Button: POST /api/resolve"
Ingest.SWEEP -> ClickUp: "Timeout: Privat, Tag zuordnung-unklar"
Ingest -> Ntfy: "Bestaetigung oder Fehler"
```

## Verarbeitung (Dual-Mode)

Die Klassifikation läuft über Claude mit Structured Output hinter einer austauschbaren Provider-Schnittstelle (env `AI_PROVIDER`):

- **`subscription` (Default):** Die Claude Code CLI läuft headless als Subprozess im Image, authentifiziert über einen OAuth-Token aus `claude setup-token`. Dieser Modus nutzt die Claude-Subscription statt API-Credits.
- **`api` (Fallback):** Das Anthropic SDK ruft die Messages-API direkt; dieser Modus braucht einen Anthropic-API-Key.

Das Modell ist über die env `ANTHROPIC_MODEL` konfigurierbar und gilt für beide Modi. Das Original-Diktat wandert wörtlich in die Task-Beschreibung, damit ein Fehl-Parsing nachvollziehbar und korrigierbar bleibt.

::: info Warum der Subscription-Modus der Default ist
Der `subscription`-Modus zählt gegen die Subscription-Fenster statt gegen API-Credits und ist daher im Normalbetrieb der Default. Der `api`-Modus bleibt als Fallback, wenn kein OAuth-Token verfügbar ist oder die non-interaktive CLI-Nutzung künftig separat bepreist würde. Der Anthropic-API-Key ist deshalb optional und nur für den Fallback nötig.
:::

## Zuordnung und Rückkanal

Eindeutig klassifizierte Tasks legt der Dienst direkt in der passenden persönlichen Liste an:

- **HSLU-Arbeits-Tasks:** persönliche Liste im Workspace Sam HSLU, immer mit dem Claude-Label (workspace-weites Pflichtfeld).
- **Alles Private:** persönliche Liste im Workspace Sam PRIVAT.

::: info Scharfe Workspace-Trennung
Privates gehört immer in den Privat-Workspace -- auch wenn es im Arbeitskontext diktiert wurde. Nur echte Arbeits-Tasks landen im HSLU-Workspace. Die Klassifikation trennt bewusst nach Kontext, nicht nach Diktat-Situation.
:::

Bei unklarer Zuordnung schickt der Dienst einen ntfy-Push mit zwei Action-Buttons (HSLU / Privat). Der Button ruft `POST /api/resolve/:id` mit einem pro Vorgang erzeugten HMAC-Token auf. Das Token ist einmalig verwendbar: Ein zweiter Klick quittiert mit `409`. Bleibt die Rückfrage 4 Stunden unbeantwortet, legt ein Sweeper (15-Minuten-Takt) den Task in der Privat-Liste ab und markiert ihn mit dem Tag `zuordnung-unklar`.

## Persistenz und Idempotenz

Der Betriebszustand liegt in einer SQLite-Datenbank auf dem replizierten Linstor-CSI-Volume `todo-ingest-data` (Rohtext, offene Rückfragen mit HMAC-Token und Deadline, angelegte Task-IDs). Ein Hash aus Diktattext und Zeitstempel dedupliziert die Anlage, sodass Kurzbefehl-Retries keine Duplikate erzeugen. Beim Start nimmt der Dienst unterbrochene Verarbeitungen aus der Datenbank wieder auf.

## Exposition und Authentifizierung

Der externe Router steht bewusst **nicht** hinter der Authentik-ForwardAuth-Kette, sondern nutzt `public-noauth@file` (CrowdSec plus Security-Header) zusammen mit einer Rate-Limit-Middleware. Der Grund: Der iOS-Kurzbefehl kann keinen SSO-Login durchlaufen -- eine Authentik-Weiterleitung würde den fire-and-forget-POST brechen. Die Authentifizierung übernimmt stattdessen der Dienst selbst über einen Bearer-Token. Das ist eine bewusste Abweichung vom App-Standard, abgesichert durch Bearer-Token, CrowdSec und Rate-Limit. Ein interner Router mit `intern-noauth@file` deckt den Zugriff aus den internen Netzen ab; `/api/health` läuft über einen eigenen, hoch priorisierten no-auth-Router für den Kuma-Monitor. Details zu den Ketten: [Traefik Referenz](../traefik/referenz.md).

::: warning Claude-CLI serialisiert und braucht Speicher-Reserve
Im Default-Modus ist die Klassifikation ein schwerer Node-Subprozess (Claude Code CLI). Der Dienst serialisiert die CLI-Läufe (maximal einer gleichzeitig), und das Memory-Limit des Nomad-Jobs ist auf diesen Subprozess ausgelegt. Zu knapp gesetzter Speicher führte zu OOM-Kills (die CLI beendet sich mit exit null). Das Limit im Job daher nicht unter den dort dokumentierten Wert senken.
:::

## Verwandte Seiten

- [ntfy](../ntfy/index.md) -- Push-Rückkanal für Bestätigungen und Zuordnungs-Rückfragen
- [Traefik Referenz](../traefik/referenz.md) -- Middleware-Ketten `public-noauth@file` und `intern-noauth@file`
- [Linstor CSI](../linstor-storage/index.md) -- replizierter Block-Storage (DRBD) für die SQLite-Datenbank
- [Homelab App-Standard](../app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [Monitoring: Coverage](../monitoring/coverage.md) -- Kuma-Probe und Coverage-Status
- [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) -- Code und Design-Doku (`docs/konzept.md`)
