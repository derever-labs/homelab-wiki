---
title: Todo Ingest Betrieb
description: Bedienung, Dialog-Mechanik und Persistenz von Todo Ingest -- diktieren, Rückfragen beantworten, Daily Digest lesen
tags:
  - service
  - productivity
  - nomad
  - clickup
---

# Todo Ingest Betrieb

Diese Seite beschreibt den Betrieb von [Todo Ingest](./index.md): wie diktiert und geantwortet wird, wie der Dienst jedes Diktat verarbeitet, wie der Betriebszustand persistiert wird und wie der Dienst seine eigene Pipeline überwacht. Rolle im Stack, Architektur, Dual-Mode und Exposition stehen in der [Übersicht](./index.md).

## Bedienung

Der Dienst ist auf freihändiges Erfassen ausgelegt -- diktieren, loslassen, der Rest passiert asynchron:

- **Erfassen:** Aktionstaste drücken und drauflos diktieren. Mehrere To-dos in einem Diktat sind erwünscht, chaotische Reihenfolge und Füllwörter sind unkritisch -- der Dienst zerlegt, korrigiert offensichtliche Diktierfehler (auch Eigennamen) und klassifiziert. Je nach Kurzbefehl-Einstellung endet das Diktat bei einer Sprechpause oder per Tippen.
- **Link mitgeben:** Ein Link im erfassten Text (diktiert oder über das Textfeld der Inbox) wird gelesen, und sein Inhalt fliesst in Titel, Beschreibung und Listen-Wahl ein -- die Aufgabe heisst dann nicht mehr "das anschauen". Bei LinkedIn und Instagram kommt zuerst die Eingangs-Quittung "Erfasst, Link wird gelesen", die Aufgabe entsteht mit dem Inhalt. Liess sich der Link nicht lesen, steht das mit Grund und URL in der Aufgabe. Jeder Link wird zusätzlich als Lesezeichen in Karakeep abgelegt. Mechanik: [Beilagen aus Links](#beilagen-aus-links).
- **Quittung (Pflicht):** Jede Verarbeitung endet mit genau einem Push. Der Titel beziffert beide Seiten -- "N Anliegen erkannt, M Aufgaben angelegt" --, darunter stehen die zutreffenden Blöcke: "Erfasst", "Angepasst" (Änderung an einem bestehenden Task, den das Diktat direkt ansprach), "Ergänzt bei" (Ergänzung als Kommentar an einem bestehenden Task), "Übersprungen (existiert)" (Duplikat, mit Kommentar am bestehenden Task), offene Rückfragen, verarbeitete Antworten und "Nicht ausgeführt" für gescheiterte Schritte. Ist nichts entstanden oder scheiterte ein Schritt, kommt die Quittung als Warnung mit erhöhter Priorität statt als stilles Erledigt. Damit melden sich zwölf vormals stumme Ausgänge, darunter die bei Duplikat oder blosser Kommentar-Ergänzung verworfene Rückfrage, der Neustart-Abbruch mitten in der Anlage, eine gescheiterte Button-Auflösung, nicht zugeordnete Antworten und verfallene nicht-blockierende Fragen.
- **Verdachts-Hinweis:** Unabhängig vom Modell schätzt eine deterministische Regel aus dem Rohtext, wie viele Anliegen darin stecken (Aufzählungs-Signale wie Konjunktionen, Kommas, Zeilenumbrüche und Listen-Marker). Vermutet sie mehr, als das Modell erkannt hat, hängt die Quittung "K Anliegen vermutet, M Aufgaben angelegt -- bitte prüfen" an. Bewusst ohne Selbstauskunft des Modells: Wer drei Anliegen als eines liest, meldet ebenso überzeugt eines von einem. Die Regel ist konservativ getunt, weil Fehlalarme hier teurer wären als eine verpasste Warnung.
- **Rückfragen beantworten:** Drei gleichwertige Wege -- den Button in der Push antippen, innert einer Stunde erneut die Aktionstaste drücken und die Antwort diktieren ("die Sache mit Chris ist privat", "bis Ende nächster Woche"), oder die Web-Inbox öffnen. Jede angewandte Antwort wird quittiert. Ein Diktat ohne Bezug zu einer offenen Frage wird ganz normal als neues To-do behandelt.
- **Web-Inbox:** [inbox.ackermannprivat.ch](https://inbox.ackermannprivat.ch) (Login via Authentik) zeigt alle offenen Rückfragen mit Antwort-Buttons, einem Freitext-Feld "Eigene Antwort" (Text oder Diktat, siehe [Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)) und dem aufklappbaren "Von Hand einstellen" für direkte Werte ohne AI-Lauf (Bereich, Fälligkeit, Priorität), die Aktivitäts-Historie "Zuletzt erstellt & angepasst" (erstellte und veränderte Tasks der letzten sieben Tage, aufgeklappt mit dem Wortlaut des zugehörigen Diktats direkt neben der erzeugten Aufgabe, Timeout-Anlagen markiert, Links nach ClickUp, Token-Verbrauch des Laufs) und die Diktat-Historie -- fehlgeschlagene Diktate lassen sich dort per Knopfdruck erneut verarbeiten, neue To-dos per Textfeld erfassen. Ein Tap auf eine Rückfrage-Push öffnet die Inbox direkt. Für schnellen Zugriff die Seite in Safari via "Zum Home-Bildschirm" ablegen.
- **Foto mitschicken:** Das Erfassen-Formular der Inbox nimmt zusätzlich ein Foto an (Kamera oder Mediathek). Das Modell liest das Bild, übernimmt task-relevante Fakten (Text, Fristen, Typenschilder) in Titel und Beschreibung und hängt das Foto als Attachment an den ClickUp-Task; ein Foto ohne Text ist erlaubt (der Auftrag ergibt sich aus dem Bild). Ein Foto an einen bereits erstellten Task nimmt die Task-Anpassung unter "Zuletzt erstellt & angepasst" entgegen (siehe nächster Punkt). Für ältere Tasks ausserhalb dieser Liste: Foto plus Text mit Task-Bezug erfassen, das läuft als Kommentar-Zuordnung. Landet ein Foto an keinem Task, hält die Quittung genau das fest ("Foto nicht ausgewertet -- Auswertung folgt in einer späteren Ausbaustufe"), und das Bild bleibt liegen, statt still zu verschwinden (siehe [Persistenz und Idempotenz](#persistenz-und-idempotenz)).
- **Task anpassen:** Jede Zeile unter "Zuletzt erstellt & angepasst" trägt ein Anpassungs-Formular -- ein Freitext-Feld (Text oder Diktat über das Tastatur-Mikrofon des iPhones) und die Aktion "Foto anhängen". Eine Anweisung wie "auf Freitag verschieben", "Priorität hoch", "erledigt" oder eine inhaltliche Ergänzung läuft als eigener kleiner AI-Lauf, der ausschliesslich die verlangten Felder ändert (Fälligkeit, Startdatum, Priorität, Aufwand, Zuweisung, Titel, Kommentar, Checklisten-Punkte oder Erledigt-Status). Ein mitgegebenes Foto wertet das Modell inhaltlich aus (aufgelistete Punkte werden Checklisten-Punkte, Fakten wie Preise oder Referenznummern ein Kommentar) und hängt es danach an den Task an. Ein Foto ohne Text genügt, dann ist das Bild der Auftrag. Anpassen geht nur an Tasks, die der Dienst selbst angelegt hat (die in "Zuletzt erstellt & angepasst" aufgeführten). Ein Listen-Wechsel läuft weiter über die Rückfragen, nicht über die Anpassung. Jede Anpassung wird per Push quittiert.
- **Felder und Zuweisung:** Diktierte Teilschritte werden zur Checkliste, explizite Personen-Zuweisungen ("Michael soll ...") gehen an die dynamisch geladenen HSLU-Workspace-Member, Bezüge auf bestehende Tasks werden als Verknüpfung oder Abhängigkeit gesetzt (nur explizit Diktiertes direkt). Ohne andere Zuweisung gehört jeder Task Samuel. Jeder neue Task bekommt ein Fälligkeitsdatum und eine Priorität. Das Fälligkeitsdatum setzt der Dienst direkt, wenn es diktiert oder klar ableitbar ist, sonst fragt ein Push "Bis wann soll das erledigt sein?" mit den Optionen Morgen, Nächste Woche und Kein Datum nach -- diese Frage stellt der Server notfalls von sich aus, damit keine Aufgabe unbemerkt ohne Termin liegen bleibt (siehe [Datum-Netz](#kontext-ruckfragen-und-dialog)). Die Priorität schätzt das Modell immer selbst -- dringend oder hoch nur bei echter Dringlichkeit, tief nur bei einem klaren nice-to-have, sonst normal -- und stellt dazu keine Rückfrage. Fehlt sie doch, setzt der Server normal. Plausible Vermutungen (verwandter Task, naheliegender Termin) kommen immer als Vorschlags-Frage zum Absegnen, nie ungefragt.
- **Nachvollziehen und korrigieren:** Das wörtliche Diktat steht als Ground-Truth in jeder Task-Beschreibung (Abschnitt "Diktat"). Fehlklassifikationen lassen sich so erkennen und der Task direkt in ClickUp anpassen. Bereits abgelaufene (getimeoutete) Rückfragen sind in der Inbox nicht mehr beantwortbar -- der Task existiert dann schon und wird direkt in ClickUp korrigiert.
- **Aktivitäts-Historie:** Die Inbox-Sektion "Zuletzt erstellt & angepasst" zeigt jede System-Veränderung der letzten sieben Tage als Zeile: neu erstellte Tasks, Anpassungen (Inbox-Formular wie Diktat-Steuerung), Digest-Button-Aktionen, beantwortete Rückfragen mit gesetzten Werten und Listen-Moves. Die Badges trennen die Herkunft: "neu" heisst über den Dienst erstellt, "neu" plus "angepasst" erstellt und danach nachjustiert, nur "angepasst" eine bestehende Aufgabe verändert. Reine Anpassungs-Zeilen sind eine Info-Zeile mit ClickUp-Link und bewusst ohne Anpassungs-Formular, denn das Anpassen bleibt auf selbst erstellte Tasks begrenzt. Quittungen zu Feld-Änderungen nennen den vorherigen Wert (etwa "Fälligkeit 24.07. → 20.07."). Festgehalten wird jede Veränderung an einer Aufgabe: auch die Ergänzung als Kommentar, das übersprungene Duplikat, ein angehängtes Foto sowie das Stellen und das Verfallen einer Rückfrage. Die Inbox zeigt pro Aufgabe den ganzen Verlauf statt nur der jüngsten Zeile. Rückfrage-Zeilen tragen dabei ihre eigene Herkunft und machen aus einer neu erstellten Aufgabe keine angepasste. Ein Listen-Wechsel hängt den Verlauf auf den neuen Task um, damit er nicht am aufgelösten alten hängen bleibt.

```d2
shape: sequence_diagram

S: "Samuel"
P: "iPhone-Push (ntfy)"
T: "todo-ingest"

S -> T: "Aktionstaste: Diktat (+ Termine)"
T -> P: "Frage: Bis wann? (3 Buttons)"
T -> P: "Quittung: 1 Anliegen erkannt,\n1 Aufgabe angelegt"
S -> T: "Button-Tap, Antwort-Diktat\nODER Web-Inbox"
T -> P: "Quittung: Fälligkeit gesetzt"
```

### Einrichtung auf dem iPhone

Die Erfassung hängt an einem signierten iOS-Kurzbefehl (Diktat Deutsch Schweiz, Zwischenablage-Sicherung gegen Netzfehler, Termine aller iPhone-Kalender im Fenster 14 Tage Vergangenheit bis 60 Tage Zukunft, POST mit Bearer-Token), der in den iPhone-Einstellungen der Aktionstaste zugewiesen wird. Im Kurzbefehl-Editor wählbar sind der Diktat-Stopp ("Bei Pause" für freihändig, "Bei Tippen" für lange Diktate) und die gelesenen Kalender. Ein einmaliges "Teilen grosser Datenmengen erlauben" in den Kurzbefehl-Einstellungen verhindert, dass iOS bei jedem Lauf eine Freigabe erfragt; jede spätere Bearbeitung des Kurzbefehls setzt die iOS-Freigaben (Netzwerk, Kalender, Diktat) allerdings zurück und löst die Abfrage einmalig neu aus. Der Kurzbefehl wird programmatisch erzeugt und signiert, enthält den Bearer-Token und wird nach dem Import gelöscht; das vollständige Einrichtungsverfahren steht in `docs/konzept.md` im [Service-Repo](https://github.com/derever-labs/todo-ingest).

## Daily Digest

Der Dienst erstellt zweimal täglich einen geführten Tagesüberblick -- einen nummerierten Flow statt einer flachen Aufgabenliste. Beide Läufe stösst der Server selbst an, und sie haben verschiedene Rollen: Der **Abend-Lauf um 21:30** ist die Arbeits-Ausgabe (was seit gestern erfasst wurde, was morgen fällig ist, der Rückstand, die Termine von morgen) und fixiert daraus die Top-3 für den nächsten Tag. Der **Morgen-Lauf um 06:30** ist die bewusst kurze Lese-Ausgabe: heutige Termine, heute fällig, die am Vorabend fixierten Top-3, unter einer Minute konsumierbar. Der Server erhebt und bucketet die Aufgaben deterministisch, ein Claude-Modell formuliert nur Headline, Top-3 und die einzelnen Item-Texte; Vollständigkeit, Zähler, Termine und Links garantiert der Server. Quellen sind die persönlichen ClickUp-Listen (Kern), team-weit zugewiesene Tasks der Workspaces (tiefer priorisiert, ausser dringend) und die iPhone-Termine aus der Kalender-Ereignis-Tabelle (siehe [Kalenderstand](#kalenderstand)); im [Single-Workspace-Modus](./index.md#single-workspace-modus) entfallen die HSLU-Quellen. Ein Delta-Gedächtnis markiert "neu" und die Überfälligkeits-Dauer. Am Wochenende gewichtet der Digest private Aufgaben vor HSLU.

Steht bei vollständig erhobenen Quellen keine einzige Aufgabe und kein einziger Termin an, verschickt der Dienst kein leeres Produkt: Der Digest wird dann ehrlich kurz benannt, protokolliert und ohne Push abgelegt. Der Guard greift bewusst nur bei vollständigen Quellen, denn ein Ausfall auf der ClickUp-Seite darf nie als "nichts zu tun" durchgehen.

```d2
classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Zeit: "Zeit-Auslöser im Server\n06:30 und 21:30" {
  class: node
  tooltip: "Im Sweeper-Takt geprüft. Pro Modus ein eigener Erfolgs-Check und ein eigener Tages-Zähler, damit ein Morgen-Lauf den Abend-Lauf nicht als erledigt abweist"
}
Svc: "todo-ingest" {
  class: node
  tooltip: "ClickUp-Erhebung (Listen + zugewiesene Tasks, Teilausfall toleriert) und Status-Abgleich der angezeigten Aufgaben. Das Modell formuliert Headline, Top-3 und Item-Texte, der Server garantiert Vollständigkeit und baut alle Links deterministisch"
}
Seite: "Digest-Seite\n(Inbox-Host, Authentik)" {
  class: node
  tooltip: "Dazu die Rückstands-Seite mit dem vollen Bestand und die Rückblick-Seite mit den Zahlen der letzten Tage -- beide ohne Modell-Lauf"
}
Push: "ntfy-Ping\nDigest bereit" {
  class: node
  tooltip: "Trägt die Top-3-Titel im Text und bis zu drei Knöpfe: erledigt und auf morgen für die erste Aufgabe plus Öffnen"
}

Zeit -> Svc: "Lauf je Modus" { style.stroke: "#2563eb" }
Svc -> Push: "fertig, mit Top-3-Titeln\nund Aktions-Knöpfen" { style.stroke: "#16a34a" }
Push -> Svc: "Knopf-Tap am\nöffentlichen Host (HMAC)" { style.stroke: "#2563eb" }
Push -> Seite: "Tap öffnet" { style.stroke: "#2563eb" }
Seite -> Svc: "Aktion, Freitext-Anpassung,\nDigest neu erstellen" { style.stroke: "#0891b2" }
```

**Belegt gegen** `src/digest.ts`, `src/digest-page.ts` und `src/ntfy.ts` im Service-Repo, Stand 30.07.2026.

- **Beide Läufe serverseitig:** Geprüft wird ein *erfolgreicher* Lauf des jeweiligen Modus, nicht bloss die Existenz eines Versuchs -- vorher galt schon ein am Zeitlimit gestorbener Lauf als vorhanden. Erfolgs-Prüfung, Tages-Zähler und reduzierter Wiederholungslauf laufen pro Modus getrennt (eigener Zähler-Schlüssel), sonst hätte ein eben fertiger Morgen-Lauf den Abend-Lauf als "schon erledigt" abgewiesen. Statt eines Tages-Riegels gilt ein Deckel von wenigen Läufen pro Tag (`DIGEST_DEADMAN_MAX_RUNS`), damit der 15-Minuten-Sweeper bei Dauerfehlern nicht die gemeinsame Verarbeitungs-Queue flutet. Jeder Lauf nach einem gescheiterten läuft bewusst reduziert und damit nie identisch zum Fehlschlag (siehe [Prompt-Deckel und Zeitlimit](#prompt-deckel-und-zeitlimit)). Jede Auslösung meldet sich per ntfy. Der Morgen-Lauf tritt dabei weiterhin als Nachholung auf ("Kein Digest bisher, starte selbst"), weil er ursprünglich als Fallback für den Kurzbefehl gebaut wurde, während der Abend-Lauf sich als regulärer Weg meldet.
- **Nicht mehr am iPhone ausgelöst:** Früher startete den Morgen-Digest eine iOS-Automation ("Ladegerät wird getrennt") über einen Kurzbefehl, den Abend-Digest ein eigener Abend-Kurzbefehl. Beide erreichten den Server seit dem 21.07.2026 nicht mehr, jeder Digest lief seither über den Server-Fallback -- darum ist der Server jetzt der reguläre Auslöser beider Läufe. Die Kurzbefehle bleiben bestehen (siehe [Kurzbefehle rund um den Digest](#kurzbefehle-rund-um-den-digest)), und der Kalenderstand kommt seither über den Diktat-Kurzbefehl (siehe [Kalenderstand](#kalenderstand)).
- **Auf Abruf:** "Digest neu erstellen" auf der Seite wiederholt den angezeigten Modus mit dem vorhandenen Kalenderstand.

### Erfassungs-Rückblick

Erster Inhalts-Schritt jedes Digests ist die Quittung über die eigene Erfassung: Der Morgen-Digest nennt unter "Über Nacht erfasst" jeden Eingang seit dem letzten *erfolgreichen* Abend-Lauf mit seinem Ausgang -- angelegt (mit Titeln), übersprungen, Frage offen, Fehler, noch in Arbeit, dazu die Anpassungs- und Antwort-Läufe. Der Abend-Digest zeigt dasselbe für den Tag ("Heute erfasst"). Für jemanden, der nachts diktiert, ist das der persönliche Nutzen des Morgen-Digests: Er ersetzt den Gang in die Inbox, um zu sehen, was aus den Diktaten wurde. Fenster-Beginn ist der letzte Abend-Lauf, ohne einen solchen 24 Stunden, nach unten begrenzt auf sieben Tage. Auch der leere Fall wird ausdrücklich gesagt ("Seit ... ist kein Diktat eingegangen") statt weggelassen.

### Kalenderstand

Der Dienst hat bewusst keinen eigenen Kalender-Zugriff, die Termine kommen ausschliesslich vom iPhone. Alle Kanäle speisen dieselbe Ereignis-Tabelle: der Diktat-Kurzbefehl bei jedem Aufruf mit seinem Fenster von 14 Tagen Vergangenheit bis 60 Tagen Zukunft, der Digest- und der Abend-Kurzbefehl mit den kommenden Terminen. Weil die beiden Digest-Kurzbefehle den Server seit dem 21.07.2026 nicht mehr erreichen, hält in der Praxis der Diktat-Kurzbefehl den Stand aktuell -- er läuft bei jedem Diktat. Jeder Eingang wird **zusammengeführt** statt überschrieben, dedupliziert über Startzeit, Titel und Kalendername, und hält fest, wann ein Termin erstmals und wann er letztmals gesehen wurde. Für die Anzeige und die Lage-Einschätzung liest der Digest daraus einen Horizont von sieben Tagen.

Das Zusammenführen ist der tragende Punkt: Ein Kurzbefehl liefert nur Termine ab seinem Aufrufzeitpunkt, ein Überschreiben um 10:00 hätte dem Tag also rückwirkend seine Morgen-Termine amputiert. Damit ein verschobener oder gelöschter Termin trotzdem nicht als Leiche stehen bleibt, gleicht ein Eingang genau den Bereich ab, den er nachweislich abdeckt: nur die mitgelieferten Kalender, nur Startzeiten zwischen der Eingangszeit und dem spätesten gelieferten Termin, nie rückwärts. Ein Eingang, den die Übertragungsgrenze abgeschnitten hat, führt darum nur zusammen und löscht nie. Vergangenes fällt nach `CALENDAR_KEEP_DAYS` weg. Beim Umstieg wurde der alte Schnappschuss einmalig in die Tabelle übernommen.

Einen Verfall des Kalenderstands gibt es nicht mehr. Die Digest-Seite nennt stattdessen immer, von wann der jüngste Stand ist ("Kalenderstand von Samstag 11.07. 12:30."), und warnt zusätzlich, wenn dieser Stand erst nach Mitternacht des dargestellten Tages entstand -- dann können frühe Termine dieses Tages fehlen. Vorher verfiel der Stand nach 24 Stunden, und die Seite zeigte danach eine leere Terminliste, als gäbe es keine Termine. Ein alter Stand mit Datum ist ehrlich, eine leere Liste war es nie.

### Aufbau der Digest-Seite

Die Seite führt in nummerierten Schritten durch den Tag, statt alles Offene aufzulisten:

1. **Kopf:** Headline zur Gesamtlage und eine Momentum-Zeile aus echten Erledigt-Abfragen -- gestern erledigt, erledigt in den rollenden sieben Tagen, aktuell offen (heute fällig plus überfällig).
2. **Über Nacht erfasst:** die Quittung über die eigenen Eingänge (siehe [Erfassungs-Rückblick](#erfassungs-ruckblick)), im Abend-Lauf als "Heute erfasst".
3. **Dein Tag:** Termine von heute und morgen sowie Geburtstage mit sieben Tagen Vorlauf, dazu der datierte Kalenderstand (siehe [Kalenderstand](#kalenderstand)). Angezeigt werden heute und morgen, der ganze Sieben-Tage-Horizont fliesst als Termindichte in die Lage-Einschätzung ein (etwa "die nächsten Tage sind dicht verplant").
4. **Heute zuerst:** die höchstens drei Aufgaben, die zuerst drankommen, als Karten mit Aktions-Buttons und Freitext-Feld.
5. **Eine Entscheidung:** höchstens eine erzwungene Entscheidung (siehe [Anti-Tapete und Aktionen](#anti-tapete-und-aktionen)).
6. **Ein Termin:** höchstens ein terminloser Task, den der Digest zur Wann-Entscheidung vorlegt (siehe [Anti-Tapete und Aktionen](#anti-tapete-und-aktionen)).
7. **Fokus:** ein Overlay, das die offenen Top-3 einzeln und gross zeigt -- eine Aufgabe aufs Mal.

Darunter stehen drei aufklappbare Sektionen mit denselben Aktionen -- Ausblick (Rest von heute plus die Woche), Rückstand und Ohne Termin (siehe [Rückstand und Status-Abgleich](#ruckstand-und-status-abgleich)) -- sowie eine ehrliche Zähler-Zeile für das bewusst Ausgeblendete: Aufgaben mit tiefer Priorität erscheinen ausschliesslich als Zähler, nie als Karte oder Zeile. Ganz unten stehen die Betriebs-Statuszeile, Dauer, der addierte Token-Verbrauch aller Läufe des Digests (Wiederholungen eingerechnet) und das API-Kostenäquivalent sowie ein Verweis auf offene Rückfragen und fehlgeschlagene Diktate in der Inbox.

Die **Betriebs-Statuszeile** am Seitenfuss fasst drei Angaben zusammen, die einzeln vorlagen, aber nirgends gemeinsam sichtbar waren: Erfolg der letzten sieben Läufe ("Letzte 7 Läufe: 5 ok, 2 Fehler"), Alter des Kalenderstands und ob der Aufgaben-Status frisch abgeglichen wurde. Ohne sie merkt man einen schleichenden Ausfall erst, wenn der Digest ganz ausbleibt.

### Rückstand und Status-Abgleich

Der Rückstand war früher nur eine Zahl: Ein einziger Deckel kappte Prompt *und* Render, gekappte Aufgaben fehlten damit im gespeicherten Digest und waren weder sichtbar noch per Knopf erreichbar. Prompt-Deckel und Render-Deckel sind jetzt getrennt (siehe [Prompt-Deckel und Zeitlimit](#prompt-deckel-und-zeitlimit)). Die Seite zeigt Rückstand und terminlose Aufgaben eingeklappt mit denselben Aktions-Buttons, gedeckelt auf `DIGEST_PAGE_SECTION_CAP` (25) pro Sektion. Die Sektions-Zähler tragen die Vollzahl, und alles darüber liegt einen Tap entfernt auf der Rückstands-Seite `/digest/rueckstand`. Diese zeigt den vollen Bestand aus dem Render des jüngsten fertigen Laufs mit denselben Aktionen -- ohne Modell-Lauf und ohne neue Quelle, weil ClickUp-Ad-hoc-Filter nicht stabil adressierbar sind. Daneben steht die Rückblick-Seite `/digest/rueckblick`: Diktate, angelegte Aufgaben, Fehler und offene Rückfragen der letzten Tage, die Erfolgs-Bilanz der Läufe, die in ClickUp erledigten Aufgaben und der vollständige Anpassungs-Verlauf -- reine Zahlen und Listen, bewusst ohne KI-Rückblick (teuerster Baustein ohne belegten Bedarf, und er hätte das Zeitlimit-Risiko des Digest-Laufs geerbt).

Damit die Seite kein Standbild des Lauf-Zeitpunkts bleibt, gleicht der Server beim Aufruf den Status der angezeigten Aufgaben mit ClickUp ab: eine gebatchte Abfrage der seit `DIGEST_RECONCILE_DAYS` erledigten Aufgaben (dieselben Quellen wie die Momentum-Zeile), kurz gecacht gegen Hammer-Reloads und gegen Doppelabfragen gebündelt. Erledigte erscheinen durchgestrichen statt mit Buttons. Kein Modell-Lauf. Der Abgleich darf die Seite nie blockieren: Er hat ein hartes Zeitfenster, bei Ausfall oder Langsamkeit rendert die Seite ohne ihn weiter, die überholte Abfrage füllt im Hintergrund den Cache, und die Statuszeile sagt dann "Aufgaben-Status nicht abgeglichen". Ohne ClickUp-Token gibt es keine Quelle und damit auch keinen Netz-Zugriff.

### Anti-Tapete und Aktionen

Damit der Digest nicht zur immer gleichen Tapete wird, zählt der Dienst pro Task, wie oft er prominent vorgeschlagen wurde -- höchstens einmal pro Kalendertag -- und zusätzlich, wie oft er weggeschoben wurde. Ein Aufschub (auf morgen, nächste Woche, umterminieren) lässt den Anzeige-Zähler stehen und zählt separat hoch, und nur eine Entscheidung (erledigt, gestrichen, tiefe Priorität, diese Woche) löscht den Eintrag. Vorher löschte *jede* Aktion den Zähler, eine Aufgabe liess sich also endlos wegschieben, ohne je zur Entscheidungs-Karte zu werden. Beide Zähler gehen gleichwertig in die Auswahl ein -- fünfmal weggeschoben wiegt schwerer als dreimal angezeigt -- und im Rückstand trägt eine oft aufgeschobene Aufgabe das als Badge. Erreicht ein Task mit Priorität dringend oder hoch die Schwelle (`DIGEST_DECISION_MIN_SEEN`, Standard drei), ohne je angefasst worden zu sein, erzwingt der Digest genau eine Entscheidung: **Diese Woche erledigen** (Fälligkeit auf Freitag), **Umterminieren** (Fälligkeit plus zwei Wochen) oder **Streichen** (der Task wird mit Kommentar in ClickUp geschlossen).

Nach der Entscheidungs-Karte legt der Digest zusätzlich genau einen terminlosen Task zur Wann-Entscheidung vor (Karte **Ein Termin**): **Diese Woche erledigen**, **Nächste Woche** oder **Kein Termin nötig**. "Kein Termin nötig" stuft den Task mit Kommentar auf tiefe Priorität und nimmt ihn damit aus dem Digest. Welcher terminlose Task erscheint, rotiert über denselben Anti-Tapeten-Zähler -- der am seltensten gezeigte ist an der Reihe, Top-3- und Entscheidungs-Tasks sind ausgenommen. So baut der Digest den Rückstand terminloser Tasks ab, statt Fälligkeiten zu raten.

Alle Karten und Zeilen der Seite tragen zusätzlich die Aktionen **Erledigt**, **Auf morgen** und **Nächste Woche**. Jede Aktion läuft über `POST /digest/action`, abgesichert über ein HMAC-Token (dieselbe Mechanik wie die ntfy-Buttons, siehe [Exposition und Authentifizierung](./index.md#exposition-und-authentifizierung)). Das Workspace-Token bleibt serverseitig.

Das Token bindet **Lauf, Task und Aktion**, und die Whitelist ist der Render genau dieses Laufs -- nicht der jüngste. Vorher scheiterte nach einer Aktualisierung jeder Klick auf einer noch offenen Seite, weil die Aktion gegen den neuen Lauf geprüft wurde. Die Abhak-Anzeige liest dafür auf Tagesbasis statt lauf-weise: Ein zweiter Lauf am selben Tag verlor sonst alle Haken. Ausgeführte Aktionen erscheinen im Digest abgehakt statt als offene Aufgabe, Mehrfach-Antippen ist idempotent.

### Rückweg in die Erfassung

Die prominenten Karten tragen neben den Buttons ein Freitext-Feld: Eine Anweisung wie "auf Freitag verschieben" oder eine inhaltliche Ergänzung geht von der Digest-Seite in denselben Anpassungs-Lauf, den die Inbox nutzt (siehe [Bedienung](#bedienung)), mit gesetztem Task-Bezug und per Tastatur-Mikrofon auch diktierbar. Whitelist und HMAC gelten wie bei den Aktions-Knöpfen, und die Rechte-Staffelung nach Umkehrbarkeit begrenzt, was eine Anweisung anfassen darf (siehe [Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)). Bewusst nur an den prominenten Karten und nicht an jeder Rückstands-Zeile, sonst stünden 50 Textfelder auf einer Seite.

### Push mit Top-3 und Aktions-Knöpfen

Der Fertig-Push nennt nicht mehr nur, dass ein Digest bereitliegt, sondern trägt die **Top-3-Titel** im Text -- am Sperrbildschirm entscheidet sich, ob die Seite überhaupt geöffnet wird. Dazu kommen bis zu drei ntfy-Actions: erledigt und auf morgen für die erste Aufgabe plus Öffnen. Diese Knopf-URLs zeigen auf `POST /api/digest/action` am **öffentlichen** Host, weil der Inbox-Host hinter Authentik liegt und für eine ntfy-Action nicht erreichbar ist. Auth ist wie bei `/api/resolve` das HMAC-Token, gebunden an Lauf, Task und Aktion. Der Knopf wirkt damit ausschliesslich auf Aufgaben im Render seines eigenen Laufs.

### Prompt-Deckel und Zeitlimit

Ein Digest-Lauf hat 180 Sekunden Zeit. Dass Läufe daran reihenweise starben, lag nicht am Limit, sondern am Prompt: Er verlangte für jede Aufgabe in jeder Sektion einen formulierten Satz, und die Sektionen waren ungekappt. Mit wachsendem Rückstand wuchs damit die Ausgabe -- bei 150 offenen Aufgaben 150 Sätze --, und der Effekt verstärkte sich selbst: Je mehr Digests am Limit starben, desto mehr Rückstand lag beim nächsten Lauf an.

Seither formuliert das Modell nur noch für die heute fälligen Aufgaben und für die Woche Sätze. Für Überfällig und Ohne-Termin liefert es allein die Reihenfolge als ID-Liste, die Titel setzt der Server ein -- an der Darstellung ändert das nichts. Zusätzlich hat jede Sektion einen Prompt-Deckel (`DIGEST_SECTION_CAP`, im reduzierten Wiederholungslauf `DIGEST_REDUCED_CAP`). Gekappt wird ausschliesslich der Prompt: Die Seite bleibt vollständig, weil der Server die nicht kuratierten Aufgaben mit ihrem Titel ergänzt. Ein Lauf, der zuvor am Zeitlimit starb, lief danach in gut 90 Sekunden durch. Das Zeitlimit selbst wurde bewusst nicht erhöht, das wäre Symptomkur gewesen.

Der Prompt-Deckel ist dabei nicht derselbe wie der Render-Deckel. Anfangs kappte ein einziger Wert beides, weshalb gekappte Aufgaben im gespeicherten Digest fehlten und damit unerreichbar waren. Erhoben wird jetzt vollständig, für das Modell wird ausgewählt, und ein eigener Render-Deckel (`DIGEST_RENDER_SECTION_CAP`) schützt allein die Grösse des gespeicherten Digests. Wie viel davon die Seite zeigt, entscheidet noch einmal getrennt der Seiten-Deckel (siehe [Rückstand und Status-Abgleich](#ruckstand-und-status-abgleich)).

### Kurzbefehle rund um den Digest

Die Digest-Läufe hängen nicht mehr an einem Kurzbefehl. Bestehen bleiben drei signierte Kurzbefehl-Dateien ("Daily Digest" manuell mit Safari-Open, "Daily Digest Morgen" für die iOS-Automation im Zeitfenster 04:00-10:59, dazu der Abend-Kurzbefehl, alle mit dem Bearer-Token darin und nach dem Import gelöscht) sowie die von Hand angelegte iOS-Automation "Ladegerät wird getrennt". Sie waren früher die Auslöser, erreichen den Server aber seit dem 21.07.2026 nicht mehr. Ihr Code-Pfad bleibt bewusst unangetastet statt entfernt. Das Zeitfenster steckt im Kurzbefehl, weil iOS-Automationen selbst keine Zeitbedingung kennen. Die iOS-Freigaben gelten pro Kurzbefehl, weshalb ein Automations-Kurzbefehl einmal manuell innerhalb seines Zeitfensters laufen muss, bevor er am gesperrten Gerät durchkommt. Das vollständige Verfahren steht in `docs/konzept.md` im [Service-Repo](https://github.com/derever-labs/todo-ingest).

::: info Kollisionsschutz mit den Kurzbefehlen
Käme ein Kurzbefehl je wieder durch, entsteht kein doppelter Digest: Sein `POST /api/digest` erzeugt einen regulären Lauf des betreffenden Modus, und der Zeit-Auslöser prüft genau darauf -- auf einen erfolgreichen Lauf dieses Modus am selben Tag -- und schweigt dann.
:::

### Abend-Lauf und Vorabend-Planung

Der Abend-Lauf rechnet die Buckets aus der Morgen-Perspektive und fixiert daraus die Top-3 für morgen. Der nächste Morgen-Lauf übernimmt diese fixierten Top-3 unverändert, bereits erledigte werden ersetzt. So steht die Marschrichtung schon am Vorabend fest, statt erst beim Aufwachen. Der Morgen-Digest benennt zudem, ob die Top-3 am Vorabend fixiert wurden oder er sie heute Morgen selbst gewählt hat (Abend-Lauf ausgefallen) -- eine Neuwahl sah vorher wie eine Fixierung aus.

Zusätzlich schlägt der Abend-Lauf bis zu drei Fokus-Zeitfenster für morgen vor (Blocker mit Start- und Endzeit). Weil der Dienst bewusst keinen Kalender-Zugriff hat, kann er sie nicht selbst eintragen: Der Plan-Endpoint `GET /api/digest/plan` liefert sie für einen manuellen Import in den iPhone-Kalender "Fokus" weiter, seit der Abend-Kurzbefehl den Server nicht mehr erreicht aber ohne automatischen Abholer.

Jeder Digest trägt seinen Lauf-Modus, und der Vergleichs-Schnappschuss hinter dem Marker "neu seit dem letzten Digest" wird pro Modus getrennt geführt -- Morgen vergleicht gegen Morgen, Abend gegen Abend. Ohne diese Trennung würde der tägliche Abend-Lauf dem Morgen-Marker nur noch die letzten neun Stunden messen. Beim allerersten Lauf eines Modus fehlt der Vorgänger-Schnappschuss, dann trägt keine Aufgabe den Marker "neu" -- einmalig und benannt statt geraten.

Die Digest-Seite rendert im Abend-Modus dieselben Schritte, aber aus der Morgen-Perspektive beschriftet: Kopf "Abend-Plan", "Morgen zuerst" statt "Heute zuerst" und eine Karte "Fokus-Blocker morgen". Die Entscheidungs- und die Termin-Karte bleiben Morgen-Rituale und erscheinen abends nicht. Der Anti-Tapeten-Zähler wird am Abend nicht hochgezählt.

### Digest-Widget (Scriptable)

Ein Scriptable-Widget zeigt die Kurzfassung des jüngsten erfolgreichen Digests direkt auf dem Home- und Lock-Screen: Headline, Top-3, die Zähler für heute und überfällig, die Momentum-Zeile und den nächsten Termin. Es liest den read-only-Endpoint `GET /api/digest/summary` mit dem Bearer-Token und überspringt dabei fehlgeschlagene Läufe. Das Widget-Script und seine Einrichtungs-Anleitung liegen im Service-Repo (`scripts/widget.js`, README). Den Zugangs-Token legt Scriptable beim ersten Lauf im eigenen Keychain ab.

Das Widget sagt, wie alt es ist: Neben dem Frischestempel liefert der Endpoint den neu gerechneten **Bezugstag**, denn die heute/morgen-Marken der Termine entstehen beim Rendern und nicht beim Lesen. Ein Abend-Plan von 21:30 ist am nächsten Morgen der heutige Tag, am Abend selbst der Plan für morgen, und ein zu alter Lauf wird als veraltet ausgewiesen statt Zahlen für heute zu behaupten. Die Formulierung des Stempels ist im Code SSOT, damit Seite und Widget nicht Verschiedenes sagen.

::: warning Lauf-Historie reicht bei zwei Läufen nur noch eine Woche
Die Aufbewahrung der Digest-Läufe ist eine Anzahl, keine Frist (`DIGEST_KEEP`, Standard 14). Mit einem Lauf pro Tag deckte das rund zwei Wochen ab, mit zwei Läufen pro Tag nur noch etwa eine Woche. Betroffen sind die rückschauenden Ansichten: die Erfolgs-Bilanz auf der Rückblick-Seite und die Statuszeile stützen sich auf diese Läufe.
:::

## Verarbeitungs-Mechanismen im Detail

Dieser Abschnitt bündelt, was der Dienst bei jedem Diktat tut -- vom POST des Kurzbefehls bis zum fertigen ClickUp-Task. Er zeigt das Zusammenspiel auf einen Blick; die Einzelheiten stehen in den verlinkten Abschnitten.

```d2
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
  tooltip: "Zur Laufzeit entdeckter Listen-Katalog des Workspace (ohne ausgeschlossene Listen) plus alle offenen Tasks, als reine Daten. Basis für List-Routing, Duplikat- und Verknüpfungs-Erkennung"
}
Kalender: "Kalender-Termine" { class: kontext }
Link: "Link-Inhalt\n(via kara-in)" {
  class: kontext
  tooltip: "Gekappter Seiteninhalt zum erfassten Link. Web und YouTube im selben Lauf, LinkedIn und Instagram geparkt. Nicht gelesen heisst Vermerk am Task, nie ein Abbruch"
}

Modell: "Claude-Modell (Abo)\nzerlegt in Einzel-Tasks,\nkorrigiert Diktierfehler,\nklassifiziert" {
  class: node
  tooltip: "Pro Task Workspace, Titel, Beschreibung und Fälligkeit, dazu immer eine geschätzte Priorität, optional Startdatum, Aufwand, Zuweisung, Checkliste und Verknüpfungen"
}

Entscheid: "Entscheid\npro Task" {
  class: node
  shape: diamond
}

Frage: "Rückfrage\n(ntfy-Buttons oder\nWeb-Inbox)" {
  class: node
  tooltip: "Blockierend wartet die Anlage (Timeout 4 h, dann Fallback-Anlage mit Hinweis), nicht-blockierend ist der Task sofort da und die Antwort reichert an (7 Tage). Fehlt nur die Fälligkeit, stellt der Server die Frage von sich aus"
}

ClickUp: "Task in ClickUp\n(HSLU oder Privat)" { class: node }
Duplikat: "Übersprungen,\nKommentar am\nbestehenden Task" { class: node }
Quittung: "ntfy-Quittung\n(Pflicht, mit Zahlen)" {
  class: node
  tooltip: "Genau eine pro Lauf: erkannte Anliegen, angelegte Aufgaben, Ergänztes, Übersprungenes, Offenes und Nichtausgeführtes. Ohne Ergebnis eine Warnung statt eines stillen Erledigt"
}

Diktat -> Modell: "asynchron,\nHash gegen Retries" { style.stroke: "#2563eb" }
Foto -> Modell: "Bild-Fakten" { style.stroke-dash: 4 }
Kontext -> Modell: "Duplikat-Abgleich"
Kalender -> Modell: "nur bei Terminbezug" { style.stroke-dash: 4 }
Link -> Modell: "Fremdinhalt als Daten" { style.stroke-dash: 4 }
Modell -> Entscheid
Entscheid -> ClickUp: "neu anlegen (Standard)\noder Ergänzung als Kommentar" { style.stroke: "#16a34a" }
Entscheid -> Duplikat: "eindeutiges\nDuplikat"
Entscheid -> Frage: "Angabe fehlt oder\nZuordnung unklar"
Frage -> ClickUp: "Antwort (HMAC-Token\nplus Origin-Check)" { style.stroke: "#2563eb" }
Frage -> ClickUp: "Timeout 4 h:\nFallback-Anlage" { style.stroke-dash: 4 }
Entscheid -> Quittung: "Ausgang jedes Laufs" { style.stroke: "#16a34a" }
```

Der Ablauf im Einzelnen:

1. **Eingang:** Der iOS-Kurzbefehl schickt das Diktat per POST mit Bearer-Token an den API-Host der Instanz (bei Sam todo.ackermannprivat.ch, bei Dani todo-dani). Optional kommt ein Foto über den Neu-Tab der Web-Inbox dazu ([Bedienung](#bedienung)).
2. **Links erkennen und holen:** Steckt eine URL im Text, holt der Dienst den Seiteninhalt über die Überholspur von kara-in -- normale Links im selben Lauf mit hartem Zeitbudget, LinkedIn und Instagram geparkt mit sofortiger Eingangs-Quittung ([Beilagen aus Links](#beilagen-aus-links)).
3. **Zerlegen und korrigieren:** Ein Claude-Opus-Modell im Claude-Abo ([Subscription-Modus](./index.md#verarbeitung-dual-mode)) zerlegt das Transkript in einzelne, klar umrissene Tasks und korrigiert Diktierfehler sinngemäss.
4. **Klassifizieren pro Task:** Workspace-Zuordnung (bei Sam HSLU, Privat oder unklar, bei [Single-Workspace-Instanzen](./index.md#single-workspace-modus) fix), Titel, Beschreibung und Fälligkeit -- jeder neue Task bekommt eine, direkt oder per Rückfrage. Priorität immer, vom Modell ohne Rückfrage geschätzt und notfalls vom Server auf normal gesetzt, optional Startdatum, Aufwand, Zuweisung, Checkliste und Verknüpfungen.
5. **Kontext laden und Liste wählen (List-Routing):** Das Modell bekommt den Listen-Katalog des Workspace (alle Listen mit Pfad, Beschreibung aus ClickUp und Task-Zahl -- zur Laufzeit entdeckt, Änderungen an Listen wirken ohne Deployment) sowie **alle** offenen Tasks des Workspace als Daten, je Zeile mit Liste und zugewiesener Person. Es wählt pro Task die passende Ziel-Liste; der Dienst validiert die Wahl gegen den Katalog, Unklares landet in der Standard-Liste mit einer nicht-blockierenden Listen-Rückfrage. Duplikate und Verwandtes erkennt es damit über **alle** Listen hinweg, auch wenn der bestehende Task einer anderen Person zugewiesen ist ([Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)).
6. **Entscheiden pro Task:** neu anlegen (Standard), als Kommentar an einen bestehenden Task hängen (Ergänzung) oder überspringen (eindeutiges Duplikat). Verlangt das Diktat zusätzlich eine Änderung an einem bestehenden Task aus dem Kontext, wird dieser im selben Lauf angepasst ([Task-Steuerung per Diktat](#kontext-ruckfragen-und-dialog)).
7. **Rückfragen stellen:** blockierend (der Task entsteht erst nach der Antwort, etwa bei unklarer Zuordnung) oder nicht-blockierend (der Task ist sofort da, die Antwort reichert nur an, etwa eine fehlende Fälligkeit). Fehlt allein die Fälligkeit und stellt das Modell selbst keine Frage, greift das [Datum-Netz](#kontext-ruckfragen-und-dialog) des Servers. Geantwortet wird per ntfy-Button oder in der Web-Inbox; alle verändernden Aktionen tragen HMAC-signierte Tokens plus einen exakten Origin-Check ([Exposition und Authentifizierung](./index.md#exposition-und-authentifizierung)). Timeouts: blockierend 4 Stunden (danach Fallback-Anlage mit Hinweis), nicht-blockierend 7 Tage (der Task bleibt unberührt, das Verfallen meldet ein Sammel-Push).
8. **Kalender nur bei Bedarf:** Mitgeschickte Termine zieht das Modell nur bei erkennbarem Terminbezug heran -- das spart Verarbeitung ([Kontext, Rückfragen und Dialog](#kontext-ruckfragen-und-dialog)).
9. **Quittieren:** Der Lauf endet mit genau einer Quittung, die erkannte Anliegen und angelegte Aufgaben beziffert und jeden Ausgang benennt -- auch die, die früher stumm blieben ([Bedienung](#bedienung)). Ohne jedes Ergebnis ist sie eine Warnung.
10. **Durchgehend beachtet:** Alle Kontext-Blöcke sind Daten, nie Anweisungen an das Modell (Schutz gegen eingeschleuste Befehle). Ein Hash aus Diktattext und Zeit verhindert Doppel-Anlagen bei Kurzbefehl-Retries, und unterbrochene Verarbeitungen werden beim Neustart fortgesetzt ([Persistenz und Idempotenz](#persistenz-und-idempotenz)).

::: warning Verbleibende Kontext-Grenzen
Der team-weite Kontext ist auf `CONTEXT_MAX_TASKS_PER_WORKSPACE` offene Tasks gedeckelt (fälligkeitsnahe zuerst, Kappung wird geloggt); per Env ausgeschlossene Listen (`CATALOG_EXCLUDE_LIST_IDS`) sind weder Routing-Ziel noch Duplikat-Kontext. `LIST_ROUTING=false` schaltet das Routing instanzweise auf das alte Ziel-Listen-Verhalten zurück.
:::

::: tip Kosten pro Diktat
Das Modell läuft im Claude-Abo -- pro Diktat fallen keine direkten Stückkosten an, nur Verbrauch im 5-Stunden-Abo-Fenster. Zur Grössenordnung (gemessener Richtwert, keine Abrechnung): Mit List-Routing über alle Listen (Katalog plus rund 700 offene Tasks beider Workspaces bei Sam) liegt der gemessene Prompt bei etwa 20'000 Eingabe-Tokens, im hypothetischen API-Betrieb rund 14 Rappen pro Diktat mit einem Opus-Modell und etwa die Hälfte mit einem Sonnet-Modell. Die Web-Inbox zeigt pro Task die tatsächliche Verarbeitungsdauer und einen Rappen-Richtpreis (aus dem Cache-Split). Ausgewiesen wird jeder Lauf eines Vorgangs, also auch die kleinen Anpassungs- und Antwort-Läufe sowie Wiederholungen: Die Token-Werte werden addiert statt überschrieben, weil ein Retry echte Tokens kostet, und die Zahl der Läufe steht daneben. Im Subscription-Modus tragen die Summen den Zusatz "inkl. CLI-Sockel", weil die Verbrauchsmeldung der CLI deren eigenen System-Prompt mitzählt.
:::

## Beilagen aus Links

Ein Link im erfassten Text ist eine Beilage wie ein Foto -- externer Inhalt plus Absicht. Den Seiteninhalt holt der Dienst nicht selbst, sondern über die Überholspur des Nachbardienstes [Karakeep Ingest](../karakeep-ingest/index.md), der Scrapfly, die Consent-Fallbacks und Apify schon betreibt. Die Schnittstelle ist dort beschrieben ([Überholspur für Einzel-Abrufe](../karakeep-ingest/index.md#uberholspur-fur-einzel-abrufe)), hier steht, was der Dienst mit dem Inhalt macht. Pro Erfassung werden höchstens `LINK_MAX_PER_DICTATION` (3) Links geholt.

- **Zwei Wege, eine Zusage:** Web- und YouTube-Links holt der Dienst im laufenden Verarbeitungslauf, begrenzt durch ein hartes Zeitbudget (`LINK_FETCH_TIMEOUT_MS`, 15 Sekunden). LinkedIn und Instagram brauchen einen Apify-Run und damit Minuten -- diese Erfassungen bekommen sofort die Eingangs-Quittung "Erfasst, Link wird gelesen" und werden geparkt. Die Aufgabe entsteht erst mit dem Inhalt und ist damit von Geburt an richtig geformt, statt nachträglich umgeschrieben zu werden. Nach `LINK_PARK_TIMEOUT_MS` (10 Minuten) oder bei einem Fehlschlag lässt der Dienst los.
- **Vermerk statt stillem Verlust:** Reisst das Zeitbudget, ist der Nachbardienst weg oder endet der Abruf fachlich (Consent-Wall, kein Apify-Zugang, ausgeschöpftes Tageslimit), läuft die Verarbeitung normal weiter und die Aufgabe trägt sichtbar "Link nicht gelesen (Grund)" samt URL. Das Diktat hängt damit nie an einem Fremddienst. Der Grund ist ein Anlass für den Vermerk und keiner für eine Wiederholung -- eine Consent-Wall ist beim zweiten Versuch dieselbe Wall.
- **Feld-Hoheit, serverseitig erzwungen:** Beschreibung und Kommentar darf der Link-Inhalt immer füllen, den Titel nur bei dünnem Diktat, die Liste nur als Routing-Signal. Die Fälligkeit nie direkt: Eine Frist aus dem Inhalt meldet das Modell in einem eigenen Feld, aus dem der Server die bekannte nicht-blockierende Ein-Tipp-Rückfrage macht (die Aufgabe existiert dabei schon), ein Publikationsdatum bewirkt gar nichts. Entscheidbar ist die Regel am Rohtext: Nennt das Diktat nichts Datumsartiges, kann ein gesetztes Datum nur aus dem Link stammen und wird zum Vorschlag. Nennt es keine Dringlichkeit, fällt eine hohe oder dringende Priorität auf normal zurück -- nur abwärts, nie hinauf. Der Link darf anreichern und vorschlagen, anordnen darf nur das Diktat, und weil ein Prompt keine Grenze ist, steht diese Regel im Server-Code.
- **Fremdtext im Prompt:** Der Inhalt geht als eigener Block "KONTEXT: Link-Inhalt (Daten)" in den Prompt und ist im Daten-Absatz namentlich als Fremdinhalt deklariert. Weil dieser Block anders als die Tabellen-Blöcke mehrzeilige Prosa trägt, könnte eine Marker-artige Zeile darin die Blockgrenze von innen aufmachen -- der Dienst entwertet solche Zeilen im Fremdtext darum. Der Schaden bleibt damit auf Text in Titel und Beschreibung begrenzt: Einen Termin setzen, eine Priorität heben oder eine fremde Aufgabe schliessen oder umbenennen kann ein Link-Inhalt nicht (Rechte-Staffelung wie bei der [Task-Steuerung per Diktat](#kontext-ruckfragen-und-dialog)).
- **Eigener Warteplatz, eigener Takt:** Geparkte Links liegen in der eigenen Tabelle `link_waits`, bewusst nicht bei den Rückfragen -- ein wartender Link ist reines Netz-Warten und kein offener Entscheid des Nutzers, und die Rückfrage-Datensätze hängen am HMAC-Lebenszyklus. Freigegeben wird in einem eigenen Minuten-Takt (`LINK_SWEEP_INTERVAL_MS`) statt im 15-Minuten-Sweep, weil ein nach zwei Minuten fertiger Abruf sonst bis zu dreizehn Minuten brachgelegen und die Zusage der Eingangs-Quittung gebrochen hätte. Der Takt ist billig, er fragt nur nach, wenn Zeilen warten. Das Warten blockiert die serielle Verarbeitung nicht: Der geparkte Lauf kehrt sofort zurück, die Zeit verstreicht im Takt.
- **Keine Doppel-Anlage, kein Verlust beim Neustart:** Freigegeben wird über einen atomaren Status-Flip am Diktat -- nur wer ihn gewinnt, verarbeitet weiter. Zwei überlappende Läufe oder ein gleichzeitiges Reprocess legen die Aufgaben damit nie doppelt an. Die Warte-Zeilen liegen in SQLite und überleben jeden Neustart, und die Wiederaufnahme unterbrochener Verarbeitungen fasst wartende Diktate bewusst nicht an, sondern überlässt sie dem Takt. Die Existenz der Zeilen ist zugleich das Merkmal "war schon geparkt", ein Wiedereintritt parkt deshalb nie ein zweites Mal, sondern nimmt den Inhalt aus den Zeilen. Sobald überhaupt ein Link geparkt werden muss, sichert der Dienst alle Link-Ergebnisse dieser Erfassung, damit der abgebrochene Lauf beim Wiedereintritt nichts verloren hat.
- **Lesezeichen als Nebenprodukt:** Jeder erfasste Link landet zusätzlich als Lesezeichen im Karakeep-Bestand, in der Liste "Diktat-Links". Das erledigt der Nachbardienst aus dem schon geholten Dokument mit -- ein zweiter Abruf nur für die Karte wäre reine Geldverbrennung. Ein Fehler dabei ist eine Warnung, nie ein Blocker.
- **Erledigte Ziel-Aufgabe:** Ein nachgelagerter Lauf -- ein angekommener Link-Inhalt, eine verzögerte Anpassung -- konnte Felder auf eine bereits erledigte Aufgabe schreiben und sie damit faktisch wieder aufmachen, weil die Task-Auskunft keinen Status führte. Sie liefert jetzt Status und Erledigt-Merkmal (dieselbe kanonische Auswertung wie beim Schliessen), und an einer erledigten Aufgabe ändert der Dienst kein Feld mehr, sondern hängt den Beitrag als Kommentar an und meldet das als Warnung. Der Ist-Zustand wird dafür einmal geladen und für die Rechte-Prüfung mitbenutzt.
- **Ohne Token bleibt der Zweig aus:** Die Anreicherung braucht beides -- die über Consul-DNS aufgelöste Adresse des Nachbardienstes (`KARA_IN_URL`, nie eine IP) und den Bearer-Token (`KARA_IN_TOKEN` aus Vault, wertgleich mit dem Read-Token bei kara-in). Fehlt einer davon, ist die Link-Anreicherung komplett aus und Erfassungen mit Links laufen wie vorher, mit dem Link als Rohtext in der Beschreibung.
- **Kosten:** Pro Link ein Fremddienst-Abruf, gedeckelt durch die drei Links pro Erfassung und zusätzlich durch die Tageslimits von kara-in. LinkedIn fährt dabei einen eigenen Apify-Einzel-Run statt im Batch amortisiert zu werden -- der Preis für einen interaktiven Weg.

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
- **Datum-Netz:** Liefert das Modell weder eine Fälligkeit noch eine eigene Rückfrage noch den ausdrücklichen Verzicht, stellt der Server selbst die nicht-blockierende Frage "Bis wann soll das erledigt sein?" mit den Optionen Morgen, Nächste Woche und Kein Datum. Es ist das Gegenstück zum Prioritäts-Netz, aber als Frage statt als geratenem Wert: eine Aufgabe ohne Termin entsteht nie unbemerkt. "Kein Datum" ist ein eigener Zustand -- bewusst terminlos --, der nie überschrieben wird, die Frage kein zweites Mal auslöst und in der Quittung als "Bewusst ohne Termin" erscheint. Er ist eigens so persistiert, dass er eine vorgelagerte blockierende Rückfrage überlebt. Pro Task bleibt es bei höchstens einer Frage: Ist zum Task bereits eine andere offen, greift das Netz erst nach, sobald diese beantwortet ist. Nach dem 4-Stunden-Timeout greift es bewusst nicht nach, denn dort blieb ja gerade die erste Frage unbeantwortet.
- **Dialog per Diktat:** Offene Rückfragen der letzten Stunde können mit einem neuen Diktat beantwortet werden ("bis Ende nächster Woche"); der Dienst quittiert jede angewandte Antwort per Push. Ohne klaren Bezug entsteht ein normaler neuer Task.
- **Task-Steuerung per Diktat:** Ein Diktat kann nicht nur neue To-dos erfassen und offene Rückfragen beantworten, sondern auch bestehende Tasks aus dem Kontext-Snapshot ändern -- verschieben, umpriorisieren, an eine Person delegieren, erledigen, umbenennen, Checklisten-Punkte ergänzen oder einen begleitenden Kommentar anhängen ("verschieb die Offerte auf Freitag", "das Protokoll ist erledigt", "die Sache mit dem Drucker an Dani"). Das Modell darf dabei nur Tasks treffen, die im Kontext-Snapshot stehen -- dieselbe Whitelist wie die Duplikat-Erkennung, nie fremde Task-IDs -- und ändert ausschliesslich die verlangten Felder. Innerhalb dieser Whitelist staffelt der Dienst die Rechte nach Umkehrbarkeit: Kommentar, Verknüpfung, Termin, Priorität und Checklisten-Punkte sind auf jeder Aufgabe erlaubt, Schliessen und Umbenennen nur auf einer Aufgabe, die der Dienst selbst angelegt hat und die niemand anderem zugewiesen ist. Fällt der Besitz-Check aus (etwa bei einem ClickUp-Fehler), gilt die engere Grenze. Ein abgelehnter Eingriff verpufft nicht, sondern hinterlässt einen Kommentar am Task und eine Zeile in der Quittung. Erfassen, Antworten und Steuern lassen sich in einem Diktat mischen. Die Änderungen erscheinen als eigener Block "Angepasst" in der Quittung. Die Anwendung teilt sich den Kern mit der Task-Anpassung in der Inbox (siehe [Bedienung](#bedienung)), ein Listen-Wechsel läuft weiter über die Rückfragen.
- **Freitext-Antwort in der Inbox:** In der Web-Inbox trägt jede offene Rückfrage neben den Options-Buttons ein Textfeld "Eigene Antwort" (getippt oder diktiert). Ein eigener kleiner AI-Lauf ordnet die Antwort einer der angebotenen Optionen oder direkten Werten zu -- Bereich, Ziel-Liste aus dem Listen-Katalog, Fälligkeit, Startdatum, Priorität, Aufwand oder Zuweisung -- und wendet sie über denselben Antwort-Pfad an wie ein Options-Tap. Lässt sich die Antwort keiner Option und keinem Feld zuordnen, bleibt die Rückfrage offen und der Fehlversuch erscheint mit Begründung in der Diktat-Historie. Daneben stellt "Von Hand einstellen" Datum, Priorität und Bereich direkt ohne AI-Lauf ein.
- **Kalender-Kontext (lazy):** Der Kurzbefehl kann Termine mitschicken (`calendar` oder Zeilenformat `calendar_text`). Der Diktat-Kurzbefehl liest dafür ein Fenster von 14 Tagen Vergangenheit bis 60 Tagen Zukunft, weil sich Diktate meist auf einen eben erst gewesenen Termin beziehen ("nach dem Meeting letzte Woche") -- ein rein zukünftiger Horizont traf diesen Bezug nie. Der Digest- und der Abend-Kurzbefehl bleiben bewusst bei den kommenden Terminen, denn sie planen voraus. Im Subscription-Modus gehen die Termine nicht in den Prompt, sondern als temporäre Datei mit gezielter Read-Freigabe -- das Modell liest sie nur bei Terminbezug im Diktat (Token-Ersparnis; API-Modus inline). Der Dienst nutzt sie ausschliesslich zur Auflösung relativer Datumsangaben und als Hinweis in der Beschreibung -- Termine sind nie Tasks, und die Kalenderdaten werden nach der Verarbeitung gelöscht. Kontextblöcke sind im Prompt als Daten deklariert (Injection-Härtung); Text in mitgeschickten Fotos gilt ebenfalls als Inhalt, nie als Anweisung.
- **Serielle Verarbeitung:** Es läuft genau eine Klassifikation gleichzeitig. Das schützt das Memory-Limit des Containers und garantiert, dass kurz nacheinander diktierte To-dos einander im Kontext sehen.

## Persistenz und Idempotenz

Der Betriebszustand liegt in einer SQLite-Datenbank auf dem replizierten Linstor-CSI-Volume `todo-ingest-data` (Rohtext, offene Rückfragen mit HMAC-Token und Deadline, angelegte Task-IDs, der Verzicht auf einen Termin, die Kalender-Ereignisse, die wartenden Link-Abrufe, der Verlauf je Aufgabe und die ausgehenden Quittungen). Ein Hash aus Diktattext und Zeitstempel dedupliziert die Anlage, sodass Kurzbefehl-Retries keine Duplikate erzeugen. Beim Start nimmt der Dienst unterbrochene Verarbeitungen aus der Datenbank wieder auf. Bricht eine Anlage dabei endgültig ab, meldet er das per Push, statt sie stumm liegen zu lassen.

Mitgeschickte Fotos liegen als Upload daneben. Ein erfolgreich an einen Task angehängtes Foto löscht der Dienst sofort -- was die Bereinigung später findet, ist also immer ein nicht ausgewertetes Bild und damit die einzige verbliebene Quelle seines Diktats. Solche Uploads bleiben deshalb 90 Tage liegen (`UPLOAD_RETENTION_DAYS`, nach unten auf diesen Wert geklemmt). Die frühere Frist von 7 Tagen löschte zwei Foto-Diktate unwiederbringlich, bevor es überhaupt eine Bild-Auswertung gab. Die Frist ist damit reiner Grössen-Schutz, keine Aufräum-Politik.

Auch die Quittungen sind persistiert, bevor sie unterwegs sind: Jede Meldung liegt vor dem ersten Sendeversuch in der Datenbank und wird erst bei bestätigter Zustellung als erledigt markiert. Scheitert ntfy, liefert der Sweeper sie im nächsten Takt nach -- dasselbe Muster wie bei den Rückfrage-Pushes. Bleibt eine Meldung nach mehreren Versuchen liegen (`OUTBOX_MAX_ATTEMPTS`), wird sie nicht verworfen, sondern gemeldet (siehe [Selbstüberwachung](#selbstuberwachung)). Der Beleg eines Laufs hängt damit nicht an einem gelungenen Push.

## Selbstüberwachung

Weil die Verarbeitung nach dem `202` unbeobachtet läuft, wacht der Dienst über seinen eigenen Weg vom Eingang bis zur Zustellung. Fünf deterministische Signale laufen im Takt des Sweepers und feuern nur, wenn tatsächlich etwas eingegangen ist:

- Ein Diktat hängt zu lange in "empfangen", "in Arbeit" oder "Wiederholung".
- Eine Rückfrage steht über ihrer Frist, obwohl der Sweeper läuft, der sie hätte auflösen müssen.
- Ein geparkter Link-Abruf steht weit über seiner Frist, obwohl der Minuten-Takt das Diktat hätte loslassen müssen (siehe [Beilagen aus Links](#beilagen-aus-links)). Ohne dieses Signal wäre die Eingangs-Quittung "Link wird gelesen" die letzte Nachricht, die der Nutzer zu diesem Diktat je sieht.
- Eine Quittung bleibt über mehrere Durchläufe unzustellbar (siehe [Persistenz und Idempotenz](#persistenz-und-idempotenz)).
- Die Fehlerquote der letzten Diktate liegt über der Schwelle. Gemessen wird erst bei voller Stichprobe, sonst schlägt ein einzelner Fehler nach einem Neustart sofort aus.

Jeder Zustand meldet sich höchstens einmal pro Sperrfrist, damit ein Dauerzustand nicht in jedem Takt pusht. Über den Diktat-*Rhythmus* wacht der Dienst dagegen bewusst nie: Bei zwei bis sechs Diktaten pro Tag und Nullen dazwischen erzeugt jeder Schwellwert Fehlalarme, sobald einmal eine Woche Ferien dazwischenliegt. Ergänzend kommt montags ein Wochenbericht ohne Alarm-Charakter mit Diktaten, Fehlern, offenen Rückfragen und angelegten Aufgaben der letzten sieben Tage. Alle Meldungen gehen auf dasselbe ntfy-Topic wie die Quittungen, die Alarme mit erhöhter, der Wochenbericht mit gesenkter Priorität.

## Verwandte Seiten

- [Todo Ingest Übersicht](./index.md) -- Rolle im Stack, Architektur, Dual-Mode, Instanzen, Exposition
- [ntfy](../ntfy/index.md) -- Push-Rückkanal für Quittungen und Rückfragen
- [Linstor CSI](../../storage/linstor/index.md) -- replizierter Block-Storage (DRBD) für die SQLite-Datenbank
- [Monitoring: Coverage](../../monitoring/coverage/index.md) -- Kuma-Probe und Coverage-Status
- [github.com/derever-labs/todo-ingest](https://github.com/derever-labs/todo-ingest) -- Code und Design-Doku (`docs/konzept.md`)
