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

Shortcut: "iOS-Kurzbefehl\n(Aktionstaste: Diktat\n+ kommende Termine)" { class: node }

Ingest: "todo-ingest (Hono)" {
  style.stroke-dash: 4
  DB: "SQLite\n(Persistenz vor\nVerarbeitung)" { shape: cylinder; class: node }
  CTX: "Kontext-Sammler" {
    class: node
    tooltip: Offene Tasks beider Ziel-Listen, soeben angelegte Tasks (24h), offene Rueckfragen (60 min) und mitgeschickte Termine -- als Daten deklariert (Injection-Haertung)
  }
  AI: "Klassifikation\n(Claude, seriell,\neine nach der anderen)" { class: node }
  SWEEP: "Sweeper\n(15-min-Takt)" {
    class: node
    tooltip: Blockierende Rueckfragen laufen nach 4 h in die Privat-Liste (Tag zuordnung-unklar), anreichernde verfallen nach 7 Tagen still
  }
}

ClickUp: "ClickUp\n(HSLU oder Privat)" { class: node }
Ntfy: "ntfy\n(Push aufs iPhone)" { class: node }
Inbox: "Web-Inbox (Browser)\ninbox.ackermannprivat.ch" {
  class: node
  tooltip: Eigener Host, nur hinter Authentik (Gruppe admin). Zeigt offene Rueckfragen, zuletzt erstellte Tasks und die Diktat-Historie; Antworten und Reprocess laufen ueber HMAC-signierte Aktionen, Text-Erfassung ueber dieselbe Pipeline wie das Diktat
}

Shortcut -> Ingest.DB: "POST, 202 sofort" { style.stroke: "#2563eb" }
Ingest.DB -> Ingest.AI: "asynchron"
Ingest.CTX -> Ingest.AI: "Duplikat- und\nAntwort-Kontext"
Ingest.AI -> ClickUp: "neu anlegen / Kommentar /\nDuplikat ueberspringen" { style.stroke: "#16a34a" }
Ingest.AI -> Ntfy: "Bestaetigung oder Rueckfrage\n(bis 3 Buttons)" { style.stroke: "#16a34a" }
Ntfy -> Ingest: "Button-Tap: /api/resolve\n(HMAC pro Option)" { style.stroke: "#2563eb" }
Shortcut -> Ingest.DB: "Antwort per Diktat\n(60-min-Fenster)" { style.stroke: "#0891b2" }
Inbox -> Ingest: "via Authentik: antworten,\nreprocessen, erfassen" { style.stroke: "#0891b2" }
Ingest.SWEEP -> ClickUp: "Timeout blockierender Fragen"
```

## Bedienung

Der Dienst ist auf freihändiges Erfassen ausgelegt -- diktieren, loslassen, der Rest passiert asynchron:

- **Erfassen:** Aktionstaste drücken und drauflos diktieren. Mehrere To-dos in einem Diktat sind erwünscht, chaotische Reihenfolge und Füllwörter sind unkritisch -- der Dienst zerlegt, korrigiert offensichtliche Diktierfehler (auch Eigennamen) und klassifiziert. Je nach Kurzbefehl-Einstellung endet das Diktat bei einer Sprechpause oder per Tippen.
- **Bestätigungen:** Jede Verarbeitung meldet sich per Push -- "Erfasst", "Ergänzt bei" (Ergänzung als Kommentar an einem bestehenden Task), "Übersprungen (existiert)" (Duplikat, mit Kommentar am bestehenden Task) oder eine Fehlermeldung.
- **Rückfragen beantworten:** Drei gleichwertige Wege -- den Button in der Push antippen, innert einer Stunde erneut die Aktionstaste drücken und die Antwort diktieren ("die Sache mit Chris ist privat", "bis Ende nächster Woche"), oder die Web-Inbox öffnen. Jede angewandte Antwort wird quittiert. Ein Diktat ohne Bezug zu einer offenen Frage wird ganz normal als neues To-do behandelt.
- **Web-Inbox:** [inbox.ackermannprivat.ch](https://inbox.ackermannprivat.ch) (Login via Authentik) zeigt alle offenen Rückfragen mit Antwort-Buttons und einem Formular für eigene Werte (Bereich, Fälligkeit, Priorität), die zuletzt erstellten Tasks (Timeout-Anlagen markiert, Links nach ClickUp, Token-Verbrauch des Laufs) und die Diktat-Historie -- fehlgeschlagene Diktate lassen sich dort per Knopfdruck erneut verarbeiten, neue To-dos per Textfeld erfassen. Ein Tap auf eine Rückfrage-Push öffnet die Inbox direkt. Für schnellen Zugriff die Seite in Safari via "Zum Home-Bildschirm" ablegen.
- **Foto mitschicken:** Das Erfassen-Formular der Inbox nimmt zusätzlich ein Foto an (Kamera oder Mediathek). Das Modell liest das Bild, übernimmt task-relevante Fakten (Text, Fristen, Typenschilder) in Titel und Beschreibung und hängt das Foto als Attachment an den ClickUp-Task; ein Foto ohne Text ist erlaubt (der Auftrag ergibt sich aus dem Bild). Unter "Zuletzt erstellt" lässt sich ein Foto auch nachträglich an einen der aufgeführten Tasks hängen -- direkt, ohne Klassifikations-Lauf. Für ältere Tasks: Foto plus Text mit Task-Bezug erfassen, das läuft als Kommentar-Zuordnung.
- **Felder und Zuweisung:** Diktierte Teilschritte werden zur Checkliste, explizite Personen-Zuweisungen ("Michael soll ...") gehen an die dynamisch geladenen HSLU-Workspace-Member, Bezüge auf bestehende Tasks werden als Verknüpfung oder Abhängigkeit gesetzt (nur explizit Diktiertes direkt). Ohne andere Zuweisung gehört jeder Task Samuel. Jeder neue Task bekommt ein Fälligkeitsdatum -- diktiert oder klar ableitbar direkt, sonst fragt ein Push "Bis wann?" mit konkreten Datums-Buttons nach. Plausible Vermutungen (verwandter Task, naheliegender Termin) kommen immer als Vorschlags-Frage zum Absegnen, nie ungefragt.
- **Nachvollziehen und korrigieren:** Das wörtliche Diktat steht als Ground-Truth in jeder Task-Beschreibung (Abschnitt "Diktat"). Fehlklassifikationen lassen sich so erkennen und der Task direkt in ClickUp anpassen. Bereits abgelaufene (getimeoutete) Rückfragen sind in der Inbox nicht mehr beantwortbar -- der Task existiert dann schon und wird direkt in ClickUp korrigiert.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

shape: sequence_diagram

S: "Samuel"
P: "iPhone-Push (ntfy)"
T: "todo-ingest"

S -> T: "Aktionstaste: Diktat (+ Termine)"
T -> P: "Erfasst: Druckerpapier nachbestellen"
T -> P: "Frage: Bis wann? (3 Buttons)"
S -> T: "Button-Tap, Antwort-Diktat\nODER Web-Inbox"
T -> P: "Quittung: faellig 2026-07-17"
```

### Einrichtung auf dem iPhone

Der Kurzbefehl wird programmatisch erzeugt und signiert (Verfahren: `docs/konzept.md` im Service-Repo) und enthält das Diktat (Deutsch Schweiz), eine Zwischenablage-Sicherung gegen Netzfehler, die kommenden Termine aller iPhone-Kalender und den POST mit Bearer-Token. Nach dem Import:

- Aktionstaste in den iPhone-Einstellungen dem Kurzbefehl zuweisen.
- Einstellungen, Apps, Kurzbefehle, Erweitert: "Teilen grosser Datenmengen erlauben" aktivieren -- sonst fragt iOS bei jedem Lauf um Freigabe. Danach einmal "Immer erlauben" bestätigen.
- Im Kurzbefehl-Editor wählbar: Diktat-Stopp ("Bei Pause" für freihändig, "Bei Tippen" für lange Diktate) und welche Kalender die Termin-Aktion liest.

::: warning Freigaben nach Bearbeitung
Jede Bearbeitung des Kurzbefehls setzt die iOS-Freigaben zurück -- nach Änderungen fragt iOS die Berechtigungen (Netzwerk, Kalender, Diktat) einmalig neu ab.
:::

## Daily Digest

Der Dienst erstellt auf Abruf einen von Claude Opus formulierten Tagesüberblick: Headline zur Gesamtlage, "Heute zuerst" (Top-3), danach die vollständigen Sektionen Überfällig, Heute fällig, Diese Woche und Weitere offene, dazu die Termine von heute und morgen und der Systemstatus. Quellen sind die zwei persönlichen ClickUp-Listen (Kern), team-weit zugewiesene Tasks aller Workspaces (tiefer priorisiert, ausser dringend) und die vom Kurzbefehl mitgelieferten iPhone-Kalender. Ein Delta-Gedächtnis markiert "neu" und "seit N Tagen" überfällig. Am Wochenende gewichtet der Digest private Aufgaben vor HSLU.

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

Wecker: "Ladegeraet getrennt\n(iOS-Automation)" { class: node }
KB: "Kurzbefehl\nDaily Digest (Morgen)" {
  class: node
  tooltip: Liest die kommenden Termine aller iPhone-Kalender und schickt sie als Zeilen-Text mit; die Morgen-Variante laeuft nur 04:00-10:59, die manuelle Variante jederzeit (Home-Screen/Widget)
}
Svc: "todo-ingest" {
  class: node
  tooltip: Debounce 5 min, dann ClickUp-Erhebung (Listen + zugewiesene, Teilausfall toleriert), Opus formuliert Headline/Top-3/Item-Texte, der Server garantiert Vollstaendigkeit und baut alle Links deterministisch
}
Seite: "Digest-Seite\n(Inbox-Host, Authentik)" { class: node }
Push: "ntfy-Ping\nDigest bereit" { class: node }

Wecker -> KB: "sofort ausfuehren\n(nur 04:00-10:59)"
KB -> Svc: "POST /api/digest\n(Kalender, 202)" { style.stroke: "#2563eb" }
Svc -> Push: "fertig" { style.stroke: "#16a34a" }
Push -> Seite: "Tap oeffnet" { style.stroke: "#2563eb" }
KB -> Seite: "Safari-Open\n(nur manuelle Variante)" { style.stroke-dash: 4 }
```

- **Morgens:** das iPhone vom Ladegerät nehmen genügt. Als Wecker dient Sleep Cycle, dessen Alarm-Stopp iOS-Automationen nicht auslösen kann (der Trigger "Wecker wird gestoppt" feuert nur bei der nativen Uhr-App) -- darum ist das nächtliche Laden der Anker. Der Kurzbefehl "Daily Digest Morgen" schickt die Kalenderdaten mit, läuft nur zwischen 04:00 und 10:59 und öffnet kein Safari; der ntfy-Ping "Dein Daily Digest ist bereit" öffnet per Tap die fertige Seite. Mehrfaches Ab- und Anstecken fängt das Server-Debounce (5 min) ab.
- **Tagsüber:** den Kurzbefehl "Daily Digest" manuell starten (mit frischen Terminen, öffnet Safari) oder auf der Digest-Seite "Digest neu erstellen" antippen (nutzt die Termine des Morgens, Tages-Cache).
- **Kein Abstecken am Morgen (z.B. Wochenende unterwegs):** kein automatischer Digest, on-demand jederzeit möglich. Werktags ohne Digest bis 09:00 erinnert eine ntfy-Warnung daran, dass die Automation nicht gefeuert hat.
- **Inhalt:** Headline mit Gesamtlage, "Heute zuerst" (Top 3), danach die vollständigen Sektionen überfällig, heute fällig, diese Woche und weitere offene. Der Kurzbefehl liefert die Termine der nächsten sieben Tage mit: angezeigt werden heute und morgen, der ganze Horizont fliesst in die Lage-Einschätzung ein (etwa "die nächsten Tage sind dicht verplant"). Unter dem Digest stehen Dauer, Token-Verbrauch und das API-Kostenäquivalent des Laufs.

### Einrichtung der Morgen-Automation

Es gibt zwei signierte Kurzbefehl-Dateien: "Daily Digest" (manuell, mit Safari-Open) und "Daily Digest Morgen" (Automation, Zeitfenster 04:00-10:59, ohne Safari-Open). Beide enthalten den Bearer-Token und werden nach dem Import aus Downloads gelöscht. Die Automation selbst kann nicht als Datei importiert werden und wird einmalig von Hand angelegt:

1. Beide Kurzbefehle importieren, danach die Dateien löschen.
2. "Daily Digest" einmal manuell ausführen und die Freigaben (Kalender, Netzwerk) am entsperrten Gerät bestätigen.
3. "Daily Digest Morgen" einmal manuell ausführen -- wichtig: **innerhalb des Zeitfensters 04:00-10:59**, sonst läuft er leer durch und fragt keine Freigaben ab (Freigaben gelten pro Kurzbefehl). Ohne diesen Schritt blockiert der erste Automations-Lauf am gesperrten Gerät an den Freigabe-Dialogen.
4. Kurzbefehle-App, Tab "Automation", neue private Automation: Auslöser "Ladegerät", Option "Wird getrennt", dann den Kurzbefehl "Daily Digest Morgen" wählen und "Sofort ausführen" aktivieren (kein "Vor Ausführen bestätigen").
5. Abstecken ausserhalb des Zeitfensters (z.B. Nachladen am Schreibtisch) tut nichts -- das Zeitfenster steckt im Kurzbefehl, weil iOS-Automationen selbst keine Zeitbedingung kennen.

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

Bei unklarer Zuordnung schickt der Dienst einen ntfy-Push mit zwei Action-Buttons (HSLU / Privat). Der Button ruft `POST /api/resolve/:id` mit einem pro Vorgang und Option erzeugten HMAC-Token auf. Das Token ist einmalig verwendbar: Ein zweiter Klick quittiert mit `409`. Bleibt die Rückfrage 4 Stunden unbeantwortet, legt ein Sweeper (15-Minuten-Takt) den Task in der Privat-Liste ab und markiert ihn mit dem Tag `zuordnung-unklar`.

## Kontext, Rückfragen und Dialog

Seit dem Ausbau vom Juli 2026 klassifiziert der Dienst kontextbewusst (Design-Entscheide: `docs/konzept.md` im Service-Repo):

- **Duplikat-Erkennung:** Offene Tasks beider Ziel-Listen und soeben angelegte Tasks fliessen in jeden Klassifikationslauf ein. Ein erneut diktiertes To-do wird übersprungen und als Kommentar am bestehenden Task festgehalten, eine Ergänzung als Kommentar angehängt statt doppelt angelegt.
- **Namens-Plausibilisierung:** Eigennamen und Fachbegriffe werden gegen das Weltwissen des Modells geprüft und korrekt geschrieben; das wörtliche Diktat bleibt als Ground-Truth in der Task-Beschreibung.
- **Generische Rückfragen:** Fehlt eine entscheidende Eigenschaft, stellt der Dienst eine ntfy-Frage mit bis zu drei Buttons -- blockierend (Anlage wartet, 4 Stunden Timeout) oder nicht-blockierend (Task entsteht sofort, die Antwort reichert an und bleibt 7 Tage beantwortbar).
- **Dialog per Diktat:** Offene Rückfragen der letzten Stunde können mit einem neuen Diktat beantwortet werden ("bis Ende nächster Woche"); der Dienst quittiert jede angewandte Antwort per Push. Ohne klaren Bezug entsteht ein normaler neuer Task.
- **Kalender-Kontext (lazy):** Der Kurzbefehl kann kommende Termine mitschicken (`calendar` oder Zeilenformat `calendar_text`). Im Subscription-Modus gehen die Termine nicht in den Prompt, sondern als temporäre Datei mit gezielter Read-Freigabe -- das Modell liest sie nur bei Terminbezug im Diktat (Token-Ersparnis; API-Modus inline). Der Dienst nutzt sie ausschliesslich zur Auflösung relativer Datumsangaben und als Hinweis in der Beschreibung -- Termine sind nie Tasks, und die Kalenderdaten werden nach der Verarbeitung gelöscht. Kontextblöcke sind im Prompt als Daten deklariert (Injection-Härtung); Text in mitgeschickten Fotos gilt ebenfalls als Inhalt, nie als Anweisung.
- **Serielle Verarbeitung:** Es läuft genau eine Klassifikation gleichzeitig. Das schützt das Memory-Limit des Containers und garantiert, dass kurz nacheinander diktierte To-dos einander im Kontext sehen.

## Persistenz und Idempotenz

Der Betriebszustand liegt in einer SQLite-Datenbank auf dem replizierten Linstor-CSI-Volume `todo-ingest-data` (Rohtext, offene Rückfragen mit HMAC-Token und Deadline, angelegte Task-IDs). Ein Hash aus Diktattext und Zeitstempel dedupliziert die Anlage, sodass Kurzbefehl-Retries keine Duplikate erzeugen. Beim Start nimmt der Dienst unterbrochene Verarbeitungen aus der Datenbank wieder auf.

## Exposition und Authentifizierung

Der externe Router steht bewusst **nicht** hinter der Authentik-ForwardAuth-Kette, sondern nutzt `public-noauth@file` (CrowdSec plus Security-Header) zusammen mit einer Rate-Limit-Middleware. Der Grund: Der iOS-Kurzbefehl kann keinen SSO-Login durchlaufen -- eine Authentik-Weiterleitung würde den fire-and-forget-POST brechen. Die Authentifizierung übernimmt stattdessen der Dienst selbst über einen Bearer-Token. Das ist eine bewusste Abweichung vom App-Standard, abgesichert durch Bearer-Token, CrowdSec und Rate-Limit. Ein interner Router mit `intern-noauth@file` deckt den Zugriff aus den internen Netzen ab; `/api/health` läuft über einen eigenen, hoch priorisierten no-auth-Router für den Kuma-Monitor. Details zu den Ketten: [Traefik Referenz](../traefik/referenz.md).

Die **Web-Inbox** hat einen eigenen Host mit ausschliesslich Authentik-Routern (`public-auth@file` extern, `intern-auth@file` intern) und der Authentik-Applikation `todo-inbox` (Gruppe `admin`). Der Dienst bindet die Inbox-Routen zusätzlich an den Host (`INBOX_HOST`): Über die Bearer-Router von todo.ackermannprivat.ch sind sie nicht erreichbar. Alle mutierenden Inbox-Aktionen tragen HMAC-Tokens (dieselbe Mechanik wie die ntfy-Buttons) plus einen exakten Origin-Check -- der Schutz hängt damit nicht am Cookie-Verhalten. Die Sicherheits-Herleitung inkl. adversarialem Challenge steht im Service-Repo (`docs/konzept.md`, Stufe 6).

::: warning ForwardAuth zeigt auf den dedizierten Outpost
Die Traefik-Middleware `authentik-forward-auth` spricht `authentik-proxy.service.consul:9010` an -- das ist der **dedizierte** Outpost `homelab-proxy`, nicht der Embedded Outpost des Authentik-Servers. Neue Proxy-Provider müssen diesem Outpost zugewiesen werden, sonst antwortet die Kette mit `400 no app for hostname`.
:::

::: warning Claude-CLI serialisiert und braucht Speicher-Reserve
Im Default-Modus ist die Klassifikation ein schwerer Node-Subprozess (Claude Code CLI). Der Dienst serialisiert die CLI-Läufe (maximal einer gleichzeitig), und das Memory-Limit des Nomad-Jobs ist auf diesen Subprozess ausgelegt. Zu knapp gesetzter Speicher führte zu OOM-Kills (die CLI beendet sich mit exit null). Das Limit im Job daher nicht unter den dort dokumentierten Wert senken.
:::

## Verwandte Seiten

- [ntfy](../ntfy/index.md) -- Push-Rückkanal für Bestätigungen und Zuordnungs-Rückfragen
- [Authentik](../authentik/index.md) -- SSO vor der Web-Inbox (Applikation `todo-inbox`)
- [Traefik Referenz](../traefik/referenz.md) -- Middleware-Ketten `public-noauth@file` und `intern-noauth@file`
- [Linstor CSI](../linstor-storage/index.md) -- replizierter Block-Storage (DRBD) für die SQLite-Datenbank
- [Homelab App-Standard](../app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [Monitoring: Coverage](../monitoring/coverage.md) -- Kuma-Probe und Coverage-Status
- [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) -- Code und Design-Doku (`docs/konzept.md`)
