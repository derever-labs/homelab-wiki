---
title: Finanzen-Website Betrieb
description: Publikation eines neuen Dokument-Stands, Kommentar-Datenbank und die Fallstricke beim manuellen Deploy
tags:
  - service
  - nomad
  - betrieb
  - dokumente
---

# Finanzen-Website Betrieb

Diese Seite beschreibt, wie ein neuer Stand auf die [Finanzen-Website](./index.md) kommt und worauf im laufenden Betrieb zu achten ist. Architektur und Zugriffs-Konzept stehen auf der Hauptseite.

## Publikation eines neuen Dokument-Stands

Ein Deploy ist bei diesem Dienst kein Code-Rollout, sondern ein **Veröffentlichungs-Akt**: Er macht einen inhaltlich freigegebenen Dokument-Stand für die Familie sichtbar. Entsprechend hängen drei Artefakte zusammen, die nur gemeinsam stimmig sind:

- die **PDFs** samt Miniaturen, die in das Web-Image eingebacken werden (sie liegen nicht im Repo und werden vor jedem Bau frisch erzeugt),
- das **Manifest**, das Titel, Stand, Seitenzahl, Version und Sichtbarkeit je Dokument führt und zugleich die Whitelist der zulässigen Dokument-IDs für die API ist,
- der **aufgelöste Dokument-Kontext** für den Frage-Bereich, der mitversioniert im Repo liegt und aus den Generator-Texten neu gerendert werden muss.

Die Schritte je Artefakt stehen dort, wo sie gepflegt werden: `website/README.md` und `website-api/README.md` im Gitea-Repo `finanzen`. Die Versionshistorie auf der Dokumentinfo-Seite gehört zur Kuratierung dazu -- sie versioniert auch die Anker der Kommentare.

::: warning Drift zwischen PDF und Manifest
Zweimal ist ein Stand live gegangen, bei dem Manifest und PDF auseinanderliefen: einmal ein veraltetes Manifest zu neuen PDFs, einmal neue Manifest-Zahlen zu alten PDFs. Beides sieht in der Übersicht plausibel aus und fällt erst im Reader auf. Der schnellste Konsistenztest ist der Seitenzähler des Viewers gegen die Seitenzahl aus der Übersichts-Karte -- zwei Werte auf einem Bildschirm. Gebaut wird deshalb immer aus einem `git archive`-Schnappschuss eines Commits und nie aus dem Arbeitsverzeichnis: Nur so ist reproduzierbar, welcher Stand im Image steckt.
:::

::: danger Nur eine Sitzung deployt
Die Kommentar-Datenbank ist produktiv und enthält die Rückmeldungen der Familie. Zwei parallel arbeitende Sitzungen haben sich schon gegenseitig überrollt; erkennbar war das nur an der **laufenden Job-Version** und den Image-Tags, nicht an der Tag-Liste in der Registry. Vor einem Deploy deshalb den Job-Status abfragen und die Version notieren. Ein Rollback auf ein früheres Image ist möglich, die Kommentare sind es nicht.
:::

## Kommentar-Datenbank

Die Kommentare liegen in einer SQLite-Datei auf dem replizierten CSI-Volume. Der API-Task migriert das Schema beim Start selbst -- nach einer Schema-Änderung gehört deshalb ein Blick ins Start-Log dazu, bevor der Stand als gelungen gilt.

Jeder Kommentar trägt die Dokument-Version, unter der er entstanden ist. Erscheint ein neuer Dokument-Stand, bleiben die Anker unangetastet: Der Reader verortet Markierungen älterer Versionen rein anzeigeseitig neu, indem er das zitierte Textstück sucht, und kennzeichnet Herkunft beziehungsweise nicht mehr zuordenbare Stellen. Der Grund für diesen Weg ist die Fehlertoleranz -- eine serverseitige Migration der Koordinaten hätte falsch verortete Kommentare erzeugt, ohne dass es jemandem aufgefallen wäre.

## Frage-Bereich im Betrieb

Der Assistent hält den Dokument-Kontext seit dem Task-Start im Speicher. Ein neuer Dokument-Stand wirkt sich also erst nach einem Neustart des API-Tasks aus, und die Zahlen im Chat stammen aus dem gerenderten Kontext im Image, nicht aus den PDFs.

Jeder Aufruf des CLI schreibt zwei Zeilen mit laufender Nummer, Modell, Antwortlänge und Dauer -- allerdings auf **stderr**. Wer die Logs des API-Tasks ohne den entsprechenden Schalter abruft, sieht nur die Zugriffszeilen des Webservers und hält den Frage-Bereich fälschlich für unbenutzt.

::: info Modellwahl und Auffangnetz
Der Frage-Bereich läuft auf einem Modell mit einem sparsameren Auffangmodell dahinter, das greift, wenn das Abo-Kontingent des ersten erschöpft ist. Das stärkste Modell war beim Test bereits am Abo-Limit und ist deshalb bewusst nicht gesetzt. Modell, Auffangmodell und Denk-Stufe stehen als Umgebungsvariablen im Job -- die Denk-Stufe ist absichtlich gepinnt, weil sich der Vorgabewert mit einer neuen CLI-Version verschieben und die Antwortqualität still verändern könnte.
:::

## Überwachung

Zwei Ebenen greifen ineinander:

- Der Nomad-Job prüft über Consul den nginx (Startseite) und die ganze Kette bis in den API-Task (Health-Pfad). Das deckt die Anwendung ab, sieht aber nichts von der Route davor.
- Der Uptime-Kuma-Monitor `Finanzen` ruft die öffentliche Adresse auf und erwartet den Redirect auf den Login. Das beweist Router, TLS und Authentik-Outpost, nicht die Anwendung dahinter -- ein auth-freier Health-Pfad existiert bewusst nicht.

Erst zusammen ergeben die beiden Ebenen ein vollständiges Bild. Details und Status: [Monitoring: Coverage](../../monitoring/coverage/index.md).

::: warning Der erste Pull dauert lang
Das API-Image trägt das claude-CLI und ist mehrere hundert Megabyte gross. Auf einem Node ohne lokale Kopie überschreitet der erste Pull samt Entpacken die üblichen Fristen deutlich -- ein Deploy lief deshalb schon in ein automatisches Zurückrollen, obwohl Registry und Netz gesund waren. Die Fristen im Job sind darauf ausgelegt und sollten nicht zurückgesetzt werden.
:::

## Verwandte Seiten

- [Finanzen-Website](./index.md) -- Architektur, Zugriffs-Konzept und Entwurfsentscheide
- [Authentik](../../edge/authentik/index.md) -- Application-Bindings und Wiederherstellungs-Links für neue Anmeldungen
- [Zot Container Registry](../../plattform/docker-registry/index.md) -- Ablage der beiden Images
- [Monitoring: Coverage](../../monitoring/coverage/index.md) -- Coverage-Eintrag des Dienstes
