---
title: Incident Post-Mortem Template
description: Vorlage fuer Post-Mortem-Eintraege bei Incidents > 2h Dauer oder Multi-Node-Impact
tags:
  - incident
  - post-mortem
  - runbook
---

# Incident Post-Mortem Template

Wenn ein Incident laenger als 2 Stunden dauert oder mehrere Nodes betrifft, wird hier ein Post-Mortem als ClickUp-Task angelegt. Ziel: aus jedem Incident strukturiertes Lernen extrahieren, nicht nur das Symptom fixen.

## Wann ein Post-Mortem

- Incident-Dauer 2h oder mehr (vom ersten Erkennen bis zur Recovery)
- Multi-Node-Impact (mehr als ein Nomad-Client oder Cross-Cluster)
- Datenverlust oder Datenkorruption (auch teilweise)
- Service-Outage fuer User sichtbar

Bei kuerzeren Hickups reicht ein Kommentar im bestehenden ClickUp-Task. Post-Mortem ist explizit fuer Sache wo wir uns Zeit nehmen und reflektieren wollen.

## Die 5 Pflicht-Felder

### 1. Was ist passiert

Eine sachliche Beschreibung der Ereignisse in chronologischer Reihenfolge. Zeitstempel UTC. Keine Schuldzuweisung, kein Hindsight-Bias. Was gesehen wurde, in welcher Reihenfolge.

### 2. Warum ist es passiert

Die Ursache (oder Ursachen-Kette). Idealerweise mit "5 Whys" durchgegangen. Wenn die echte Ursache unklar bleibt, das auch dokumentieren statt zu spekulieren.

### 3. Was haben wir gelernt

Was war ueberraschend? Was hat funktioniert wie erwartet? Welche Annahmen haben sich als falsch erwiesen? Was ist die nicht-offensichtliche Erkenntnis?

### 4. Was aendern wir

Konkrete Aktionen die aus dem Incident folgen. Pro Aktion: Aufwand-Schaetzung, Owner, Deadline. Wenn keine Aktion folgt: explizit "Restrisiko akzeptiert weil ..." dokumentieren.

### 5. ClickUp-Task-Link

Verknuepfung zum Tracking-Task fuer die Aktionen aus Punkt 4. Wenn mehrere Tasks: alle verlinken.

## Schreibhinweise

- Schweizer Rechtschreibung
- Echte Umlaute (nicht ae/oe/ue)
- Sachlich, blameless -- es geht um Systeme nicht Personen
- Konkret mit Zeitstempel, Hostnamen, Versionsnummern
- Wenn etwas geraten wird: explizit als "Hypothese" kennzeichnen

## Bezug

- Trigger fuer dieses Template: Operational-Maturity-Review 2026-04-29
- Beispiel-Incident der ein Post-Mortem haette ausloesen sollen: Docker-Restart-broken-pipe-Kette 2026-04-17 bis 2026-04-29 (12 Tage Incident-Serie, Multi-Cluster)
- Verwandt: cluster-restart.md, docker-major-update.md, smart-shutdown.md
