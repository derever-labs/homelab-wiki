---
title: Todo Ingest Betrieb
description: Bedienung, Dialog-Mechanik und Persistenz von Todo Ingest -- diktieren, Rückfragen beantworten, Daily Digest abrufen
tags:
  - service
  - productivity
  - nomad
  - clickup
---

# Todo Ingest Betrieb

Diese Seite beschreibt den Betrieb von [Todo Ingest](./index.md): wie diktiert und geantwortet wird, wie der Dienst jedes Diktat verarbeitet und wie der Betriebszustand persistiert wird. Rolle im Stack, Architektur, Dual-Mode und Exposition stehen in der [Übersicht](./index.md).

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

Die Erfassung hängt an einem signierten iOS-Kurzbefehl (Diktat Deutsch Schweiz, Zwischenablage-Sicherung gegen Netzfehler, kommende Termine aller iPhone-Kalender, POST mit Bearer-Token), der in den iPhone-Einstellungen der Aktionstaste zugewiesen wird. Im Kurzbefehl-Editor wählbar sind der Diktat-Stopp ("Bei Pause" für freihändig, "Bei Tippen" für lange Diktate) und die gelesenen Kalender. Ein einmaliges "Teilen grosser Datenmengen erlauben" in den Kurzbefehl-Einstellungen verhindert, dass iOS bei jedem Lauf eine Freigabe erfragt; jede spätere Bearbeitung des Kurzbefehls setzt die iOS-Freigaben (Netzwerk, Kalender, Diktat) allerdings zurück und löst die Abfrage einmalig neu aus. Der Kurzbefehl wird programmatisch erzeugt und signiert, enthält den Bearer-Token und wird nach dem Import gelöscht; das vollständige Einrichtungsverfahren steht in `docs/konzept.md` im [Service-Repo](https://github.com/derever-labs/todo-ingest).

## Daily Digest

Der Dienst erstellt auf Abruf einen geführten Tagesüberblick -- einen nummerierten Morgen-Flow statt einer flachen Aufgabenliste. Der Server erhebt und bucketet die Aufgaben deterministisch, ein Claude-Modell formuliert nur Headline, Top-3 und die einzelnen Item-Texte; Vollständigkeit, Zähler, Termine und Links garantiert der Server. Quellen sind die persönlichen ClickUp-Listen (Kern), team-weit zugewiesene Tasks der Workspaces (tiefer priorisiert, ausser dringend) und die vom Kurzbefehl mitgelieferten iPhone-Kalender; im [Single-Workspace-Modus](./index.md#single-workspace-modus) entfallen die HSLU-Quellen. Ein Delta-Gedächtnis markiert "neu" und die Überfälligkeits-Dauer. Am Wochenende gewichtet der Digest private Aufgaben vor HSLU.

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
### Aufbau der Digest-Seite

Die Seite führt in nummerierten Schritten durch den Morgen, statt alles Offene aufzulisten:

1. **Kopf:** Headline zur Gesamtlage und eine Momentum-Zeile aus echten Erledigt-Abfragen -- gestern erledigt, erledigt in den rollenden sieben Tagen, aktuell offen (heute fällig plus überfällig).
2. **Dein Tag:** Termine von heute und morgen sowie Geburtstage mit sieben Tagen Vorlauf. Der Kurzbefehl liefert die Termine der nächsten sieben Tage mit -- angezeigt werden heute und morgen, der ganze Horizont fliesst in die Lage-Einschätzung ein (etwa "die nächsten Tage sind dicht verplant").
3. **Heute zuerst:** die höchstens drei Aufgaben, die zuerst drankommen, als Karten mit Aktions-Buttons.
4. **Eine Entscheidung:** höchstens eine erzwungene Entscheidung (siehe [Anti-Tapete und Aktionen](#anti-tapete-und-aktionen)).
5. **Fokus:** ein Overlay, das die offenen Top-3 einzeln und gross zeigt -- eine Aufgabe aufs Mal.

Darunter steht ein aufklappbarer Ausblick (Rest von heute plus die Woche, mit denselben Aktionen) und eine ehrliche Zähler-Zeile für alles bewusst Ausgeblendete: überfällige, terminlose und tiefpriorisierte Aufgaben. Aufgaben mit tiefer Priorität erscheinen ausschliesslich als Zähler, nie als Karte oder Zeile. Ganz unten stehen Dauer, Token-Verbrauch und das API-Kostenäquivalent des Laufs sowie ein Verweis auf offene Rückfragen und fehlgeschlagene Diktate in der Inbox.

### Anti-Tapete und Aktionen

Damit der Digest nicht zur immer gleichen Tapete wird, zählt der Dienst pro Task, wie oft er prominent vorgeschlagen wurde -- höchstens einmal pro Kalendertag. Erreicht ein Task mit Priorität dringend oder hoch die Schwelle (`DIGEST_DECISION_MIN_SEEN`, Standard drei), ohne je angefasst worden zu sein, erzwingt der Digest genau eine Entscheidung: **Diese Woche erledigen** (Fälligkeit auf Freitag), **Umterminieren** (Fälligkeit plus zwei Wochen) oder **Streichen** (der Task wird mit Kommentar in ClickUp geschlossen).

Alle Karten in "Heute zuerst" und im Ausblick tragen zusätzlich die Aktionen **Erledigt**, **Auf morgen** und **Nächste Woche**. Jede Aktion läuft über `POST /digest/action`, abgesichert über ein HMAC-Token pro Task und Aktion (dieselbe Mechanik wie die ntfy-Buttons, siehe [Exposition und Authentifizierung](./index.md#exposition-und-authentifizierung)) plus einen Abgleich gegen den aktuell gerenderten Digest; das Workspace-Token bleibt serverseitig. Ausgeführte Aktionen erscheinen im Digest abgehakt statt als offene Aufgabe.

### Einrichtung der Morgen-Automation

Der Morgen-Digest hängt an zwei signierten Kurzbefehl-Dateien ("Daily Digest" manuell mit Safari-Open, "Daily Digest Morgen" als Automation im Zeitfenster 04:00-10:59, ohne Safari-Open; beide enthalten den Bearer-Token und werden nach dem Import gelöscht) und einer von Hand angelegten iOS-Automation (Auslöser "Ladegerät wird getrennt", "Sofort ausführen" ohne Bestätigung). Das Zeitfenster steckt im Kurzbefehl, weil iOS-Automationen selbst keine Zeitbedingung kennen. Wichtig bei der Ersteinrichtung: den Automations-Kurzbefehl einmal manuell **innerhalb des Zeitfensters** ausführen, sonst blockiert der erste Automations-Lauf am gesperrten Gerät an den Freigabe-Dialogen (iOS-Freigaben gelten pro Kurzbefehl). Das vollständige Einrichtungsverfahren steht in `docs/konzept.md` im [Service-Repo](https://github.com/derever-labs/todo-ingest).

## Verarbeitungs-Mechanismen im Detail

Dieser Abschnitt bündelt, was der Dienst bei jedem Diktat tut -- vom POST des Kurzbefehls bis zum fertigen ClickUp-Task. Er zeigt das Zusammenspiel auf einen Blick; die Einzelheiten stehen in den verlinkten Abschnitten.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  kontext: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

direction: right

Diktat: "Diktat\n(iOS-Kurzbefehl,\nBearer-POST)" { class: node }
Foto: "Foto (optional)\nNeu-Tab der Web-Inbox" { class: kontext }
Kontext: "Listen-Katalog +\nALLE offenen Tasks\ndes Workspace" {
  class: kontext
  tooltip: Nur die konfigurierten Ziel-Listen, als reine Daten -- Basis fuer Duplikat- und Verknuepfungs-Erkennung
}
Kalender: "Kalender-Termine" { class: kontext }

Modell: "Claude-Modell (Abo)\nzerlegt in Einzel-Tasks,\nkorrigiert Diktierfehler,\nklassifiziert" {
  class: node
  tooltip: Pro Task Workspace, Titel, Beschreibung und Faelligkeit, dazu Prioritaet nur bei diktierter Dringlichkeit, optional Startdatum, Aufwand, Zuweisung, Checkliste und Verknuepfungen
}

Entscheid: "Entscheid\npro Task" {
  class: node
  shape: diamond
}

Frage: "Rueckfrage\n(ntfy-Buttons oder\nWeb-Inbox)" {
  class: node
  tooltip: Blockierend wartet die Anlage (Timeout 4 h, dann Fallback-Anlage mit Hinweis), nicht-blockierend ist der Task sofort da und die Antwort reichert an (7 Tage)
}

ClickUp: "Task in ClickUp\n(HSLU oder Privat)" { class: node }
Duplikat: "Uebersprungen,\nKommentar am\nbestehenden Task" { class: node }

Diktat -> Modell: "asynchron,\nHash gegen Retries" { style.stroke: "#2563eb" }
Foto -> Modell: "Bild-Fakten" { style.stroke-dash: 4 }
Kontext -> Modell: "Duplikat-Abgleich"
Kalender -> Modell: "nur bei Terminbezug" { style.stroke-dash: 4 }
Modell -> Entscheid
Entscheid -> ClickUp: "neu anlegen (Standard)\noder Ergaenzung als Kommentar" { style.stroke: "#16a34a" }
Entscheid -> Duplikat: "eindeutiges\nDuplikat"
Entscheid -> Frage: "Angabe fehlt oder\nZuordnung unklar"
Frage -> ClickUp: "Antwort (HMAC-Token\nplus Origin-Check)" { style.stroke: "#2563eb" }
Frage -> ClickUp: "Timeout 4 h:\nFallback-Anlage" { style.stroke-dash: 4 }
```

Der Ablauf im Einzelnen:

1. **Eingang:** Der iOS-Kurzbefehl schickt das Diktat per POST mit Bearer-Token an den API-Host der Instanz (bei Sam todo.ackermannprivat.ch, bei Dani todo-dani). Optional kommt ein Foto über den Neu-Tab der Web-Inbox dazu ([Bedienung](#bedienung)).
2. **Zerlegen und korrigieren:** Ein Claude-Opus-Modell im Claude-Abo ([Subscription-Modus](./index.md#verarbeitung-dual-mode)) zerlegt das Transkript in einzelne, klar umrissene Tasks und korrigiert Diktierfehler sinngemäss.
3. **Klassifizieren pro Task:** Workspace-Zuordnung (bei Sam HSLU, Privat oder unklar, bei [Single-Workspace-Instanzen](./index.md#single-workspace-modus) fix), Titel, Beschreibung und Fälligkeit -- jeder neue Task bekommt eine, direkt oder per Rückfrage. Priorität nur bei diktierter Dringlichkeit, optional Startdatum, Aufwand, Zuweisung, Checkliste und Verknüpfungen.
4. **Kontext laden und Liste wählen (List-Routing):** Das Modell bekommt den Listen-Katalog des Workspace (alle Listen mit Pfad, Beschreibung aus ClickUp und Task-Zahl -- zur Laufzeit entdeckt, Änderungen an Listen wirken ohne Deployment) sowie **alle** offenen Tasks des Workspace als Daten, je Zeile mit Liste und zugewiesener Person. Es wählt pro Task die passende Ziel-Liste; der Dienst validiert die Wahl gegen den Katalog, Unklares landet in der Standard-Liste mit einer nicht-blockierenden Listen-Rückfrage. Duplikate und Verwandtes erkennt es damit über **alle** Listen hinweg, auch wenn der bestehende Task einer anderen Person zugewiesen ist ([Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)).
5. **Entscheiden pro Task:** neu anlegen (Standard), als Kommentar an einen bestehenden Task hängen (Ergänzung) oder überspringen (eindeutiges Duplikat).
6. **Rückfragen stellen:** blockierend (der Task entsteht erst nach der Antwort, etwa bei unklarer Zuordnung) oder nicht-blockierend (der Task ist sofort da, die Antwort reichert nur an, etwa eine fehlende Fälligkeit). Geantwortet wird per ntfy-Button oder in der Web-Inbox; alle verändernden Aktionen tragen HMAC-signierte Tokens plus einen exakten Origin-Check ([Exposition und Authentifizierung](./index.md#exposition-und-authentifizierung)). Timeouts: blockierend 4 Stunden (danach Fallback-Anlage mit Hinweis), nicht-blockierend 7 Tage (verfällt still).
7. **Kalender nur bei Bedarf:** Mitgeschickte Termine zieht das Modell nur bei erkennbarem Terminbezug heran -- das spart Verarbeitung ([Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)).
8. **Durchgehend beachtet:** Alle Kontext-Blöcke sind Daten, nie Anweisungen an das Modell (Schutz gegen eingeschleuste Befehle). Ein Hash aus Diktattext und Zeit verhindert Doppel-Anlagen bei Kurzbefehl-Retries, und unterbrochene Verarbeitungen werden beim Neustart fortgesetzt ([Persistenz und Idempotenz](#persistenz-und-idempotenz)).

::: warning Verbleibende Kontext-Grenzen
Der team-weite Kontext ist auf `CONTEXT_MAX_TASKS_PER_WORKSPACE` offene Tasks gedeckelt (fälligkeitsnahe zuerst, Kappung wird geloggt); per Env ausgeschlossene Listen (`CATALOG_EXCLUDE_LIST_IDS`) sind weder Routing-Ziel noch Duplikat-Kontext. `LIST_ROUTING=false` schaltet das Routing instanzweise auf das alte Ziel-Listen-Verhalten zurück.
:::

::: tip Kosten pro Diktat
Das Modell läuft im Claude-Abo -- pro Diktat fallen keine direkten Stückkosten an, nur Verbrauch im 5-Stunden-Abo-Fenster. Zur Grössenordnung (gemessener Richtwert, keine Abrechnung): Mit List-Routing über alle Listen (Katalog plus rund 700 offene Tasks beider Workspaces bei Sam) liegt der gemessene Prompt bei etwa 20'000 Eingabe-Tokens, im hypothetischen API-Betrieb rund 14 Rappen pro Diktat mit einem Opus-Modell und etwa die Hälfte mit einem Sonnet-Modell. Die Web-Inbox zeigt pro Task die tatsächliche Verarbeitungsdauer und einen Rappen-Richtpreis (aus dem Cache-Split).
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

## Verwandte Seiten

- [Todo Ingest Übersicht](./index.md) -- Rolle im Stack, Architektur, Dual-Mode, Instanzen, Exposition
- [ntfy](../ntfy/index.md) -- Push-Rückkanal für Bestätigungen und Zuordnungs-Rückfragen
- [Linstor CSI](../linstor-storage/index.md) -- replizierter Block-Storage (DRBD) für die SQLite-Datenbank
- [Monitoring: Coverage](../monitoring/coverage.md) -- Kuma-Probe und Coverage-Status
- [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) -- Code und Design-Doku (`docs/konzept.md`)
