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

Bedienung, Daily Digest, Dialog-Mechanik und Persistenz stehen im [Todo Ingest Betrieb](./betrieb.md); die iPhone-Einrichtung wird dort auf Zweck und Verweis auf die Service-Repo-Doku gekürzt.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [todo.ackermannprivat.ch](https://todo.ackermannprivat.ch) (API, öffentlich via Traefik) |
| Web-Inbox | [inbox.ackermannprivat.ch](https://inbox.ackermannprivat.ch) (hinter Authentik, Gruppe `admin`) |
| Daily Digest | [inbox.ackermannprivat.ch/digest](https://inbox.ackermannprivat.ch/digest) (Morgen-Automation + on-demand) |
| Deployment | Nomad Job `tools/todo-ingest.nomad`, Image aus [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) |
| Storage | Linstor CSI: `todo-ingest-data` (SQLite, Betriebszustand) |
| Auth | API: Bearer-Token im Service (kein Authentik); Inbox: Authentik-ForwardAuth plus HMAC-Aktions-Tokens |
| Secrets | Vault `kv/todo-ingest` |

## Rolle im Stack

Todo Ingest ist die Erfassungs-Schicht zwischen iPhone-Diktat und ClickUp. Der zentrale Entwurfsentscheid ist die Entkopplung von Erfassung und Verarbeitung: Der Kurzbefehl setzt den POST ab und erhält sofort ein `202` zurück, während die eigentliche Verarbeitung im Dienst weiterläuft. Damit entfällt das iOS-Kurzbefehl-Timeout, an dem die frühere Lösung (Kurzbefehl wartet auf die fertige Antwort) scheiterte. Kein Diktat geht verloren, weil der Rohtext vor der Verarbeitung persistiert wird.

Das Werkzeug ist bewusst generisch: Es erfasst jede Art von Aufgabe (privat, HSLU, Alltag), nicht nur IT-Themen. Die Klassifikation entscheidet ausschliesslich über den Ziel-Workspace, nicht über die Art der Aufgabe.

```d2
classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Shortcut: "iOS-Kurzbefehl\n(Aktionstaste: Diktat\n+ kommende Termine)" { class: node }

Ingest: "todo-ingest (Hono)" {
  style.stroke-dash: 4
  DB: "SQLite\n(Persistenz vor\nVerarbeitung)" { shape: cylinder; class: node }
  CTX: "Kontext-Sammler" {
    class: node
    tooltip: "Offene Tasks beider Ziel-Listen, soeben angelegte Tasks (24h), offene Rückfragen (60 min) und mitgeschickte Termine -- als Daten deklariert (Injection-Härtung)"
  }
  AI: "Klassifikation\n(Claude, seriell)" { class: node }
  SWEEP: "Sweeper\n(15-min-Takt)" {
    class: node
    tooltip: "Blockierende Rückfragen laufen nach 4 h in die Privat-Liste (Tag zuordnung-unklar), anreichernde verfallen nach 7 Tagen still"
  }
}

ClickUp: "ClickUp\n(HSLU oder Privat)" { class: node }
Ntfy: "ntfy\n(Push aufs iPhone)" { class: node }
Inbox: "Web-Inbox (Browser)\ninbox.ackermannprivat.ch" {
  class: node
  tooltip: "Eigener Host, nur hinter Authentik (Gruppe admin). Zeigt offene Rückfragen, zuletzt erstellte Tasks und die Diktat-Historie. Antworten und Reprocess laufen über HMAC-signierte Aktionen, Text-Erfassung über dieselbe Pipeline wie das Diktat"
}

Shortcut -> Ingest.DB: "POST, 202 sofort" { style.stroke: "#2563eb" }
Ingest.DB -> Ingest.AI: "asynchron"
Ingest.CTX -> Ingest.AI: "Duplikat- und\nAntwort-Kontext"
Ingest.AI -> ClickUp: "neu anlegen / Kommentar /\nDuplikat überspringen" { style.stroke: "#16a34a" }
Ingest.AI -> Ntfy: "Bestätigung oder Rückfrage\n(bis 3 Buttons)" { style.stroke: "#16a34a" }
Ntfy -> Ingest: "Button-Tap: /api/resolve\n(HMAC pro Option)" { style.stroke: "#2563eb" }
Shortcut -> Ingest.DB: "Antwort per Diktat\n(60-min-Fenster)" { style.stroke: "#0891b2" }
Inbox -> Ingest: "via Authentik: antworten,\nreprocessen, erfassen" { style.stroke: "#0891b2" }
Ingest.SWEEP -> ClickUp: "Timeout blockierender Fragen"
```

## Verarbeitung (Dual-Mode)

Die Klassifikation läuft über Claude mit Structured Output hinter einer austauschbaren Provider-Schnittstelle (env `AI_PROVIDER`):

- **`subscription` (Default):** Die Claude Code CLI läuft headless als Subprozess im Image, authentifiziert über einen OAuth-Token aus `claude setup-token`. Dieser Modus nutzt die Claude-Subscription statt API-Credits.
- **`api` (Fallback):** Das Anthropic SDK ruft die Messages-API direkt; dieser Modus braucht einen Anthropic-API-Key.

Das Modell ist über die env `ANTHROPIC_MODEL` konfigurierbar und gilt für beide Modi. Das Original-Diktat wandert wörtlich in die Task-Beschreibung, damit ein Fehl-Parsing nachvollziehbar und korrigierbar bleibt.

::: info Warum der Subscription-Modus der Default ist
Der `subscription`-Modus zählt gegen die Subscription-Fenster statt gegen API-Credits und ist daher im Normalbetrieb der Default. Der `api`-Modus bleibt als Fallback, wenn kein OAuth-Token verfügbar ist oder die non-interaktive CLI-Nutzung künftig separat bepreist würde. Der Anthropic-API-Key ist deshalb optional und nur für den Fallback nötig.
:::

## Instanzen und Mandanten

Todo Ingest ist **nicht multi-tenant**. Statt mehrere Personen innerhalb einer Instanz zu trennen, läuft pro Person eine eigene Instanz -- ein eigener Nomad-Job mit eigener SQLite-Datenbank, eigenen Hosts, eigenen Secrets und eigenem ntfy-Topic. Geteilt wird allein das Claude-Abo, serverseitig also derselbe OAuth-Token. Der Grund für diesen Schnitt: Die Web-Inbox kennt kein User-Konzept -- die Datentrennung entsteht ausschliesslich durch getrennte Instanzen, nicht durch Rollen oder Konten innerhalb einer Instanz.

### Single-Workspace-Modus

Wie viele ClickUp-Ziel-Listen eine Instanz bedient, steuert ihr Verhalten bei der Zuordnung. Sind zwei Listen konfiguriert (wie bei Sam mit HSLU und Privat), läuft die unter [Zuordnung und Rückkanal](./betrieb.md#zuordnung-und-ruckkanal) beschriebene Klassifikation mit ihren HSLU/Privat-Rückfragen unverändert. Ist nur **eine** Ziel-Liste konfiguriert, schaltet der Dienst in den Single-Workspace-Modus: Die Workspace-Klassifikation entfällt vollständig, es gibt keine HSLU/Privat-Rückfragen und kein Claude-Label -- jeder Task geht direkt in die eine Liste. Der Modus ergibt sich allein aus der Zahl der konfigurierten Ziel-Listen (Ableitung `deriveSingleWorkspace` in `src/config.ts` des Service-Repos).

### Instanz Sam und Instanz Dani

- **Sam** (in Betrieb): Hosts [todo.ackermannprivat.ch](https://todo.ackermannprivat.ch) (API/Kurzbefehl, Bearer) und [inbox.ackermannprivat.ch](https://inbox.ackermannprivat.ch) (Web-Inbox, Authentik). Dual-Workspace über die persönlichen Listen HSLU und Privat.
- **Dani** (in Betrieb): Hosts todo-dani.ackermannprivat.ch und inbox-dani.ackermannprivat.ch, Single-Workspace (nur Privat), eigenes ntfy-Topic. Deployment als Nomad-Job `tools/todo-dani.nomad` im nomad-jobs-Repo.

::: info Onboarding Dani
Die Instanz ist in Betrieb; auf Danis iPhone stehen noch der Diktat-Kurzbefehl und das ntfy-Topic-Abo aus (Verteilung über das geplante Kurzbefehl-Portal).
:::

## Exposition und Authentifizierung

Der externe Router steht bewusst **nicht** hinter der Authentik-ForwardAuth-Kette, sondern nutzt `public-noauth@file` (CrowdSec plus Security-Header) zusammen mit einer Rate-Limit-Middleware. Der Grund: Der iOS-Kurzbefehl kann keinen SSO-Login durchlaufen -- eine Authentik-Weiterleitung würde den fire-and-forget-POST brechen. Die Authentifizierung übernimmt stattdessen der Dienst selbst über einen Bearer-Token. Das ist eine bewusste Abweichung vom App-Standard, abgesichert durch Bearer-Token, CrowdSec und Rate-Limit. Ein interner Router mit `intern-noauth@file` deckt den Zugriff aus den internen Netzen ab; `/api/health` läuft über einen eigenen, hoch priorisierten no-auth-Router für den Kuma-Monitor. Details zu den Ketten: [Traefik Referenz](../edge/traefik/referenz.md).

Die **Web-Inbox** hat einen eigenen Host mit ausschliesslich Authentik-Routern (`public-auth@file` extern, `intern-auth@file` intern) und der Authentik-Applikation `todo-inbox` (Gruppe `admin`). Der Dienst bindet die Inbox-Routen zusätzlich an den Host (`INBOX_HOST`): Über die Bearer-Router von todo.ackermannprivat.ch sind sie nicht erreichbar. Jede Instanz bringt dabei ihren eigenen Inbox-Host mit -- weil die Authentik-Proxy-Provider pro Hostname greifen, gehört zu jedem weiteren Host eine eigene Applikation; die vorbereitete Instanz Dani nutzt inbox-dani.ackermannprivat.ch. Alle mutierenden Inbox-Aktionen tragen HMAC-Tokens (dieselbe Mechanik wie die ntfy-Buttons) plus einen exakten Origin-Check -- der Schutz hängt damit nicht am Cookie-Verhalten. Die Sicherheits-Herleitung inkl. adversarialem Challenge steht im Service-Repo (`docs/konzept.md`, Stufe 6).

::: warning ForwardAuth zeigt auf den dedizierten Outpost
Die Traefik-Middleware `authentik-forward-auth` spricht `authentik-proxy.service.consul:9010` an -- das ist der **dedizierte** Outpost `homelab-proxy`, nicht der Embedded Outpost des Authentik-Servers. Neue Proxy-Provider müssen diesem Outpost zugewiesen werden, sonst antwortet die Kette mit `400 no app for hostname`.
:::

::: warning Claude-CLI serialisiert und braucht Speicher-Reserve
Im Default-Modus ist die Klassifikation ein schwerer Node-Subprozess (Claude Code CLI). Der Dienst serialisiert die CLI-Läufe (maximal einer gleichzeitig), und das Memory-Limit des Nomad-Jobs ist auf diesen Subprozess ausgelegt. Zu knapp gesetzter Speicher führte zu OOM-Kills (die CLI beendet sich mit exit null). Das Limit im Job daher nicht unter den dort dokumentierten Wert senken.
:::

## Verwandte Seiten

- [Todo Ingest Betrieb](./betrieb.md) -- Bedienung, Daily Digest, Dialog-Mechanik, Persistenz
- [ntfy](../ntfy/index.md) -- Push-Rückkanal für Bestätigungen und Zuordnungs-Rückfragen
- [Authentik](../edge/authentik/index.md) -- SSO vor der Web-Inbox (Applikation `todo-inbox`)
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware-Ketten `public-noauth@file` und `intern-noauth@file`
- [Linstor CSI](../storage/linstor/index.md) -- replizierter Block-Storage (DRBD) für die SQLite-Datenbank
- [Homelab App-Standard](../app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [Monitoring: Coverage](../monitoring/coverage/index.md) -- Kuma-Probe und Coverage-Status
- [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) -- Code und Design-Doku (`docs/konzept.md`)
